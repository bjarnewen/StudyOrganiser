// Working out which courses run when, straight from the imported calendar.
//
// A university timetable doesn't say "Block 1a" anywhere machine-readable, but
// it doesn't have to: courses taught in the same block start and finish
// together. So we read each subject's teaching period off its occurrences,
// group the subjects whose periods overlap, and call each group a block.
//
// Everything the app needs downstream — which courses are live right now, how
// to section the Subjects tab — comes out of that.

import { dateKey, dateFromKey } from './ics.js';

/// A course starting more than this long after the current cohort began marks
/// the start of a new block. Comfortably longer than the few days of jitter
/// between courses in one block, and comfortably shorter than a block itself.
const NEW_BLOCK_GAP_DAYS = 28;

function daysBetween(fromKey, toKey) {
  const ms = dateFromKey(toKey).getTime() - dateFromKey(fromKey).getTime();
  return Math.round(ms / 86400000);
}

function shiftKey(key, days) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

/// The span of dates each subject is actually taught over.
export function subjectPeriods(store) {
  const periods = new Map();
  for (const occurrence of store.all('occurrences')) {
    if (!occurrence.subjectId) continue;
    const period = periods.get(occurrence.subjectId);
    if (!period) {
      periods.set(occurrence.subjectId, { subjectId: occurrence.subjectId, start: occurrence.date, end: occurrence.date, count: 1 });
    } else {
      if (occurrence.date < period.start) period.start = occurrence.date;
      if (occurrence.date > period.end) period.end = occurrence.date;
      period.count += 1;
    }
  }
  return [...periods.values()];
}

/// An academic year runs from roughly August, so anything before then belongs to
/// the year that started the previous calendar year.
function academicYear(key) {
  const date = dateFromKey(key);
  const year = date.getFullYear();
  return date.getMonth() >= 7 ? year : year - 1;
}

/// First half of the academic year (Aug-Jan) is semester 1, the rest semester 2.
function semesterNumber(key) {
  const month = dateFromKey(key).getMonth();
  return month >= 7 || month <= 0 ? 1 : 2;
}

/// Works out the teaching blocks from the calendar.
///
/// A block is a stretch of *time*, not a set of courses — a course can run
/// across several of them. Mechanics and Relativity spanning a whole semester
/// while Calculus 1 runs in 1a and something else in 1b is the normal case, so
/// grouping courses that overlap would weld the whole semester into one block.
///
/// Instead the boundaries come from when cohorts of courses *begin*: several
/// courses starting together marks a new block, and every course whose teaching
/// period touches that stretch belongs to it — a semester-long course belongs to
/// each block it runs through.
export function detectBlocks(store) {
  const periods = subjectPeriods(store).sort((a, b) => a.start.localeCompare(b.start));
  if (periods.length === 0) return [];

  const boundaries = [];
  for (const period of periods) {
    const current = boundaries[boundaries.length - 1];
    if (!current || daysBetween(current, period.start) > NEW_BLOCK_GAP_DAYS) {
      boundaries.push(period.start);
    }
  }

  const lastEnd = periods.reduce((max, period) => (period.end > max ? period.end : max), periods[0].end);

  const blocks = boundaries.map((start, index) => {
    const next = boundaries[index + 1];
    // A block owns the calendar up to the day the next one opens, so the gap
    // between blocks still resolves to the one you have just been in.
    const end = next ? shiftKey(next, -1) : lastEnd;
    const members = periods.filter((period) => period.start <= end && period.end >= start);
    return {
      start,
      end,
      subjectIds: members.map((m) => m.subjectId),
      periods: members,
    };
  });

  // Label them the way a timetable does: semester 1 holds blocks 1a, 1b, ...
  const counters = new Map();
  for (const block of blocks) {
    block.academicYear = academicYear(block.start);
    block.semester = semesterNumber(block.start);
    const key = `${block.academicYear}-${block.semester}`;
    const index = counters.get(key) || 0;
    counters.set(key, index + 1);
    block.label = `Block ${block.semester}${String.fromCharCode(97 + index)}`;
    block.semesterLabel = `Semester ${block.semester} · ${block.academicYear}/${String(block.academicYear + 1).slice(2)}`;
  }
  return blocks;
}

export function blockContaining(blocks, key) {
  return blocks.find((block) => key >= block.start && key <= block.end) || null;
}

/// The block the app should treat as "now": the one we're inside, else the next
/// one starting, else the most recent one that finished.
export function currentBlock(blocks, today = dateKey(new Date())) {
  if (blocks.length === 0) return null;
  return blockContaining(blocks, today)
    || blocks.find((block) => block.start > today)
    || blocks[blocks.length - 1];
}

/// Subject ids to offer in pickers. With no calendar imported yet there are no
/// blocks to filter by, so everything stays available rather than nothing.
export function currentlyTaughtSubjectIds(store, today = dateKey(new Date())) {
  const blocks = detectBlocks(store);
  if (blocks.length === 0) return null; // null means "no opinion, show all"
  const block = currentBlock(blocks, today);
  return block ? new Set(block.subjectIds) : null;
}

export function formatBlockRange(block) {
  const options = { day: 'numeric', month: 'short' };
  const start = dateFromKey(block.start).toLocaleDateString(undefined, options);
  const end = dateFromKey(block.end).toLocaleDateString(undefined, options);
  return `${start} – ${end}`;
}
