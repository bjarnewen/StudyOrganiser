// Date and lookup helpers shared by the views. Everything here reads dated
// occurrences, so nothing shows on a day a class isn't actually taught.

import { dateKey, dateFromKey } from './ics.js';

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function todayKey() {
  return dateKey(new Date());
}

export function minutesNow() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/// The next `count` working days starting from `from`. A weekend start rolls
/// forward to Monday, so Saturday and Sunday never appear anywhere.
export function upcomingWorkingDays(from = new Date(), count = 2) {
  const days = [];
  let cursor = new Date(from);
  while (days.length < count) {
    if (!isWeekend(cursor)) days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}

/// Monday of the week containing `date`.
export function startOfWeek(date) {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

/// Monday-to-Friday of the week containing `date`.
export function workingWeek(date) {
  const monday = startOfWeek(date);
  return [0, 1, 2, 3, 4].map((offset) => addDays(monday, offset));
}

export function occurrencesOn(store, key) {
  return store.all('occurrences')
    .filter((occurrence) => occurrence.date === key)
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

export function occurrencesBetween(store, fromKey, toKey) {
  return store.all('occurrences')
    .filter((occurrence) => occurrence.date >= fromKey && occurrence.date <= toKey)
    .sort((a, b) => (a.date === b.date ? a.startMinutes - b.startMinutes : a.date.localeCompare(b.date)));
}

/// The next class of a course, whatever its type — a lecture and a tutorial
/// both count, whichever comes first. This is what "due by the next class" and
/// "check before the next class" both resolve against.
export function nextOccurrenceForSubject(store, subjectId, { fromKey = todayKey(), fromMinutes = minutesNow() } = {}) {
  if (!subjectId) return null;
  let best = null;
  for (const occurrence of store.all('occurrences')) {
    if (occurrence.subjectId !== subjectId) continue;
    if (occurrence.date < fromKey) continue;
    if (occurrence.date === fromKey && occurrence.startMinutes < fromMinutes) continue;
    if (!best
      || occurrence.date < best.date
      || (occurrence.date === best.date && occurrence.startMinutes < best.startMinutes)) {
      best = occurrence;
    }
  }
  return best;
}

/// When an assignment is actually due, as a timestamp, so date-based and
/// class-based assignments can be sorted together.
export function effectiveDueAt(store, assignment) {
  if (assignment.dueMode !== 'class') return assignment.dueDate;
  const occurrence = nextOccurrenceForSubject(store, assignment.dueSubjectId);
  if (!occurrence) return null; // course finished, or nothing imported yet
  const date = dateFromKey(occurrence.date);
  date.setHours(Math.floor(occurrence.startMinutes / 60), occurrence.startMinutes % 60, 0, 0);
  return date.getTime();
}

/// Assignments that fall due at or before a given class of that course.
export function assignmentsDueAtOccurrence(store, occurrence) {
  return store.all('assignments').filter((assignment) => {
    if (assignment.isCompleted) return false;
    if (assignment.dueMode !== 'class') return false;
    if (assignment.dueSubjectId !== occurrence.subjectId) return false;
    const next = nextOccurrenceForSubject(store, assignment.dueSubjectId);
    return next && next.id === occurrence.id;
  });
}

export function openCheckItems(store, subjectId) {
  return store.all('checkItems')
    .filter((item) => item.subjectId === subjectId && !item.isResolved)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function allCheckItems(store, subjectId) {
  return store.all('checkItems')
    .filter((item) => item.subjectId === subjectId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/// What a class in the Today view should warn about: work due by it, and
/// things noted to check before it.
export function remindersForOccurrence(store, occurrence) {
  const next = nextOccurrenceForSubject(store, occurrence.subjectId);
  const isNext = next && next.id === occurrence.id;
  if (!isNext) return { assignments: [], checkItems: [], total: 0 };
  const assignments = assignmentsDueAtOccurrence(store, occurrence);
  const checkItems = openCheckItems(store, occurrence.subjectId);
  return { assignments, checkItems, total: assignments.length + checkItems.length };
}

export function formatDayHeading(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatShortDay(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export { dateKey, dateFromKey };
