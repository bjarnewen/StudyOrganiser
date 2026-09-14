// Study Organiser — iPad / iPhone Home Screen widget (Scriptable)
//
// Reads the same private gist the app syncs to, so it always shows what the app
// shows. Run it once inside Scriptable to paste in your token; after that it
// refreshes on its own and keeps a local copy so it still renders offline.
//
// Setup is in the project README, under "Widgets".

const GIST_FILENAME = 'study-organiser.json';
const TOKEN_KEY = 'studyOrganiser.token';
const GIST_KEY = 'studyOrganiser.gistId';
const CACHE_FILE = 'study-organiser-cache.json';
const ACCENT = new Color('#0a84ff');

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
        // One list in a fixed order, so both widgets show the same thing in the
        // same sequence: work due by this class first, then what to check
        // before it.
        items: [
          ...due.map((a) => ({ kind: 'assignment', text: a.title, priority: a.priority })),
          ...checks.map((item) => ({ kind: 'check', text: item.text })),
        ],
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

// ----------------------------------------------------------------- credentials

async function promptForToken() {
  const alert = new Alert();
  alert.title = 'Study Organiser';
  alert.message = 'Paste the same GitHub token the app uses (a classic token with only the "gist" scope).';
  alert.addSecureTextField('ghp_…');
  alert.addAction('Save');
  alert.addCancelAction('Cancel');
  const choice = await alert.present();
  if (choice === -1) return null;
  const token = alert.textFieldValue(0).trim();
  if (!token) return null;
  Keychain.set(TOKEN_KEY, token);
  return token;
}

function storedToken() {
  return Keychain.contains(TOKEN_KEY) ? Keychain.get(TOKEN_KEY) : null;
}

async function githubRequest(path, token) {
  const request = new Request(`https://api.github.com${path}`);
  request.headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const json = await request.loadJSON();
  if (request.response.statusCode >= 400) {
    throw new Error(`GitHub returned ${request.response.statusCode}`);
  }
  return json;
}

/// Finds the app's gist by the file it writes, so there is no id to copy across.
async function findGistId(token) {
  if (Keychain.contains(GIST_KEY)) return Keychain.get(GIST_KEY);
  const gists = await githubRequest('/gists?per_page=100', token);
  const match = gists.find((gist) => gist.files && gist.files[GIST_FILENAME]);
  if (!match) throw new Error('No Study Organiser gist on this account yet — open the app and set up sync first.');
  Keychain.set(GIST_KEY, match.id);
  return match.id;
}

// ------------------------------------------------------------------- the data

function cachePath() {
  const manager = FileManager.local();
  return manager.joinPath(manager.cacheDirectory(), CACHE_FILE);
}

function readCache() {
  const manager = FileManager.local();
  const path = cachePath();
  if (!manager.fileExists(path)) return null;
  try {
    return JSON.parse(manager.readString(path));
  } catch {
    return null;
  }
}

function writeCache(doc) {
  try {
    FileManager.local().writeString(cachePath(), JSON.stringify(doc));
  } catch {
    // A missing cache only costs us the offline view.
  }
}

async function loadDocument() {
  const token = storedToken();
  if (!token) return { doc: readCache(), error: 'Open this script in Scriptable to add your token.' };

  try {
    const gistId = await findGistId(token);
    const gist = await githubRequest(`/gists/${gistId}`, token);
    const file = gist.files && gist.files[GIST_FILENAME];
    if (!file) throw new Error('The sync gist has no data file yet.');
    const content = file.truncated && file.raw_url
      ? await new Request(file.raw_url).loadString()
      : file.content;
    const doc = JSON.parse(content);
    writeCache(doc);
    return { doc, error: null };
  } catch (error) {
    // Falling back to the cached copy matters most exactly when it fails.
    return { doc: readCache(), error: error.message, stale: true };
  }
}

// ------------------------------------------------------------------ rendering

function colorFromHex(hex) {
  try {
    return new Color(`#${String(hex).replace('#', '')}`);
  } catch {
    return ACCENT;
  }
}

function addHeader(widget, agenda, stale) {
  const row = widget.addStack();
  row.centerAlignContent();

  const title = row.addText('Today');
  title.font = Font.semiboldSystemFont(13);
  title.textColor = ACCENT;

  row.addSpacer();

  const count = agenda.classes.length;
  const label = row.addText(stale ? 'offline' : `${count} ${count === 1 ? 'class' : 'classes'}`);
  label.font = Font.systemFont(11);
  label.textColor = Color.gray();

  widget.addSpacer(6);
}

