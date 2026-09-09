import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, memoryPersistence } from '../js/store.js';
import { detectBlocks, currentBlock, currentlyTaughtSubjectIds } from '../js/blocks.js';
import {
  upcomingWorkingDays, workingWeek, nextOccurrenceForSubject, effectiveDueAt,
  remindersForOccurrence, occurrencesOn, dateKey,
} from '../js/schedule.js';

function storeWith(subjects) {
  const store = createStore(memoryPersistence());
  const ids = {};
  store.batch((tx) => {
    for (const [name, spec] of Object.entries(subjects)) {
      const subject = tx.insert('subjects', { name, colorHex: '0A84FF' });
      ids[name] = subject.id;
      const klass = tx.insert('classes', { matchKey: name.toLowerCase(), title: name, type: spec.type || 'Lecture', subjectId: subject.id });
      for (const date of spec.dates) {
        tx.insert('occurrences', {
          classId: klass.id, subjectId: subject.id, date,
          startMinutes: spec.start ?? 600, endMinutes: (spec.start ?? 600) + 90,
          type: spec.type || 'Lecture', sourceUID: `${name}::${date}`,
        });
      }
    }
  });
  return { store, ids };
}

const BLOCK_1A = ['2025-09-08', '2025-09-15', '2025-10-06', '2025-11-03'];
const BLOCK_1B = ['2025-11-17', '2025-12-01', '2026-01-12', '2026-01-19'];

/// Weekly dates from `from` to `to`, inclusive.
function weekly(fromISO, toISO, weekday = 1) {
  const dates = [];
  const cursor = new Date(fromISO);
  while (cursor.getDay() !== weekday) cursor.setDate(cursor.getDate() + 1);
  const end = new Date(toISO);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 7);
  }
  return dates;
}

// The real shape of a Groningen-style year: a course running the whole semester
// alongside short courses that define the blocks underneath it.
function semesterStore() {
  return storeWith({
    'Mechanics and Relativity': { dates: weekly('2025-09-01', '2026-01-30') },
    'Calculus 1': { dates: weekly('2025-09-01', '2025-11-07') },
    'Physics: Lab Skills': { dates: weekly('2025-09-02', '2025-11-07', 2) },
    'Linear Algebra': { dates: weekly('2025-11-17', '2026-01-30') },
    'Waves and Optics': { dates: weekly('2025-11-18', '2026-01-30', 2) },
  });
}

test('a semester-long course does not weld its two blocks together', () => {
  const { store } = semesterStore();
  const blocks = detectBlocks(store);
  assert.equal(blocks.length, 2, 'Mechanics spans both blocks but must not merge them');
  assert.deepEqual(blocks.map((b) => b.label), ['Block 1a', 'Block 1b']);
});

test('a semester-long course belongs to every block it runs through', () => {
  const { store, ids } = semesterStore();
  const [first, second] = detectBlocks(store);
  const names = (block) => block.subjectIds.map((id) => Object.keys(ids).find((n) => ids[n] === id)).sort();

  assert.deepEqual(names(first), ['Calculus 1', 'Mechanics and Relativity', 'Physics: Lab Skills']);
  assert.deepEqual(names(second), ['Linear Algebra', 'Mechanics and Relativity', 'Waves and Optics']);
});

test('during block 1a, only 1a courses are offered', () => {
  const { store, ids } = semesterStore();
  const taught = currentlyTaughtSubjectIds(store, '2025-10-01');
  assert.equal(taught.has(ids['Calculus 1']), true);
  assert.equal(taught.has(ids['Mechanics and Relativity']), true, 'runs all semester');
  assert.equal(taught.has(ids['Linear Algebra']), false, 'has not started yet');
  assert.equal(taught.has(ids['Waves and Optics']), false);
  assert.equal(taught.size, 3);
});

test('during block 1b, the 1a courses have dropped out', () => {
  const { store, ids } = semesterStore();
  const taught = currentlyTaughtSubjectIds(store, '2025-12-05');
  assert.equal(taught.has(ids['Linear Algebra']), true);
  assert.equal(taught.has(ids['Mechanics and Relativity']), true, 'still running');
  assert.equal(taught.has(ids['Calculus 1']), false, 'finished in 1a');
  assert.equal(taught.size, 3);
});

