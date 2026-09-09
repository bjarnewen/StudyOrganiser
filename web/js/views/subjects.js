// Port of Sources/Views/Subjects/SubjectsView.swift

import { emptyState } from '../components.js';
import { el, escapeHtml } from '../ui.js';
import { icon } from '../icons.js';
import { subjectColor } from '../domain.js';

/// Distinct classes (by matchKey), not raw schedule entry rows — a calendar that
/// publishes each week's occurrence as its own event would otherwise inflate
/// this into a much larger, meaningless number.
export function distinctClassCount(store, subjectId) {
  const keys = new Set(
    store.all('scheduleEntries')
      .filter((entry) => entry.subjectId === subjectId)
      .map((entry) => entry.matchKey),
  );
  return keys.size;
}

export function render(context) {
  const { store } = context;
  const subjects = store.all('subjects').sort((a, b) => a.name.localeCompare(b.name));

  const rows = subjects.map((subject) => {
    const classes = distinctClassCount(store, subject.id);
    const assignments = store.all('assignments').filter((a) => a.subjectId === subject.id).length;
    const links = store.all('links').filter((l) => l.subjectId === subject.id).length;
    const linkChip = links > 0 ? ` · ${links} ${links === 1 ? 'link' : 'links'}` : '';
    return `
      <button type="button" class="subject-row" data-subject-id="${escapeHtml(subject.id)}">
        <span class="subject-dot large" style="background:${subjectColor(subject.colorHex)}"></span>
        <span class="subject-row-main">
          <span class="row-title">${escapeHtml(subject.name)}</span>
          <span class="row-details"><span class="row-meta">${classes} ${classes === 1 ? 'class' : 'classes'} · ${assignments} ${assignments === 1 ? 'assignment' : 'assignments'}${linkChip}</span></span>
        </span>
        ${icon('chevron.right', { className: 'chevron' })}
      </button>`;
  }).join('');

  const body = subjects.length === 0
    ? emptyState('books.vertical', 'No subjects yet. Add one to get started.')
    : `<div class="list-card">${rows}</div>`;

  return el(`
    <div class="view view-subjects">
      <header class="page-header with-actions">
        <h1>Subjects</h1>
        <div class="header-actions">
          <button type="button" class="primary-button" data-add-subject>${icon('plus')}<span>Add</span></button>
        </div>
      </header>
      ${body}
    </div>`);
}