function addItemRow(widget, item, compact) {
  const row = widget.addStack();
  row.spacing = 5;
  row.addSpacer(compact ? 9 : 11);

  const marker = row.addText(item.kind === 'assignment' ? '●' : '○');
  marker.font = Font.systemFont(compact ? 8 : 9);
  marker.textColor = item.kind === 'assignment' ? new Color('#ff3b30') : new Color('#ffd60a');

  const text = row.addText(item.text);
  text.font = Font.systemFont(compact ? 9.5 : 10.5);
  text.textColor = item.kind === 'assignment' ? new Color('#ff3b30') : new Color('#ffd60a');
  text.lineLimit = 1;

  row.addSpacer();
}

function addClassRow(widget, entry, { compact }) {
  const row = widget.addStack();
  row.centerAlignContent();
  row.spacing = 6;

  const rail = row.addStack();
  rail.backgroundColor = colorFromHex(entry.colorHex);
  rail.cornerRadius = 2;
  rail.size = new Size(3, compact ? 14 : 18);
  rail.addSpacer();

  const time = row.addText(entry.time);
  time.font = Font.mediumSystemFont(compact ? 11 : 12);
  time.textColor = entry.isPast ? Color.gray() : Color.dynamic(Color.black(), Color.white());
  time.lineLimit = 1;

  const name = row.addText(entry.subjectName);
  name.font = Font.systemFont(compact ? 11 : 12);
  name.textColor = entry.isPast ? Color.gray() : Color.dynamic(Color.black(), Color.white());
  name.lineLimit = 1;

  row.addSpacer();

  if (entry.reminderCount > 0) {
    const flag = row.addText(`⚑${entry.reminderCount}`);
    flag.font = Font.boldSystemFont(compact ? 10 : 11);
    flag.textColor = new Color('#ff3b30');
  }

}

function buildWidget(agenda, { error, stale }) {
  const widget = new ListWidget();
  widget.setPadding(12, 12, 12, 12);
  widget.url = 'https://bjarnewen.github.io/StudyOrganiser/';

  const family = config.widgetFamily || 'medium';
  const compact = family === 'small';
  const maxRows = family === 'small' ? 3 : (family === 'large' ? 9 : 4);

  addHeader(widget, agenda, stale);

  if (!agenda || agenda.empty) {
    const message = widget.addText(error || 'No classes today.');
    message.font = Font.systemFont(12);
    message.textColor = Color.gray();
    message.lineLimit = 3;
    widget.addSpacer();
    return widget;
  }

  // Listing what is due under each class costs vertical space, and a widget
  // that overflows just clips. So detail lines come out of a fixed budget:
  // the earliest classes get them, and the rest keep their flag count.
  let itemBudget = family === 'small' ? 0 : (family === 'large' ? 7 : 2);

  const shown = agenda.classes.slice(0, maxRows);
  for (const entry of shown) {
    addClassRow(widget, entry, { compact });
    for (const item of entry.items) {
      if (itemBudget <= 0) break;
      addItemRow(widget, item, compact);
      itemBudget -= 1;
    }
    widget.addSpacer(compact ? 3 : 5);
  }

  const hidden = agenda.classes.length - shown.length;
  if (hidden > 0) {
    const more = widget.addText(`+${hidden} more`);
    more.font = Font.systemFont(10);
    more.textColor = Color.gray();
  }

  if (!compact && agenda.dueToday.length > 0) {
    widget.addSpacer(4);
    const overdue = agenda.overdueCount > 0 ? `${agenda.overdueCount} overdue · ` : '';
    const due = widget.addText(`${overdue}${agenda.dueToday.length} due`);
    due.font = Font.mediumSystemFont(11);
    due.textColor = agenda.overdueCount > 0 ? new Color('#ff3b30') : Color.gray();
  }

  widget.addSpacer();
  return widget;
}

// ----------------------------------------------------------------------- main

if (!storedToken() && !config.runsInWidget) {
  await promptForToken();
}

const { doc, error, stale } = await loadDocument();
const agenda = buildAgenda(doc, { use24Hour: true });
const widget = buildWidget(agenda, { error, stale });

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
