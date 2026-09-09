// Port of Sources/Views/Assignments/AssignmentsView.swift

import { assignmentRow, emptyState } from '../components.js';
import { el, escapeHtml } from '../ui.js';
import { icon } from '../icons.js';

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function groupAssignments(assignments) {
  const today = startOfToday();
  return {
    overdue: assignments.filter((a) => !a.isCompleted && a.dueDate < today),
    upcoming: assignments.filter((a) => !a.isCompleted && a.dueDate >= today),
    completed: assignments.filter((a) => a.isCompleted),
  };
}

export function render(context) {
  const { store, state } = context;
  const subjects = store.all('subjects').sort((a, b) => a.name.localeCompare(b.name));
  const all = store.all('assignments').sort((a, b) => a.dueDate - b.dueDate);

  const filterSubjectId = state.assignmentFilterSubjectId;
  const filterStillValid = filterSubjectId && store.get('subjects', filterSubjectId);
  const filtered = filterStillValid
    ? all.filter((assignment) => assignment.subjectId === filterSubjectId)
    : all;

  const { overdue, upcoming, completed } = groupAssignments(filtered);

  function group(title, rows, emptyMessage) {
    if (rows.length === 0 && !emptyMessage) return '';
    const body = rows.length === 0
      ? `<p class="group-empty">${escapeHtml(emptyMessage)}</p>`
      : rows.map((a) => assignmentRow(a, store.get('subjects', a.subjectId))).join('');
    return `
      <section class="group">
        <h2 class="group-header">${escapeHtml(title)}</h2>
        <div class="list-card">${body}</div>
      </section>`;
  }

  const filterOptions = [
    `<option value="">All Subjects</option>`,
    ...subjects.map((subject) => `<option value="${escapeHtml(subject.id)}" ${subject.id === filterSubjectId ? 'selected' : ''}>${escapeHtml(subject.name)}</option>`),
  ].join('');

  const body = all.length === 0
    ? emptyState('checklist', 'No assignments yet. Add one to get started.')
    : `
      ${group('Overdue', overdue)}
      ${group('Upcoming', upcoming, 'Nothing upcoming')}
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
