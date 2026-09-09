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

/// Two subjects belong to the same block when they overlap by at least this
/// much of the shorter of the two periods. Well below 1 so a course that starts
/// a week late or ends a week early still lands in its block, but high enough
/// that adjacent blocks don't merge just because one exam sits in the next.
const OVERLAP_THRESHOLD = 0.5;

function daysBetween(fromKey, toKey) {
  const ms = dateFromKey(toKey).getTime() - dateFromKey(fromKey).getTime();
  return Math.round(ms / 86400000);
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

function overlapFraction(a, b) {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  const overlap = daysBetween(start, end) + 1;
  if (overlap <= 0) return 0;
  const shorter = Math.min(daysBetween(a.start, a.end), daysBetween(b.start, b.end)) + 1;
  return shorter <= 0 ? 0 : overlap / shorter;
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

/// Groups subjects into blocks by overlapping teaching periods, newest last.
export function detectBlocks(store) {
  const periods = subjectPeriods(store).sort((a, b) => a.start.localeCompare(b.start));
  if (periods.length === 0) return [];

  // Union-find over "these two courses run at the same time".
  const parent = periods.map((_, index) => index);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i, j) => { parent[find(i)] = find(j); };

  for (let i = 0; i < periods.length; i += 1) {
    for (let j = i + 1; j < periods.length; j += 1) {
      if (overlapFraction(periods[i], periods[j]) >= OVERLAP_THRESHOLD) union(i, j);
    }
  }

  const groups = new Map();
  periods.forEach((period, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(period);
  });

  const blocks = [...groups.values()].map((members) => ({
    start: members.reduce((min, m) => (m.start < min ? m.start : min), members[0].start),
    end: members.reduce((max, m) => (m.end > max ? m.end : max), members[0].end),
    subjectIds: members.map((m) => m.subjectId),
    periods: members,
  })).sort((a, b) => a.start.localeCompare(b.start));

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
