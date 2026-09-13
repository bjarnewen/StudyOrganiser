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

//__AGENDA_CORE__

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
