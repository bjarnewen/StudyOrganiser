// Study Organiser — macOS desktop widget (Übersicht)
//
// Reads the same private gist the app syncs to. Credentials live in
// ~/.config/study-organiser/widget.json, not in this file, so the widget can be
// shared or committed without leaking a token:
//
//   { "token": "ghp_…", "gistId": "…" }
//
// Setup is in the project README, under "Widgets".

export const refreshFrequency = 300000; // five minutes

// Reads the config, fetches the gist, and prints the data file. Any failure
// prints an {"error": …} object so render() can say what went wrong instead of
// showing an empty widget.
export const command = `
  CONFIG="$HOME/.config/study-organiser/widget.json"
  if [ ! -f "$CONFIG" ]; then
    echo '{"error":"No config at ~/.config/study-organiser/widget.json"}'; exit 0
  fi
  TOKEN=$(/usr/bin/python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("token",""))' "$CONFIG")
  GIST=$(/usr/bin/python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("gistId",""))' "$CONFIG")
  if [ -z "$TOKEN" ]; then echo '{"error":"No token in the config file"}'; exit 0; fi
  if [ -z "$GIST" ]; then
    GIST=$(/usr/bin/curl -sS -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
      "https://api.github.com/gists?per_page=100" \
      | /usr/bin/python3 -c 'import json,sys
gists = json.load(sys.stdin)
match = next((g for g in gists if "study-organiser.json" in (g.get("files") or {})), None)
print(match["id"] if match else "")')
  fi
  if [ -z "$GIST" ]; then echo '{"error":"No Study Organiser gist on this account"}'; exit 0; fi
  /usr/bin/curl -sS -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/gists/$GIST" \
    | /usr/bin/python3 -c 'import json,sys
try:
    gist = json.load(sys.stdin)
    files = gist.get("files") or {}
    entry = files.get("study-organiser.json")
    if not entry:
        print(json.dumps({"error": "The sync gist has no data file yet"}))
    else:
        print(entry.get("content") or "{}")
except Exception as error:
    print(json.dumps({"error": str(error)}))'
`;

// --- shared agenda logic, generated from widgets/src/agenda-core.js ---
// Do not edit here; edit the source and run: node scripts/build-widgets.mjs
// Works out "today" from the synced document. Shared by both widgets, which is
// why it is plain script rather than a module: the build step inlines it into
// the Scriptable and Übersicht files, so the two can never drift apart.
//
// The document is exactly what the app syncs to the gist, so the widgets need
// no endpoint of their own.

