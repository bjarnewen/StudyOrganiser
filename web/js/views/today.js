// Today: the classes you have today and on the next working day, plus what's
// due. Weekends are never shown — on a Saturday this rolls forward to Monday
// and Tuesday.

import { occurrenceRow, assignmentRow, checkItemRow, emptyState, sectionHeader } from '../components.js';
import { el, escapeHtml } from '../ui.js';
import {
  upcomingWorkingDays, occurrencesOn, remindersForOccurrence, dateKey,
  formatDayHeading, effectiveDueAt, nextOccurrenceForSubject,
} from '../schedule.js';

const DAYS_SHOWN = 2;

export function render(context) {
  const { store } = context;
  const days = upcomingWorkingDays(new Date(), DAYS_SHOWN);
  const today = dateKey(new Date());

  const dayBlocks = days.map((date, index) => {
    const key = dateKey(date);
    const occurrences = occurrencesOn(store, key);
    const label = key === today ? 'Today' : (index === 1 && days.length > 1 ? 'Next working day' : 'Coming up');

    const body = occurrences.length === 0
      ? emptyState('cup.and.saucer', key === today ? 'No classes today. Enjoy the break!' : 'No classes scheduled.')
      : `<div class="stack">${occurrences.map((occurrence) => {
          const reminders = remindersForOccurrence(store, occurrence);
          return occurrenceRow(occurrence, store.get('subjects', occurrence.subjectId), { reminderCount: reminders.total });
        }).join('')}</div>`;

    return `
      <section class="day-block">
        <h2 class="section-header">
          <span class="day-label">${escapeHtml(label)}</span>
          <span class="day-date">${escapeHtml(formatDayHeading(date))}</span>
        </h2>
        ${body}
      </section>`;
  }).join('');

  // Everything still open, ordered by when it actually falls due — date-based
  // and class-based assignments sorted together.
  const pending = store.all('assignments')
    .filter((assignment) => !assignment.isCompleted)
    .map((assignment) => ({ assignment, due: effectiveDueAt(store, assignment) }))
    .sort((a, b) => {
      if (a.due === null) return 1;
      if (b.due === null) return -1;
      return a.due - b.due;
    });

  const openChecks = store.all('checkItems')
    .filter((item) => !item.isResolved)
    .map((item) => ({ item, next: nextOccurrenceForSubject(store, item.subjectId) }))
    .sort((a, b) => {
      if (!a.next) return 1;
      if (!b.next) return -1;
      return a.next.date.localeCompare(b.next.date);
    });

  const todaysCount = occurrencesOn(store, today).length;

  const dueHtml = pending.length === 0
    ? emptyState('checkmark.circle.fill', "Nothing due. You're all caught up!")
    : `<div class="list-card">${pending.slice(0, 6).map(({ assignment }) =>
        assignmentRow(store, assignment, store.get('subjects', assignment.subjectId))).join('')}</div>`;

  const checksHtml = openChecks.length === 0 ? '' : `
    ${sectionHeader('Check Before Class', 'checklist')}
    <div class="list-card">${openChecks.slice(0, 6).map(({ item, next }) =>
      checkItemRow(item, store.get('subjects', item.subjectId), next)).join('')}</div>`;

  return el(`
    <div class="view view-today">
      <header class="page-header">
        <h1>${escapeHtml(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</h1>
        <p class="subtitle">${todaysCount} ${todaysCount === 1 ? 'class' : 'classes'} today · ${pending.length} ${pending.length === 1 ? 'assignment' : 'assignments'} pending</p>
      </header>
      ${dayBlocks}
      ${sectionHeader('Due Soon', 'flag.fill')}
      ${dueHtml}
      ${checksHtml}
    </div>`);
}