test('the gap between blocks still resolves to the block just finished', () => {
  const { store, ids } = semesterStore();
  // 12 November: 1a's classes are over, 1b has not begun.
  const taught = currentlyTaughtSubjectIds(store, '2025-11-12');
  assert.equal(taught.has(ids['Calculus 1']), true);
  assert.equal(taught.has(ids['Linear Algebra']), false);
});

test('blocks are contiguous: one ends the day the next begins', () => {
  const { store } = semesterStore();
  const [first, second] = detectBlocks(store);
  assert.equal(first.start, '2025-09-01');
  assert.equal(first.end, '2025-11-16', 'runs right up to 1b');
  assert.equal(second.start, '2025-11-17');
  const lastClass = store.all('occurrences').map((o) => o.date).sort().at(-1);
  assert.equal(second.end, lastClass, 'the last block ends with its last class');
});

test('courses taught over the same period land in one block', () => {
  const { store } = storeWith({
    'Calculus 1': { dates: BLOCK_1A },
    'Mechanics and Relativity': { dates: BLOCK_1A },
    'Physics: Lab Skills': { dates: BLOCK_1A },
  });
  const blocks = detectBlocks(store);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].subjectIds.length, 3);
  assert.equal(blocks[0].label, 'Block 1a');
});

test('a later, non-overlapping period becomes its own block', () => {
  const { store } = storeWith({
    'Calculus 1': { dates: BLOCK_1A },
    'Mechanics and Relativity': { dates: BLOCK_1A },
    'Linear Algebra': { dates: BLOCK_1B },
    'Waves and Optics': { dates: BLOCK_1B },
  });
  const blocks = detectBlocks(store);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map((b) => b.label), ['Block 1a', 'Block 1b']);
  assert.equal(blocks[0].subjectIds.length, 2);
  assert.equal(blocks[1].subjectIds.length, 2);
});

test('blocks after January are labelled as semester 2', () => {
  const { store } = storeWith({
    'Quantum Physics': { dates: ['2026-02-09', '2026-03-02', '2026-04-06'] },
  });
  const [block] = detectBlocks(store);
  assert.equal(block.semester, 2);
  assert.equal(block.label, 'Block 2a');
  assert.equal(block.academicYear, 2025, 'February 2026 is still the 2025/26 year');
  assert.match(block.semesterLabel, /Semester 2 · 2025\/26/);
});

test('the current block is the one today falls inside', () => {
  const { store, ids } = storeWith({
    'Calculus 1': { dates: BLOCK_1A },
    'Linear Algebra': { dates: BLOCK_1B },
  });
  const blocks = detectBlocks(store);
  const block = currentBlock(blocks, '2025-10-01');
  assert.deepEqual(block.subjectIds, [ids['Calculus 1']]);
});

test('before term starts, the first block is the current one', () => {
  const { store, ids } = storeWith({
    'Calculus 1': { dates: BLOCK_1A },
    'Linear Algebra': { dates: BLOCK_1B },
  });
  const block = currentBlock(detectBlocks(store), '2025-08-01');
  assert.deepEqual(block.subjectIds, [ids['Calculus 1']]);
});

test('only the current block’s courses are offered in pickers', () => {
  const { store, ids } = storeWith({
    'Calculus 1': { dates: BLOCK_1A },
    'Mechanics and Relativity': { dates: BLOCK_1A },
    'Linear Algebra': { dates: BLOCK_1B },
  });
  const taught = currentlyTaughtSubjectIds(store, '2025-10-01');
  assert.equal(taught.size, 2);
  assert.equal(taught.has(ids['Calculus 1']), true);
  assert.equal(taught.has(ids['Linear Algebra']), false);
});

test('a course stays offered through a gap inside its own block', () => {
  // No classes at all in the week of 20 October, but the block runs either side.
  const { store, ids } = storeWith({ 'Calculus 1': { dates: BLOCK_1A } });
  const taught = currentlyTaughtSubjectIds(store, '2025-10-22');
  assert.equal(taught.has(ids['Calculus 1']), true);
});

test('with no calendar imported the filter has no opinion', () => {
  const store = createStore(memoryPersistence());
  store.insert('subjects', { name: 'Manually added', colorHex: '0A84FF' });
  assert.equal(currentlyTaughtSubjectIds(store), null, 'null means show everything');
});

test('the working-day pair skips the weekend', () => {
  const friday = new Date(2025, 8, 12); // Friday
  assert.deepEqual(upcomingWorkingDays(friday, 2).map(dateKey), ['2025-09-12', '2025-09-15']);

  const saturday = new Date(2025, 8, 13);
  assert.deepEqual(upcomingWorkingDays(saturday, 2).map(dateKey), ['2025-09-15', '2025-09-16']);
});

