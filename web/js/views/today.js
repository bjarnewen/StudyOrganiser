// Port of Sources/Views/Today/TodayView.swift

import { classRow, assignmentRow, emptyState, sectionHeader } from '../components.js';
import { el } from '../ui.js';

function isToday(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

export function todaysClasses(store) {
  const todayWeekday = new Date().getDay() + 1; // Foundation weekday: 1 = Sunday
  return store.all('scheduleEntries')
    .filter((entry) => {
      if (entry.isRecurringWeekly) return entry.dayOfWeek === todayWeekday;
      if (entry.specificDate) return isToday(entry.specificDate);
      return false;
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

export function upcomingAssignments(store) {
  return store.all('assignments')
    .filter((assignment) => !assignment.isCompleted)
    .sort((a, b) => a.dueDate - b.dueDate);
}

export function render(context) {
  const { store } = context;
  const classes = todaysClasses(store);
  const assignments = upcomingAssignments(store);

  const heading = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const classesHtml = classes.length === 0
    ? emptyState('cup.and.saucer', 'No classes today. Enjoy the break!')
    : `<div class="stack">${classes.map((entry) => classRow(entry, store.get('subjects', entry.subjectId))).join('')}</div>`;

  const assignmentsHtml = assignments.length === 0
    ? emptyState('checkmark.circle.fill', "Nothing due. You're all caught up!")
    : `<div class="list-card">${assignments.slice(0, 6).map((assignment) => assignmentRow(assignment, store.get('subjects', assignment.subjectId))).join('')}</div>`;

  return el(`
    <div class="view view-today">
      <header class="page-header">
        <h1>${heading}</h1>
        <p class="subtitle">${classes.length} ${classes.length === 1 ? 'class' : 'classes'} today · ${assignments.length} ${assignments.length === 1 ? 'assignment' : 'assignments'} pending</p>
      </header>
      ${sectionHeader("Today's Classes", 'calendar')}
      ${classesHtml}
      ${sectionHeader('Due Soon', 'flag.fill')}
      ${assignmentsHtml}
    </div>`);
}
