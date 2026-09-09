// Assignments, plus the separate "check before the next class" list those
// pop-up notes feed into.

import { assignmentRow, checkItemRow, emptyState } from '../components.js';
import { el, escapeHtml } from '../ui.js';
import { icon } from '../icons.js';
import { effectiveDueAt, nextOccurrenceForSubject } from '../schedule.js';
import { currentlyTaughtSubjectIds } from '../blocks.js';

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function groupAssignments(store, assignments) {
  const today = startOfToday();
  const withDue = assignments.map((assignment) => ({ assignment, due: effectiveDueAt(store, assignment) }));
  const byDue = (a, b) => {
    if (a.due === null) return 1;
    if (b.due === null) return -1;
    return a.due - b.due;
  };
  return {
    overdue: withDue.filter((x) => !x.assignment.isCompleted && x.due !== null && x.due < today).sort(byDue),
    upcoming: withDue.filter((x) => !x.assignment.isCompleted && (x.due === null || x.due >= today)).sort(byDue),
    completed: withDue.filter((x) => x.assignment.isCompleted).sort(byDue),
  };
}

export function render(context) {
  const { store, state } = context;
  const subjects = store.all('subjects').sort((a, b) => a.name.localeCompare(b.name));
  const all = store.all('assignments');

  const filterSubjectId = state.assignmentFilterSubjectId;
  const filterValid = filterSubjectId && store.get('subjects', filterSubjectId);
  const filtered = filterValid ? all.filter((a) => a.subjectId === filterSubjectId) : all;
  const { overdue, upcoming, completed } = groupAssignments(store, filtered);

  function group(title, rows, emptyMessage) {
    if (rows.length === 0 && !emptyMessage) return '';
    const body = rows.length === 0
      ? `<p class="group-empty">${escapeHtml(emptyMessage)}</p>`
      : rows.map(({ assignment }) => assignmentRow(store, assignment, store.get('subjects', assignment.subjectId))).join('');
    return `
      <section class="group">
        <h2 class="group-header">${escapeHtml(title)}</h2>
        <div class="list-card">${body}</div>
      </section>`;
  }

  // The class pop-up's notes live here too, kept apart from real assignments.
  const checkItems = store.all('checkItems')
    .filter((item) => (filterValid ? item.subjectId === filterSubjectId : true))
    .map((item) => ({ item, next: nextOccurrenceForSubject(store, item.subjectId) }))
    .sort((a, b) => {
      if (a.item.isResolved !== b.item.isResolved) return a.item.isResolved ? 1 : -1;
      if (!a.next) return 1;
      if (!b.next) return -1;
      return a.next.date.localeCompare(b.next.date);
    });

  const checkSection = checkItems.length === 0 ? '' : `
    <section class="group">
      <h2 class="group-header">Check Before Next Class</h2>
      <div class="list-card">
        ${checkItems.map(({ item, next }) => checkItemRow(item, store.get('subjects', item.subjectId), next)).join('')}
      </div>
      <p class="field-hint">Added by tapping a class in Today or Schedule. Each one is tied to that course's next class, whether that's a lecture or a tutorial.</p>
    </section>`;

  const taught = currentlyTaughtSubjectIds(store);
  const filterOptions = [
    '<option value="">All Subjects</option>',
    ...subjects
      .filter((subject) => !taught || taught.has(subject.id) || subject.id === filterSubjectId)
      .map((subject) => `<option value="${escapeHtml(subject.id)}" ${subject.id === filterSubjectId ? 'selected' : ''}>${escapeHtml(subject.name)}</option>`),
  ].join('');

  const body = all.length === 0 && checkItems.length === 0
    ? emptyState('checklist', 'No assignments yet. Add one to get started.')
    : `
      ${group('Overdue', overdue)}
      ${group('Upcoming', upcoming, 'Nothing upcoming')}
      ${checkSection}
      ${group('Completed', completed)}`;

  return el(`
    <div class="view view-assignments">
      <header class="page-header with-actions">
        <h1>Assignments</h1>
        <div class="header-actions">
          <label class="filter-select">
            ${icon('line.3.horizontal.decrease.circle')}
            <select data-subject-filter aria-label="Filter by subject">${filterOptions}</select>
          </label>
          <button type="button" class="primary-button" data-add-assignment>${icon('plus')}<span>Add</span></button>
        </div>
      </header>
      ${body}
    </div>`);
}