test('the schedule week runs Monday to Friday', () => {
  const week = workingWeek(new Date(2025, 8, 10)).map(dateKey);
  assert.deepEqual(week, ['2025-09-08', '2025-09-09', '2025-09-10', '2025-09-11', '2025-09-12']);
});

test('the next class of a course is the soonest of any type', () => {
  const store = createStore(memoryPersistence());
  const subject = store.insert('subjects', { name: 'Calculus 1', colorHex: '0A84FF' });
  const lecture = store.insert('classes', { matchKey: 'l', title: 'Lecture', type: 'Lecture', subjectId: subject.id });
  const tutorial = store.insert('classes', { matchKey: 't', title: 'Tutorial', type: 'Tutorial', subjectId: subject.id });
  store.insert('occurrences', { classId: lecture.id, subjectId: subject.id, date: '2025-09-17', startMinutes: 600, endMinutes: 690, type: 'Lecture' });
  store.insert('occurrences', { classId: tutorial.id, subjectId: subject.id, date: '2025-09-16', startMinutes: 780, endMinutes: 870, type: 'Tutorial' });

  const next = nextOccurrenceForSubject(store, subject.id, { fromKey: '2025-09-15', fromMinutes: 0 });
  assert.equal(next.date, '2025-09-16');
  assert.equal(next.type, 'Tutorial', 'a tutorial can be the next class, not just a lecture');
});

test('a class already finished today is not the next one', () => {
  const store = createStore(memoryPersistence());
  const subject = store.insert('subjects', { name: 'Calculus 1', colorHex: '0A84FF' });
  const klass = store.insert('classes', { matchKey: 'l', title: 'L', type: 'Lecture', subjectId: subject.id });
  store.insert('occurrences', { classId: klass.id, subjectId: subject.id, date: '2025-09-16', startMinutes: 540, endMinutes: 630, type: 'Lecture' });
  store.insert('occurrences', { classId: klass.id, subjectId: subject.id, date: '2025-09-18', startMinutes: 540, endMinutes: 630, type: 'Lecture' });

  const next = nextOccurrenceForSubject(store, subject.id, { fromKey: '2025-09-16', fromMinutes: 700 });
  assert.equal(next.date, '2025-09-18');
});

test('an assignment due by a course resolves to that course’s next class', () => {
  const store = createStore(memoryPersistence());
  const subject = store.insert('subjects', { name: 'Calculus 1', colorHex: '0A84FF' });
  const klass = store.insert('classes', { matchKey: 'l', title: 'L', type: 'Tutorial', subjectId: subject.id });
  const occurrence = store.insert('occurrences', { classId: klass.id, subjectId: subject.id, date: '2099-09-18', startMinutes: 780, endMinutes: 870, type: 'Tutorial' });
  const assignment = store.insert('assignments', {
    title: 'Problem set 3', dueMode: 'class', dueSubjectId: subject.id,
    isCompleted: false, priority: 1, notes: '',
  });

  const due = new Date(effectiveDueAt(store, assignment));
  assert.equal(dateKey(due), '2099-09-18');
  assert.equal(due.getHours(), 13);

  const reminders = remindersForOccurrence(store, occurrence);
  assert.equal(reminders.assignments.length, 1);
  assert.equal(reminders.total, 1);
});

test('deleting the course an assignment is due by leaves it on a date', () => {
  const store = createStore(memoryPersistence());
  const subject = store.insert('subjects', { name: 'Dropped', colorHex: '0A84FF' });
  const assignment = store.insert('assignments', {
    title: 'Essay', dueMode: 'class', dueSubjectId: subject.id, dueDate: Date.now(),
    isCompleted: false, priority: 1, notes: '',
  });
  store.remove('subjects', subject.id);

  const updated = store.get('assignments', assignment.id);
  assert.equal(updated.dueMode, 'date');
  assert.equal(updated.dueSubjectId, null);
});

test('occurrencesOn returns a day in start-time order', () => {
  const { store } = storeWith({
    Late: { dates: ['2025-09-16'], start: 840 },
    Early: { dates: ['2025-09-16'], start: 540 },
  });
  const day = occurrencesOn(store, '2025-09-16');
  assert.deepEqual(day.map((o) => o.startMinutes), [540, 840]);
});
