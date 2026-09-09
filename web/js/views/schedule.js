// Schedule: a real week, laid out like a calendar.
//
// Everything drawn here comes from dated occurrences, so a class appears on a
// day only if it genuinely runs that day. Weeks before a course starts or after
// it ends are simply empty.

import { el, escapeHtml } from '../ui.js';
import { icon } from '../icons.js';
import { subjectColor, timeString } from '../domain.js';
import {
  workingWeek, addDays, occurrencesBetween, dateKey, remindersForOccurrence,
} from '../schedule.js';
import { detectBlocks, blockContaining, formatBlockRange } from '../blocks.js';

const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 18;

/// Classes that overlap in time are split into side-by-side lanes so neither
/// is hidden behind the other.
function assignLanes(occurrences) {
  const sorted = [...occurrences].sort((a, b) => a.startMinutes - b.startMinutes);
  const laneEnds = [];
  const placed = sorted.map((occurrence) => {
    let lane = laneEnds.findIndex((end) => end <= occurrence.startMinutes);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(occurrence.endMinutes);
    } else {
      laneEnds[lane] = occurrence.endMinutes;
    }
    return { occurrence, lane };
  });
  return { placed, laneCount: Math.max(1, laneEnds.length) };
}

export function render(context) {
  const { store, state } = context;
  const anchor = addDays(new Date(), (state.weekOffset || 0) * 7);
  const days = workingWeek(anchor);
  const fromKey = dateKey(days[0]);
  const toKey = dateKey(days[4]);
  const today = dateKey(new Date());

  const weekOccurrences = occurrencesBetween(store, fromKey, toKey);

  // Fit the grid to the day, but never crop a class that starts early or runs late.
  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;
  for (const occurrence of weekOccurrences) {
    startHour = Math.min(startHour, Math.floor(occurrence.startMinutes / 60));
    endHour = Math.max(endHour, Math.ceil(occurrence.endMinutes / 60));
  }
  const gridStart = startHour * 60;
  const gridEnd = endHour * 60;
  const span = Math.max(60, gridEnd - gridStart);

  const hourLabels = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    hourLabels.push(`
      <div class="hour-label" style="top:${((hour * 60 - gridStart) / span) * 100}%">
        <span>${escapeHtml(timeString(hour * 60))}</span>
      </div>`);
  }

  const columns = days.map((date) => {
    const key = dateKey(date);
    const dayOccurrences = weekOccurrences.filter((occurrence) => occurrence.date === key);
    const { placed, laneCount } = assignLanes(dayOccurrences);

    const blocks = placed.map(({ occurrence, lane }) => {
      const subject = store.get('subjects', occurrence.subjectId);
      const top = ((occurrence.startMinutes - gridStart) / span) * 100;
      const height = ((occurrence.endMinutes - occurrence.startMinutes) / span) * 100;
      const width = 100 / laneCount;
      const reminders = remindersForOccurrence(store, occurrence);
      const colour = subjectColor(subject?.colorHex);
      const isShort = occurrence.endMinutes - occurrence.startMinutes <= 60;

      return `
        <button type="button" class="week-event ${isShort ? 'short' : ''}"
          data-occurrence-id="${escapeHtml(occurrence.id)}"
          title="${escapeHtml(`${subject?.name || occurrence.title || 'Class'} · ${occurrence.type} · ${timeString(occurrence.startMinutes)}–${timeString(occurrence.endMinutes)}${occurrence.location ? ` · ${occurrence.location}` : ''}`)}"
          style="top:${top}%;height:${height}%;left:${lane * width}%;width:${width}%;--event-colour:${colour}">
          <span class="week-event-title">${escapeHtml(subject?.name || occurrence.title || 'Class')}</span>
          <span class="week-event-meta">${escapeHtml(occurrence.type)} · ${escapeHtml(timeString(occurrence.startMinutes))}</span>
          ${occurrence.location ? `<span class="week-event-meta">${escapeHtml(occurrence.location)}</span>` : ''}
          ${reminders.total > 0 ? `<span class="week-event-flag">${icon('exclamationmark.triangle')}</span>` : ''}
        </button>`;
    }).join('');

    return `
      <div class="week-column ${key === today ? 'is-today' : ''}">
        <div class="week-column-head">
          <span class="week-day">${escapeHtml(date.toLocaleDateString(undefined, { weekday: 'short' }))}</span>
          <span class="week-date">${date.getDate()}</span>
        </div>
        <div class="week-column-body">${blocks}</div>
      </div>`;
  }).join('');

  const blocks = detectBlocks(store);
  const activeBlock = blockContaining(blocks, fromKey) || blockContaining(blocks, toKey);
  const blockChip = activeBlock
    ? `<span class="block-chip">${escapeHtml(activeBlock.label)} · ${escapeHtml(formatBlockRange(activeBlock))}</span>`
    : '';

  const rangeLabel = `${days[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${days[4].toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: days[4].getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })}`;

  const emptyNotice = weekOccurrences.length === 0
    ? `<p class="week-empty">${store.all('occurrences').length === 0
        ? 'No calendar imported yet — add one in Settings.'
        : 'No classes this week.'}</p>`
    : '';

  return el(`
    <div class="view view-schedule">
      <header class="page-header with-actions">
        <div>
          <h1>Schedule</h1>
          <p class="subtitle">${escapeHtml(rangeLabel)} ${blockChip}</p>
        </div>
        <div class="header-actions">
          <button type="button" class="icon-button" data-week-step="-1" aria-label="Previous week">${icon('chevron.right', { className: 'flip' })}</button>
          <button type="button" class="secondary-button" data-week-step="0">This week</button>
          <button type="button" class="icon-button" data-week-step="1" aria-label="Next week">${icon('chevron.right')}</button>
        </div>
      </header>
      ${emptyNotice}
      <div class="week-grid" style="--hour-count:${endHour - startHour}">
        <div class="week-gutter">${hourLabels.join('')}</div>
        <div class="week-columns">${columns}</div>
      </div>
    </div>`);
}
