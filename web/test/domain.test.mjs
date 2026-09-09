import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseICS, expandOccurrences, normalizeCalendarURL } from '../js/ics.js';
import { guessClassType, guessSubjectName, WEEKDAY_ORDER } from '../js/domain.js';
import { createStore, memoryPersistence } from '../js/store.js';
import { autoImport, applyRuleCorrection } from '../js/importer.js';

// Tests assume TZ=Europe/Berlin (set by run-tests.sh) so that TZID-local
// timetable events read back at the same wall-clock time they were written.

const SAMPLE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:lecture-la-001',
  'DTSTART;TZID=Europe/Berlin:20250407T101500',
  'DTEND;TZID=Europe/Berlin:20250407T114500',
  'SUMMARY:WBPH001-10 Lecture: Linear Algebra',
  'LOCATION:Hall A\\, Building 5',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20250420T235959Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:tut-la-001',
  'DTSTART;TZID=Europe/Berlin:20250408T140000',
  'DTEND;TZID=Europe/Berlin:20250408T153000',
  'SUMMARY:Tutorial: Linear ',
  ' Algebra',
  'RRULE:FREQ=WEEKLY;UNTIL=20250420T235959Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:exam-la-001',
  'DTSTART;TZID=Europe/Berlin:20250715T090000',
  'DTEND;TZID=Europe/Berlin:20250715T120000',
  'SUMMARY:Klausur Analysis',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('parses recurring events and keeps their rule', () => {
  const events = parseICS(SAMPLE_ICS);
  assert.equal(events.length, 3);

  const lecture = events[0];
  assert.deepEqual(lecture.recurrence.weekdays, [2, 4]); // Monday, Wednesday
  assert.equal(lecture.recurrence.freq, 'WEEKLY');
  assert.equal(lecture.startMinutes, 10 * 60 + 15);
  assert.equal(lecture.endMinutes, 11 * 60 + 45);
  assert.equal(lecture.location, 'Hall A, Building 5', 'unescapes \\, in LOCATION');
});

test('unfolds continuation lines per RFC 5545', () => {
  const [, tutorial] = parseICS(SAMPLE_ICS);
  assert.equal(tutorial.summary, 'Tutorial: Linear Algebra');
});

test('a weekly rule without BYDAY falls back to the DTSTART weekday', () => {
  const [, tutorial] = parseICS(SAMPLE_ICS);
  assert.deepEqual(tutorial.recurrence.weekdays, [3]); // 2025-04-08 was a Tuesday
});

test('events without an RRULE import as one-off dated entries', () => {
  const [, , exam] = parseICS(SAMPLE_ICS);
  assert.equal(exam.recurrence, null);
  assert.equal(exam.startMinutes, 9 * 60);
  assert.deepEqual(expandOccurrences(exam).map((o) => o.date), ['2025-07-15']);
});

test('BYDAY tokens carrying an ordinal prefix still resolve', () => {
  const ics = [
    'BEGIN:VEVENT', 'UID:x', 'DTSTART:20250407T090000', 'SUMMARY:Seminar',
    'RRULE:FREQ=WEEKLY;BYDAY=2MO,-1FR', 'END:VEVENT',
  ].join('\r\n');
  assert.deepEqual(parseICS(ics)[0].recurrence.weekdays, [2, 6]);
});

test('UTC timestamps are converted into local wall-clock minutes', () => {
  const ics = [
    'BEGIN:VEVENT', 'UID:utc', 'DTSTART:20250115T083000Z', 'DTEND:20250115T093000Z',
    'SUMMARY:Winter Lecture', 'END:VEVENT',
  ].join('\r\n');
  // 08:30 UTC in January is 09:30 in Berlin (CET, UTC+1).
  assert.equal(parseICS(ics)[0].startMinutes, 9 * 60 + 30);
});

test('a missing DTEND defaults to one hour after the start', () => {
  const ics = [
    'BEGIN:VEVENT', 'UID:noend', 'DTSTART;TZID=Europe/Berlin:20250407T160000',
    'SUMMARY:Office Hours', 'END:VEVENT',
  ].join('\r\n');
  const [event] = parseICS(ics);
  assert.equal(event.endMinutes - event.startMinutes, 60);
});

test('an unrecognised TZID falls back to local time rather than dropping the event', () => {
  const ics = [
    'BEGIN:VEVENT', 'UID:win', 'DTSTART;TZID=W. Europe Standard Time:20250407T110000',
    'SUMMARY:Practical Chemistry', 'END:VEVENT',
  ].join('\r\n');
  assert.equal(parseICS(ics)[0].startMinutes, 11 * 60);
});

