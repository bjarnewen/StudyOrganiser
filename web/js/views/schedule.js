// Port of Sources/Views/Schedule/ScheduleView.swift

import { classRow, emptyState } from '../components.js';
import { el, escapeHtml } from '../ui.js';
import { WEEKDAY_ORDER, weekdayName } from '../domain.js';

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/// Of two occurrences of the same class, the one the weekly view should show:
/// the soonest upcoming, or failing that the most recent past one.
function preferred(a, b, today) {
  if (!a.specificDate) return b;
  if (!b.specificDate) return a;
  const dateA = new Date(a.specificDate).getTime();
  const dateB = new Date(b.specificDate).getTime();
  const aUpcoming = dateA >= today;
  const bUpcoming = dateB >= today;
  if (aUpcoming !== bUpcoming) return aUpcoming ? a : b;
  return aUpcoming ? (dateA < dateB ? a : b) : (dateA > dateB ? a : b);
}

/// A representative weekly template. Recurring entries appear once per weekday
/// as-is. One-off dated entries — common with calendars that publish each week's
/// class as its own event instead of an RRULE — are collapsed to a single
/// representative occurrence per class, so the weekly view reads like a normal
/// timetable instead of one row per week.
export function entriesForWeekday(store, weekday) {
  const dayEntries = store.all('scheduleEntries').filter((entry) => entry.dayOfWeek === weekday);
  const recurring = dayEntries.filter((entry) => entry.isRecurringWeekly);

  const today = startOfToday();
  const representativeOneOff = new Map();
  for (const entry of dayEntries) {
    if (entry.isRecurringWeekly) continue;
    const existing = representativeOneOff.get(entry.matchKey);
    representativeOneOff.set(entry.matchKey, existing ? preferred(entry, existing, today) : entry);
  }

  return [...recurring, ...representativeOneOff.values()]
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

export function render(context) {
  const { store } = context;

  const days = WEEKDAY_ORDER.map((weekday) => {
    const entries = entriesForWeekday(store, weekday);
    const body = entries.length === 0
      ? emptyState('moon.zzz', 'No classes')
      : `<div class="stack">${entries.map((entry) => classRow(entry, store.get('subjects', entry.subjectId))).join('')}</div>`;
    return `
      <section class="day-section">
        <h2 class="day-header">${escapeHtml(weekdayName(weekday))}</h2>
        ${body}
      </section>`;
  }).join('');

  return el(`
    <div class="view view-schedule">
      <header class="page-header"><h1>Schedule</h1></header>
      ${days}
    </div>`);
}
