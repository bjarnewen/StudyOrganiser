// Subjects, sectioned the way the year is actually taught: by semester, then by
// block, newest first. Courses with nothing in the calendar sit at the bottom.

import { emptyState } from '../components.js';
import { el, escapeHtml } from '../ui.js';
import { icon } from '../icons.js';
import { subjectColor } from '../domain.js';
import { detectBlocks, formatBlockRange, currentBlock } from '../blocks.js';
import { dateKey } from '../schedule.js';

export function distinctClassCount(store, subjectId) {
  return store.all('classes').filter((klass) => klass.subjectId === subjectId).length;
}

function subjectRow(store, subject) {
  const classes = distinctClassCount(store, subject.id);
  const assignments = store.all('assignments').filter((a) => a.subjectId === subject.id && !a.isCompleted).length;
  const links = store.all('links').filter((l) => l.subjectId === subject.id).length;
  const parts = [`${classes} ${classes === 1 ? 'class' : 'classes'}`];
  if (assignments > 0) parts.push(`${assignments} open`);
  if (links > 0) parts.push(`${links} ${links === 1 ? 'link' : 'links'}`);

  return `
    <button type="button" class="subject-row" data-subject-id="${escapeHtml(subject.id)}">
      <span class="subject-dot large" style="background:${subjectColor(subject.colorHex)}"></span>
      <span class="subject-row-main">
        <span class="row-title">${escapeHtml(subject.name)}</span>
        <span class="row-details"><span class="row-meta">${escapeHtml(parts.join(' · '))}</span></span>
      </span>
      ${icon('chevron.right', { className: 'chevron' })}
    </button>`;
}

export function render(context) {
  const { store } = context;
  const subjects = store.all('subjects').sort((a, b) => a.name.localeCompare(b.name));
  const blocks = detectBlocks(store);
  const active = currentBlock(blocks, dateKey(new Date()));

  const claimed = new Set();
  const sections = [];

  // Newest block first: the one you're in should be at the top of the page.
  for (const block of [...blocks].reverse()) {
    const members = block.subjectIds
      .map((id) => store.get('subjects', id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (members.length === 0) continue;
    for (const member of members) claimed.add(member.id);

    const isActive = active && block.label === active.label && block.start === active.start;
    sections.push(`
      <section class="group">
        <h2 class="group-header block-header">
          <span>${escapeHtml(block.label)}${isActive ? '<span class="now-chip">now</span>' : ''}</span>
          <span class="block-meta">${escapeHtml(block.semesterLabel)} · ${escapeHtml(formatBlockRange(block))}</span>
        </h2>
        <div class="list-card">${members.map((subject) => subjectRow(store, subject)).join('')}</div>
      </section>`);
  }

  const unscheduled = subjects.filter((subject) => !claimed.has(subject.id));
  if (unscheduled.length > 0) {
    sections.push(`
      <section class="group">
        <h2 class="group-header block-header">
          <span>Not in the timetable</span>
          <span class="block-meta">${blocks.length === 0 ? 'import a calendar to sort these into blocks' : 'no classes imported for these'}</span>
        </h2>
        <div class="list-card">${unscheduled.map((subject) => subjectRow(store, subject)).join('')}</div>
      </section>`);
  }

  const body = subjects.length === 0
    ? emptyState('books.vertical', 'No subjects yet. Import your calendar or add one.')
    : sections.join('');

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