test('events without a parsable DTSTART are skipped', () => {
  const ics = ['BEGIN:VEVENT', 'UID:bad', 'SUMMARY:No start', 'END:VEVENT'].join('\r\n');
  assert.deepEqual(parseICS(ics), []);
});

test('guesses class type from English and German titles', () => {
  assert.equal(guessClassType('Vorlesung Analysis'), 'Lecture');
  assert.equal(guessClassType('Übung zur Analysis'), 'Tutorial');
  assert.equal(guessClassType('Praktikum Organische Chemie'), 'Practical');
  assert.equal(guessClassType('Klausur Analysis'), 'Exam');
  assert.equal(guessClassType('Study Group'), 'Other');
});

test('strips course codes and type keywords to recover the subject name', () => {
  assert.equal(guessSubjectName('Lecture: Linear Algebra'), 'Linear Algebra');
  assert.equal(guessSubjectName('WBPH001-10 Tutorial: Quantum Mechanics'), 'Quantum Mechanics');
  assert.equal(guessSubjectName('CS101 Organic Chemistry'), 'Organic Chemistry');
  // Stripping the code and the keyword can leave nothing, in which case the
  // untouched title is kept rather than showing an empty subject.
  assert.equal(guessSubjectName('CS101 - Practical'), 'CS101 - Practical');
  assert.equal(guessSubjectName('Exam'), 'Exam');
});

test('a course whose own name contains a type word keeps it', () => {
  // "Lab" is a Practical keyword, but here it is part of the course name.
  assert.equal(
    guessSubjectName('WBPH003-05 Practical: Physics: Lab Skills'),
    'Physics: Lab Skills',
  );
  assert.equal(guessSubjectName('Lecture: Waves and Optics'), 'Waves and Optics');
});

test('a title with no type word at all is left exactly as it is', () => {
  assert.equal(
    guessSubjectName('Introduction Course: Academic Skills'),
    'Introduction Course: Academic Skills',
    'punctuation is preserved when there is nothing to strip',
  );
});

test('normalizes webcal:// URLs and rejects non-http schemes', () => {
  assert.equal(
    normalizeCalendarURL(' webcal://example.com/basic.ics '),
    'https://example.com/basic.ics',
  );
  assert.equal(normalizeCalendarURL('javascript:alert(1)'), null);
  assert.equal(normalizeCalendarURL('not a url'), null);
});

test('the weekly view runs Monday to Sunday', () => {
  assert.deepEqual(WEEKDAY_ORDER, [2, 3, 4, 5, 6, 7, 1]);
});

function freshStore() {
  return createStore(memoryPersistence());
}

test('auto-import classifies every distinct class and creates its subjects', () => {
  const store = freshStore();
  const summary = autoImport(parseICS(SAMPLE_ICS), store);

  assert.equal(summary.totalDistinctClasses, 3);
  assert.equal(summary.newClassesClassified, 3);
  // "Linear Algebra" is shared by the lecture and the tutorial; "Analysis" is its own.
  assert.equal(summary.newSubjectsCreated, 2);

  const subjectNames = store.all('subjects').map((s) => s.name).sort();
  assert.deepEqual(subjectNames, ['Analysis', 'Linear Algebra']);

  // One class per distinct calendar series.
  assert.equal(store.all('classes').length, 3);
  assert.deepEqual(store.all('subjects').map((s) => s.colorHex), ['FF3B30', 'FF9500']);
});

test('auto-import writes a dated occurrence for every class that actually runs', () => {
  const store = freshStore();
  autoImport(parseICS(SAMPLE_ICS), store);

  // Lecture Mon+Wed for two weeks (4), tutorial Tue for two weeks (2), exam (1).
  const dates = store.all('occurrences').map((o) => o.date).sort();
  assert.deepEqual(dates, [
    '2025-04-07', '2025-04-08', '2025-04-09',
    '2025-04-14', '2025-04-15', '2025-04-16',
    '2025-07-15',
  ]);
});

test('nothing is placed on a day the course is not taught', () => {
  const store = freshStore();
  autoImport(parseICS(SAMPLE_ICS), store);
  // 21 April is the Monday after UNTIL: the old weekly template would have put
  // a lecture there forever.
  assert.deepEqual(store.all('occurrences').filter((o) => o.date === '2025-04-21'), []);
});