function liveRecords(collection) {
  if (!collection || typeof collection !== 'object') return [];
  return Object.values(collection).filter((record) => record && !record.deletedAt);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatMinutes(minutes, use24Hour) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  if (use24Hour) return `${pad2(hour)}:${pad2(minute)}`;
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${pad2(minute)}${suffix}`;
}

function localDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/// The next class of a course, of any type — a tutorial counts as readily as a
/// lecture. Matches the rule the app itself uses for "due by next class".
function nextOccurrenceForSubject(occurrences, subjectId, dateKey, minutesNow) {
  let best = null;
  for (const occurrence of occurrences) {
    if (occurrence.subjectId !== subjectId) continue;
    if (occurrence.date < dateKey) continue;
    if (occurrence.date === dateKey && occurrence.startMinutes < minutesNow) continue;
    if (!best
      || occurrence.date < best.date
      || (occurrence.date === best.date && occurrence.startMinutes < best.startMinutes)) {
      best = occurrence;
    }
  }
  return best;
}

/// Everything the widget needs for one glance at the day.
function buildAgenda(doc, options) {
  const settings = options || {};
  const now = settings.now ? new Date(settings.now) : new Date();
  const dateKey = settings.dateKey || localDateKey(now);
  const minutesNow = settings.minutesNow !== undefined
    ? settings.minutesNow
    : now.getHours() * 60 + now.getMinutes();
  const use24Hour = settings.use24Hour !== false;

  if (!doc || typeof doc !== 'object') {
    return { date: dateKey, classes: [], dueToday: [], overdueCount: 0, empty: true };
  }

  const subjects = new Map(liveRecords(doc.subjects).map((subject) => [subject.id, subject]));
  const occurrences = liveRecords(doc.occurrences);
  const assignments = liveRecords(doc.assignments).filter((assignment) => !assignment.isCompleted);
  const checkItems = liveRecords(doc.checkItems).filter((item) => !item.isResolved);

  const classes = occurrences
    .filter((occurrence) => occurrence.date === dateKey)
    .sort((a, b) => a.startMinutes - b.startMinutes)
    .map((occurrence) => {
      const subject = subjects.get(occurrence.subjectId);
      const next = nextOccurrenceForSubject(occurrences, occurrence.subjectId, dateKey, minutesNow);
      const isNext = Boolean(next && next.id === occurrence.id);

      // Work only counts against the class it is actually due by.
      const due = isNext
        ? assignments.filter((a) => a.dueMode === 'class' && a.dueSubjectId === occurrence.subjectId)
        : [];
      const checks = isNext
        ? checkItems.filter((item) => item.subjectId === occurrence.subjectId)
        : [];

      return {
        id: occurrence.id,
        startMinutes: occurrence.startMinutes,
        endMinutes: occurrence.endMinutes,
        time: formatMinutes(occurrence.startMinutes, use24Hour),
        timeRange: `${formatMinutes(occurrence.startMinutes, use24Hour)}–${formatMinutes(occurrence.endMinutes, use24Hour)}`,
        subjectName: (subject && subject.name) || occurrence.title || 'Class',
        colorHex: (subject && subject.colorHex) || '0A84FF',
        type: occurrence.type || 'Other',
        location: occurrence.location || '',
        isPast: occurrence.endMinutes <= minutesNow,
        isNext,
        due: due.map((a) => ({ title: a.title, priority: a.priority })),
        checks: checks.map((item) => ({ text: item.text })),
        reminderCount: due.length + checks.length,
      };
    });

  // Date-based work, which belongs to the day rather than to a class.
  const startOfToday = new Date(`${dateKey}T00:00:00`).getTime();
  const endOfToday = startOfToday + 86400000;
  const dated = assignments.filter((a) => a.dueMode !== 'class' && typeof a.dueDate === 'number');

  const dueToday = dated
    .filter((a) => a.dueDate < endOfToday)
    .sort((a, b) => a.dueDate - b.dueDate)
    .map((a) => {
      const subject = subjects.get(a.subjectId);
      return {
        title: a.title,
        subjectName: subject ? subject.name : '',
        priority: a.priority,
        isOverdue: a.dueDate < startOfToday,
      };
    });

  return {
    date: dateKey,
    classes,
    dueToday,
    overdueCount: dueToday.filter((a) => a.isOverdue).length,
    empty: classes.length === 0 && dueToday.length === 0,
  };
}
// --- end shared agenda logic ---

export const className = `
  top: 40px;
  right: 40px;
  width: 300px;
  font-family: -apple-system, "SF Pro Text", system-ui, sans-serif;
  color: #fff;
  -webkit-font-smoothing: antialiased;

  .so-card {
    background: rgba(28, 28, 30, 0.72);
    backdrop-filter: blur(24px) saturate(160%);
    border-radius: 16px;
    padding: 14px 16px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
  }
  .so-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
  .so-title { font-size: 13px; font-weight: 600; color: #0a84ff; letter-spacing: 0.01em; }
  .so-count { font-size: 11px; color: rgba(235, 235, 245, 0.6); }
  .so-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
  .so-rail { width: 3px; align-self: stretch; min-height: 18px; border-radius: 2px; flex: none; }
  .so-time { font-size: 12px; font-variant-numeric: tabular-nums; min-width: 42px; }
  .so-name { font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .so-flag { font-size: 11px; font-weight: 700; color: #ff453a; }
  .so-past { opacity: 0.42; }
  .so-detail { font-size: 10.5px; color: #ff453a; margin: -2px 0 2px 51px; }
  .so-foot { margin-top: 8px; font-size: 11px; color: rgba(235, 235, 245, 0.6); }
  .so-foot.so-overdue { color: #ff453a; font-weight: 600; }
  .so-empty { font-size: 12px; color: rgba(235, 235, 245, 0.6); }
`;

export const render = ({ output }) => {
  let doc = null;
  let error = null;
  try {
    doc = JSON.parse(output);
    if (doc && doc.error) { error = doc.error; doc = null; }
  } catch (parseError) {
    error = 'Could not read the data from GitHub.';
  }

  const agenda = buildAgenda(doc, { use24Hour: true });

  if (error || agenda.empty) {
    return (
      <div className="so-card">
        <div className="so-head">
          <span className="so-title">Today</span>
        </div>
        <div className="so-empty">{error || 'No classes today.'}</div>
      </div>
    );
  }

  return (
    <div className="so-card">
      <div className="so-head">
        <span className="so-title">Today</span>
        <span className="so-count">
          {agenda.classes.length} {agenda.classes.length === 1 ? 'class' : 'classes'}
        </span>
      </div>

      {agenda.classes.map((entry) => (
        <div key={entry.id}>
          <div className={entry.isPast ? 'so-row so-past' : 'so-row'}>
            <div className="so-rail" style={{ background: `#${entry.colorHex}` }} />
            <span className="so-time">{entry.time}</span>
            <span className="so-name">{entry.subjectName}</span>
            {entry.reminderCount > 0 && <span className="so-flag">⚑{entry.reminderCount}</span>}
          </div>
          {entry.due.length > 0 && (
            <div className="so-detail">{entry.due.map((d) => d.title).join(', ')}</div>
          )}
        </div>
      ))}

      {agenda.dueToday.length > 0 && (
        <div className={agenda.overdueCount > 0 ? 'so-foot so-overdue' : 'so-foot'}>
          {agenda.overdueCount > 0 ? `${agenda.overdueCount} overdue · ` : ''}
          {agenda.dueToday.length} due
        </div>
      )}
    </div>
  );
};
