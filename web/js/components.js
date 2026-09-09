// Shared row rendering.

import { escapeHtml } from './ui.js';
import { icon, TYPE_SYMBOLS } from './icons.js';
import { subjectColor, timeString, priorityInfo } from './domain.js';
import { effectiveDueAt } from './schedule.js';

export function typeBadge(type) {
  return `<span class="type-badge">${icon(TYPE_SYMBOLS[type] || 'calendar')}${escapeHtml(type)}</span>`;
}

export function emptyState(symbol, message) {
  return `
    <div class="empty-state">
      ${icon(symbol, { className: 'empty-icon' })}
      <p>${escapeHtml(message)}</p>
    </div>`;
}

export function sectionHeader(title, symbol) {
  return `<h2 class="section-header">${icon(symbol)}${escapeHtml(title)}</h2>`;
}

/// One dated class. `reminderCount` marks classes with work due by them or
/// things noted to check beforehand.
export function occurrenceRow(occurrence, subject, { reminderCount = 0 } = {}) {
  const timeRange = `${timeString(occurrence.startMinutes)} – ${timeString(occurrence.endMinutes)}`;
  const location = occurrence.location
    ? `<span class="row-meta">${icon('mappin.and.ellipse')}${escapeHtml(occurrence.location)}</span>`
    : '';
  const reminder = reminderCount > 0
    ? `<span class="reminder-badge" title="${reminderCount} thing${reminderCount === 1 ? '' : 's'} to deal with before this class">${icon('exclamationmark.triangle')}${reminderCount}</span>`
    : '';

  return `
    <button type="button" class="card class-row ${reminderCount > 0 ? 'has-reminder' : ''}" data-occurrence-id="${escapeHtml(occurrence.id)}">
      <span class="colour-rail" style="background:${subjectColor(subject?.colorHex)}"></span>
      <span class="class-row-main">
        <span class="row-title">${escapeHtml(subject?.name || occurrence.title || 'Class')}</span>
        <span class="row-details">${typeBadge(occurrence.type)}${location}</span>
      </span>
      ${reminder}
      <span class="class-row-time">${escapeHtml(timeRange)}</span>
    </button>`;
}

export function formatDueDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function isOverdue(store, assignment) {
  if (assignment.isCompleted) return false;
  const due = effectiveDueAt(store, assignment);
  if (due === null) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return due < startOfToday.getTime();
}

export function assignmentRow(store, assignment, subject) {
  const priority = priorityInfo(assignment.priority);
  const subjectChip = subject
    ? `<span class="row-meta"><span class="subject-dot" style="background:${subjectColor(subject.colorHex)}"></span>${escapeHtml(subject.name)}</span>`
    : '';

  const due = effectiveDueAt(store, assignment);
  let dueChip;
  if (assignment.dueMode === 'class') {
    const dueSubject = store.get('subjects', assignment.dueSubjectId);
    dueChip = due === null
      ? `<span class="row-meta muted">${icon('calendar')}no class scheduled</span>`
      : `<span class="row-meta ${isOverdue(store, assignment) ? 'overdue' : ''}">${icon('calendar')}by next ${escapeHtml(dueSubject?.name || 'class')} · ${escapeHtml(formatDueDate(due))}</span>`;
  } else {
    dueChip = `<span class="row-meta ${isOverdue(store, assignment) ? 'overdue' : ''}">${escapeHtml(formatDueDate(due))}</span>`;
  }

  return `
    <div class="assignment-row ${assignment.isCompleted ? 'done' : ''}">
      <button type="button" class="toggle-button" data-toggle-assignment="${escapeHtml(assignment.id)}"
        aria-label="${assignment.isCompleted ? 'Mark as not done' : 'Mark as done'}">
        ${icon(assignment.isCompleted ? 'checkmark.circle.fill' : 'circle', { className: assignment.isCompleted ? 'checked' : '' })}
      </button>
      <button type="button" class="assignment-main" data-assignment-id="${escapeHtml(assignment.id)}">
        <span class="row-title">${escapeHtml(assignment.title)}</span>
        <span class="row-details">${subjectChip}${dueChip}</span>
      </button>
      <span class="priority-dot" style="background:${priority.color}" title="${escapeHtml(priority.label)} priority"></span>
    </div>`;
}

/// A "check before the next class" item, shown in the class sheet and in Assignments.
export function checkItemRow(item, subject, nextOccurrence) {
  const when = nextOccurrence
    ? `${escapeHtml(subject?.name || 'class')} · ${new Date(`${nextOccurrence.date}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`
    : escapeHtml(subject?.name || 'class');
  return `
    <div class="assignment-row ${item.isResolved ? 'done' : ''}">
      <button type="button" class="toggle-button" data-toggle-check="${escapeHtml(item.id)}"
        aria-label="${item.isResolved ? 'Mark as not done' : 'Mark as done'}">
        ${icon(item.isResolved ? 'checkmark.circle.fill' : 'circle', { className: item.isResolved ? 'checked' : '' })}
      </button>
      <span class="assignment-main static">
        <span class="row-title">${escapeHtml(item.text)}</span>
        <span class="row-details">
          <span class="row-meta">
            ${subject ? `<span class="subject-dot" style="background:${subjectColor(subject.colorHex)}"></span>` : ''}before ${when}
          </span>
        </span>
      </span>
      <button type="button" class="icon-button destructive" data-delete-check="${escapeHtml(item.id)}" aria-label="Delete">${icon('trash')}</button>
    </div>`;
}
