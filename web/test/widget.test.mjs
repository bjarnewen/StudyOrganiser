import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildAgenda } from '../../widgets/src/agenda-core.js';
import { createStore, memoryPersistence } from '../js/store.js';

// The widgets read exactly what the app syncs, so the fixtures here are built
// through the real store rather than hand-written JSON.
function documentWith(build) {
  const store = createStore(memoryPersistence());
  store.batch((tx) => build(tx));
  return store.raw();
}

const TODAY = '2026-09-14';

function seed(tx, { withAssignment = false, withCheck = false, completed = false } = {}) {
  const calc = tx.insert('subjects', { name: 'Calculus 1', colorHex: 'FF9500' });
  const mech = tx.insert('subjects', { name: 'Mechanics and Relativity', colorHex: 'FF3B30' });
  const calcClass = tx.insert('classes', { matchKey: 'calc', title: 'Calculus', type: 'Lecture', subjectId: calc.id });
  const mechClass = tx.insert('classes', { matchKey: 'mech', title: 'Mechanics', type: 'Tutorial', subjectId: mech.id });

  tx.insert('occurrences', { classId: mechClass.id, subjectId: mech.id, date: TODAY, startMinutes: 540, endMinutes: 630, type: 'Tutorial', location: 'Zernike 5111' });
  tx.insert('occurrences', { classId: calcClass.id, subjectId: calc.id, date: TODAY, startMinutes: 615, endMinutes: 705, type: 'Lecture', location: 'Hall A' });
  tx.insert('occurrences', { classId: calcClass.id, subjectId: calc.id, date: '2026-09-16', startMinutes: 615, endMinutes: 705, type: 'Lecture' });

  if (withAssignment) {
    tx.insert('assignments', {
      title: 'Problem set 3', dueMode: 'class', dueSubjectId: calc.id, subjectId: calc.id,
      isCompleted: completed, priority: 2, notes: '',
    });
  }
  if (withCheck) {
    tx.insert('checkItems', { text: 'Redo the derivation', isResolved: false, subjectId: mech.id });
  }
  return { calc, mech };
}

test("today's classes come back in time order", () => {
  const doc = documentWith((tx) => seed(tx));
  const agenda = buildAgenda(doc, { dateKey: TODAY, minutesNow: 0 });
  assert.deepEqual(agenda.classes.map((c) => c.subjectName), ['Mechanics and Relativity', 'Calculus 1']);
  assert.deepEqual(agenda.classes.map((c) => c.time), ['09:00', '10:15']);
});

test('a class carries its subject colour and location', () => {
  const doc = documentWith((tx) => seed(tx));
  const [first] = buildAgenda(doc, { dateKey: TODAY, minutesNow: 0 }).classes;
  assert.equal(first.colorHex, 'FF3B30');
  assert.equal(first.location, 'Zernike 5111');
  assert.equal(first.timeRange, '09:00–10:30');
});

test('work due by a course is attached to that course’s next class', () => {
  const doc = documentWith((tx) => seed(tx, { withAssignment: true }));
  const agenda = buildAgenda(doc, { dateKey: TODAY, minutesNow: 0 });
  const calculus = agenda.classes.find((c) => c.subjectName === 'Calculus 1');
  assert.deepEqual(calculus.due.map((d) => d.title), ['Problem set 3']);
  assert.equal(calculus.reminderCount, 1);

  const mechanics = agenda.classes.find((c) => c.subjectName !== 'Calculus 1');
  assert.equal(mechanics.reminderCount, 0, 'another course is not flagged');
});

test('once a class has passed, its work moves to the following one', () => {
  const doc = documentWith((tx) => seed(tx, { withAssignment: true }));
  // 12:00, after the 10:15-11:45 lecture, so the next one is on the 16th.
  const agenda = buildAgenda(doc, { dateKey: TODAY, minutesNow: 720 });
  const calculus = agenda.classes.find((c) => c.subjectName === 'Calculus 1');
  assert.equal(calculus.isPast, true);
  assert.equal(calculus.due.length, 0);
});

test('a class in progress counts as done with: its work was due at the start', () => {
  const doc = documentWith((tx) => seed(tx, { withAssignment: true }));
  const agenda = buildAgenda(doc, { dateKey: TODAY, minutesNow: 660 }); // 11:00, mid-lecture
  const calculus = agenda.classes.find((c) => c.subjectName === 'Calculus 1');
  assert.equal(calculus.isPast, false, 'still running');
  assert.equal(calculus.due.length, 0, 'but no longer the class to prepare for');
});

test('completed work is not flagged', () => {
  const doc = documentWith((tx) => seed(tx, { withAssignment: true, completed: true }));
  const agenda = buildAgenda(doc, { dateKey: TODAY, minutesNow: 0 });
  assert.equal(agenda.classes.every((c) => c.reminderCount === 0), true);
});

test('check-before-class notes count towards the flag', () => {
  const doc = documentWith((tx) => seed(tx, { withCheck: true }));
  const agenda = buildAgenda(doc, { dateKey: TODAY, minutesNow: 0 });
  const mechanics = agenda.classes.find((c) => c.subjectName === 'Mechanics and Relativity');
  assert.equal(mechanics.reminderCount, 1);
  assert.deepEqual(mechanics.checks.map((c) => c.text), ['Redo the derivation']);
});

test('dated work due today, and anything overdue, is reported', () => {
  const doc = documentWith((tx) => {
    const { calc } = seed(tx);
    tx.insert('assignments', { title: 'Essay', dueMode: 'date', dueDate: new Date(`${TODAY}T16:00`).getTime(), subjectId: calc.id, isCompleted: false, priority: 1, notes: '' });
    tx.insert('assignments', { title: 'Late lab report', dueMode: 'date', dueDate: new Date('2026-09-01T09:00').getTime(), subjectId: calc.id, isCompleted: false, priority: 2, notes: '' });
    tx.insert('assignments', { title: 'Next week', dueMode: 'date', dueDate: new Date('2026-09-30T09:00').getTime(), subjectId: calc.id, isCompleted: false, priority: 0, notes: '' });
  });
  const agenda = buildAgenda(doc, { dateKey: TODAY, minutesNow: 0 });
  assert.deepEqual(agenda.dueToday.map((a) => a.title), ['Late lab report', 'Essay']);
  assert.equal(agenda.overdueCount, 1);
});

test('deleted records never surface in the widget', () => {
  const store = createStore(memoryPersistence());
  let subjectId;
  store.batch((tx) => { subjectId = seed(tx).calc.id; });
  store.remove('subjects', subjectId);

  const agenda = buildAgenda(store.raw(), { dateKey: TODAY, minutesNow: 0 });
  assert.equal(agenda.classes.some((c) => c.subjectName === 'Calculus 1'), false);
});

test('a free day and a missing document both render as empty, not broken', () => {
  const doc = documentWith((tx) => seed(tx));
  assert.equal(buildAgenda(doc, { dateKey: '2026-09-19', minutesNow: 0 }).empty, true);
  assert.equal(buildAgenda(null, { dateKey: TODAY }).empty, true);
  assert.equal(buildAgenda(undefined, { dateKey: TODAY }).classes.length, 0);
});

test('times can be rendered in 12-hour form', () => {
  const doc = documentWith((tx) => seed(tx));
  const agenda = buildAgenda(doc, { dateKey: TODAY, minutesNow: 0, use24Hour: false });
  assert.deepEqual(agenda.classes.map((c) => c.time), ['9:00am', '10:15am']);
});