test('re-importing the same calendar updates in place instead of duplicating', () => {
  const store = freshStore();
  autoImport(parseICS(SAMPLE_ICS), store);
  const firstIds = store.all('occurrences').map((o) => o.id).sort();

  const summary = autoImport(parseICS(SAMPLE_ICS), store);
  assert.equal(summary.newClassesClassified, 0);
  assert.equal(summary.newSubjectsCreated, 0);
  assert.deepEqual(store.all('occurrences').map((o) => o.id).sort(), firstIds);
  assert.equal(store.all('classes').length, 3);
  assert.equal(store.all('subjects').length, 2);
});

test('a moved class is updated on the occurrences it already had', () => {
  const store = freshStore();
  autoImport(parseICS(SAMPLE_ICS), store);
  const moved = SAMPLE_ICS.replace('20250407T101500', '20250407T121500');

  autoImport(parseICS(moved), store);
  const lectures = store.all('occurrences').filter((o) => o.type === 'Lecture');
  assert.equal(lectures.length, 4);
  for (const lecture of lectures) assert.equal(lecture.startMinutes, 12 * 60 + 15);
});

test('shortening a series drops the occurrences that no longer happen', () => {
  const store = freshStore();
  autoImport(parseICS(SAMPLE_ICS), store);
  assert.equal(store.all('occurrences').length, 7);

  const shortened = SAMPLE_ICS.replaceAll('UNTIL=20250420T235959Z', 'UNTIL=20250413T235959Z');
  const summary = autoImport(parseICS(shortened), store);

  assert.equal(summary.occurrencesRemoved, 3, 'the second teaching week is removed');
  assert.deepEqual(
    store.all('occurrences').map((o) => o.date).sort(),
    ['2025-04-07', '2025-04-08', '2025-04-09', '2025-07-15'],
  );
});

test('correcting a rule re-labels every entry it produced', () => {
  const store = freshStore();
  autoImport(parseICS(SAMPLE_ICS), store);

  const rule = store.all('importRules').find((r) => r.matchText.includes('linear algebra'));
  const analysis = store.all('subjects').find((s) => s.name === 'Analysis');
  applyRuleCorrection(store, rule.id, { type: 'Practical', subjectId: analysis.id });

  const klass = store.all('classes').find((c) => c.matchKey === rule.matchText);
  assert.equal(klass.type, 'Practical');
  assert.equal(klass.subjectId, analysis.id);

  const affected = store.all('occurrences').filter((o) => o.classId === klass.id);
  assert.equal(affected.length, 4);
  for (const occurrence of affected) {
    assert.equal(occurrence.type, 'Practical');
    assert.equal(occurrence.subjectId, analysis.id);
  }
});

test('deleting a subject cascades to its entries, assignments, rules and links', () => {
  const store = freshStore();
  autoImport(parseICS(SAMPLE_ICS), store);
  const subject = store.all('subjects').find((s) => s.name === 'Linear Algebra');

  store.insert('assignments', {
    title: 'Problem set 3', dueDate: Date.now(), notes: '', isCompleted: false,
    priority: 2, subjectId: subject.id,
  });
  store.insert('links', { displayName: 'Notebook', url: 'https://example.com', subjectId: subject.id });

  store.insert('checkItems', { text: 'Review chapter 3', isResolved: false, subjectId: subject.id });

  store.remove('subjects', subject.id);

  assert.equal(store.get('subjects', subject.id), null);
  assert.equal(store.all('classes').filter((c) => c.subjectId === subject.id).length, 0);
  assert.equal(store.all('occurrences').filter((o) => o.subjectId === subject.id).length, 0);
  assert.equal(store.all('assignments').length, 0);
  assert.equal(store.all('links').length, 0);
  assert.equal(store.all('checkItems').length, 0);
  // The Analysis lecture and exam are untouched.
  assert.equal(store.all('classes').length, 1);
});

test('deletes leave a tombstone so another device cannot resurrect the record', () => {
  const store = freshStore();
  const subject = store.insert('subjects', { name: 'Dropped', colorHex: '0A84FF' });
  store.remove('subjects', subject.id);

  assert.equal(store.all('subjects').length, 0);
  const tombstone = store.allIncludingDeleted('subjects').find((s) => s.id === subject.id);
  assert.ok(tombstone.deletedAt > 0);
});

test('the store reloads what it persisted', () => {
  const persistence = memoryPersistence();
  const first = createStore(persistence);
  first.insert('subjects', { name: 'Persisted', colorHex: '34C759' });

  const second = createStore(persistence);
  assert.deepEqual(second.all('subjects').map((s) => s.name), ['Persisted']);
});
