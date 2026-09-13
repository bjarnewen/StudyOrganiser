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

export { buildAgenda, formatMinutes, localDateKey };
