// Ports of Sources/Views/Components/*.swift plus the two shared row views.

import { escapeHtml } from './ui.js';
import { icon, TYPE_SYMBOLS } from './icons.js';
import { subjectColor, timeString, priorityInfo } from './domain.js';

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

export function classRow(entry, subject) {
  const timeRange = `${timeString(entry.startMinutes)} – ${timeString(entry.endMinutes)}`;
  const location = entry.location
    ? `<span class="row-meta">${icon('mappin.and.ellipse')}${escapeHtml(entry.location)}</span>`
    : '';
  return `
    <button type="button" class="card class-row" data-entry-id="${escapeHtml(entry.id)}">
      <span class="colour-rail" style="background:${subjectColor(subject?.colorHex)}"></span>
      <span class="class-row-main">
        <span class="row-title">${escapeHtml(subject?.name || entry.title)}</span>
        <span class="row-details">${typeBadge(entry.type)}${location}</span>
      </span>
      <span class="class-row-time">${escapeHtml(timeRange)}</span>
    </button>`;
}

export function formatDueDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function isOverdue(assignment) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return !assignment.isCompleted && assignment.dueDate < startOfToday.getTime();
}

export function assignmentRow(assignment, subject, { interactive = true } = {}) {
  const priority = priorityInfo(assignment.priority);
  const subjectChip = subject
    ? `<span class="row-meta"><span class="subject-dot" style="background:${subjectColor(subject.colorHex)}"></span>${escapeHtml(subject.name)}</span>`
    : '';
  const due = `<span class="row-meta ${isOverdue(assignment) ? 'overdue' : ''}">${escapeHtml(formatDueDate(assignment.dueDate))}</span>`;

  return `
    <div class="assignment-row ${assignment.isCompleted ? 'done' : ''}">
      <button type="button" class="toggle-button" data-toggle-assignment="${escapeHtml(assignment.id)}"
        aria-label="${assignment.isCompleted ? 'Mark as not done' : 'Mark as done'}" ${interactive ? '' : 'disabled'}>
        ${icon(assignment.isCompleted ? 'checkmark.circle.fill' : 'circle', { className: assignment.isCompleted ? 'checked' : '' })}
      </button>
      <button type="button" class="assignment-main" data-assignment-id="${escapeHtml(assignment.id)}" ${interactive ? '' : 'disabled'}>
        <span class="row-title">${escapeHtml(assignment.title)}</span>
        <span class="row-details">${subjectChip}${due}</span>
      </button>
      <span class="priority-dot" style="background:${priority.color}" title="${escapeHtml(priority.label)} priority"></span>
    </div>`;
}
