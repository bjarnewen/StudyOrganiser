import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseICS, expandOccurrences, UNBOUNDED_HORIZON_DAYS, dateKey } from '../js/ics.js';

// TZ=Europe/Berlin (set by run-tests.sh).

function event(lines) {
  return parseICS(['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n'))[0];
}

function dates(lines, options) {
  return expandOccurrences(event(lines), options).map((o) => o.date);
}

test('a weekly rule with BYDAY and UNTIL yields exactly the taught days', () => {
  const result = dates([
    'UID:calc', 'SUMMARY:Calculus 1',
    'DTSTART;TZID=Europe/Berlin:20250908T101500',
    'DTEND;TZID=Europe/Berlin:20250908T114500',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20250924T235959Z',
  ]);
  assert.deepEqual(result, [
    '2025-09-08', '2025-09-10',
    '2025-09-15', '2025-09-17',
    '2025-09-22', '2025-09-24',
  ]);
});

test('UNTIL is respected to the day, not rounded up to the week', () => {
  const result = dates([
    'UID:x', 'SUMMARY:Mechanics', 'DTSTART;TZID=Europe/Berlin:20250908T090000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20250922T235959Z',
  ]);
  assert.equal(result.at(-1), '2025-09-22', 'the Wednesday after UNTIL is dropped');
});

test('COUNT caps the series in chronological order across BYDAY', () => {
  const result = dates([
    'UID:x', 'SUMMARY:Lab', 'DTSTART;TZID=Europe/Berlin:20250908T090000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=5',
  ]);
  assert.deepEqual(result, ['2025-09-08', '2025-09-10', '2025-09-15', '2025-09-17', '2025-09-22']);
});

test('EXDATE removes a cancelled week', () => {
  const result = dates([
    'UID:x', 'SUMMARY:Calculus', 'DTSTART;TZID=Europe/Berlin:20250908T101500',
    'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20250929T235959Z',
    'EXDATE;TZID=Europe/Berlin:20250915T101500',
  ]);
  assert.deepEqual(result, ['2025-09-08', '2025-09-22', '2025-09-29']);
});

test('several EXDATEs on one line are all honoured', () => {
  const result = dates([
    'UID:x', 'SUMMARY:Calculus', 'DTSTART;TZID=Europe/Berlin:20250908T101500',
    'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20250929T235959Z',
    'EXDATE;TZID=Europe/Berlin:20250915T101500,20250922T101500',
  ]);
  assert.deepEqual(result, ['2025-09-08', '2025-09-29']);
});

test('INTERVAL=2 gives a fortnightly series', () => {
  const result = dates([
    'UID:x', 'SUMMARY:Seminar', 'DTSTART;TZID=Europe/Berlin:20250908T140000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO;INTERVAL=2;COUNT=4',
  ]);
  assert.deepEqual(result, ['2025-09-08', '2025-09-22', '2025-10-06', '2025-10-20']);
});

test('BYDAY days earlier in the week than DTSTART still land correctly', () => {
  // DTSTART is a Wednesday; the rule also covers Monday, which first occurs the week after.
  const result = dates([
    'UID:x', 'SUMMARY:Physics', 'DTSTART;TZID=Europe/Berlin:20250910T090000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4',
  ]);
  assert.deepEqual(result, ['2025-09-10', '2025-09-15', '2025-09-17', '2025-09-22']);
});

test('an event with no rule is a single dated occurrence', () => {
  const result = dates([
    'UID:x', 'SUMMARY:Klausur', 'DTSTART;TZID=Europe/Berlin:20251215T090000',
  ]);
  assert.deepEqual(result, ['2025-12-15']);
});

test('an unbounded rule is capped at the horizon and flagged as unbounded', () => {
  const occurrences = expandOccurrences(event([
    'UID:x', 'SUMMARY:Forever', 'DTSTART;TZID=Europe/Berlin:20250908T090000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO',
  ]));
  assert.equal(occurrences.every((o) => o.bounded === false), true);
  assert.ok(occurrences.length >= 51 && occurrences.length <= 53, `got ${occurrences.length}`);
  const horizon = new Date(2025, 8, 8);
  horizon.setDate(horizon.getDate() + UNBOUNDED_HORIZON_DAYS);
  assert.ok(occurrences.at(-1).date <= dateKey(horizon));
});

test('a bounded rule is flagged as bounded', () => {
  const occurrences = expandOccurrences(event([
    'UID:x', 'SUMMARY:Bounded', 'DTSTART;TZID=Europe/Berlin:20250908T090000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20251006T000000Z',
  ]));
  assert.equal(occurrences.every((o) => o.bounded === true), true);
});

test('a daily rule expands day by day', () => {
  const result = dates([
    'UID:x', 'SUMMARY:Intro Week', 'DTSTART;TZID=Europe/Berlin:20250901T090000',
    'RRULE:FREQ=DAILY;COUNT=5',
  ]);
  assert.deepEqual(result, ['2025-09-01', '2025-09-02', '2025-09-03', '2025-09-04', '2025-09-05']);
});

test('a monthly rule keeps its first occurrence rather than being dropped', () => {
  const result = dates([
    'UID:x', 'SUMMARY:Colloquium', 'DTSTART;TZID=Europe/Berlin:20250903T160000',
    'RRULE:FREQ=MONTHLY;COUNT=3',
  ]);
  assert.deepEqual(result, ['2025-09-03']);
});

test('occurrences carry the class time', () => {
  const [occurrence] = expandOccurrences(event([
    'UID:x', 'SUMMARY:Calculus', 'DTSTART;TZID=Europe/Berlin:20250908T101500',
    'DTEND;TZID=Europe/Berlin:20250908T114500',
  ]));
  assert.equal(occurrence.startMinutes, 10 * 60 + 15);
  assert.equal(occurrence.endMinutes, 11 * 60 + 45);
});

test('a non-positive duration is widened instead of rendering as a negative block', () => {
  const [occurrence] = expandOccurrences(event([
    'UID:x', 'SUMMARY:Odd', 'DTSTART;TZID=Europe/Berlin:20250908T230000',
    'DTEND;TZID=Europe/Berlin:20250909T003000',
  ]));
  assert.ok(occurrence.endMinutes > occurrence.startMinutes);
});
