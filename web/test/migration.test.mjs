import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, memoryPersistence, SCHEMA_VERSION } from '../js/store.js';
import { mergeDocuments } from '../js/sync.js';

/// A document in the shape the first release wrote: a weekly template with no
/// dates, notes attached to a weekly slot, and assignments with no due mode.
function v1Document() {
  return {
    schemaVersion: 1,
    subjects: {
      s1: { id: 's1', name: 'Calculus 1', colorHex: 'FF3B30', createdAt: 1, updatedAt: 1, deletedAt: null },
    },
    scheduleEntries: {
      e1: {
        id: 'e1', title: 'Lecture: Calculus 1', type: 'Lecture', dayOfWeek: 2,
        startMinutes: 615, endMinutes: 705, location: 'Hall A', isRecurringWeekly: true,
        specificDate: null, sourceUID: 'calc-1-2', matchKey: 'lecture: calculus 1',
        subjectId: 's1', createdAt: 1, updatedAt: 1, deletedAt: null,
      },
      e2: {
        id: 'e2', title: 'Lecture: Calculus 1', type: 'Lecture', dayOfWeek: 4,
        startMinutes: 615, endMinutes: 705, location: 'Hall A', isRecurringWeekly: true,
        specificDate: null, sourceUID: 'calc-1-4', matchKey: 'lecture: calculus 1',
        subjectId: 's1', createdAt: 1, updatedAt: 1, deletedAt: null,
      },
    },
    classNotes: {
      n1: { id: 'n1', text: 'Review chapter 3', isResolved: false, scheduleEntryId: 'e1', createdAt: 5, updatedAt: 5, deletedAt: null },
    },
    assignments: {
      a1: { id: 'a1', title: 'Problem set 2', dueDate: 1700000000000, isCompleted: false, priority: 2, notes: '', subjectId: 's1', createdAt: 1, updatedAt: 1, deletedAt: null },
    },
    importRules: {
      r1: { id: 'r1', matchText: 'lecture: calculus 1', type: 'Lecture', subjectId: 's1', createdAt: 1, updatedAt: 1, deletedAt: null },
    },
    links: {},
    settings: { icsUrl: 'https://example.com/cal.ics', updatedAt: 3 },
  };
}

test('a v1 document loads as v2 without losing anything', () => {
  const store = createStore(memoryPersistence(v1Document()));

  assert.equal(store.raw().schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(store.all('subjects').map((s) => s.name), ['Calculus 1']);
  assert.deepEqual(store.all('assignments').map((a) => a.title), ['Problem set 2']);
  assert.deepEqual(store.all('importRules').map((r) => r.matchText), ['lecture: calculus 1']);
  assert.equal(store.settings().icsUrl, 'https://example.com/cal.ics');
});

test('the two weekly slots collapse into one class series', () => {
  const store = createStore(memoryPersistence(v1Document()));
  const classes = store.all('classes');
  assert.equal(classes.length, 1, 'Monday and Wednesday were the same course');
  assert.equal(classes[0].matchKey, 'lecture: calculus 1');
  assert.equal(classes[0].subjectId, 's1');
  assert.equal(classes[0].type, 'Lecture');
});

test('notes move from the weekly slot to the course', () => {
  const store = createStore(memoryPersistence(v1Document()));
  const items = store.all('checkItems');
  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'Review chapter 3');
  assert.equal(items[0].subjectId, 's1', 'now attached to the course, not one weekday');
});

test('existing assignments become date-based', () => {
  const store = createStore(memoryPersistence(v1Document()));
  assert.equal(store.all('assignments')[0].dueMode, 'date');
});

test('occurrences are left for the next import rather than invented', () => {
  const store = createStore(memoryPersistence(v1Document()));
  // v1 never stored dates, so there is nothing truthful to migrate here.
  assert.equal(store.all('occurrences').length, 0);
});

test('migrating is idempotent across reloads', () => {
  const persistence = memoryPersistence(v1Document());
  createStore(persistence);
  const second = createStore(persistence);
  const third = createStore(persistence);

  assert.equal(third.all('classes').length, 1);
  assert.equal(third.all('checkItems').length, 1);
  assert.equal(second.all('classes')[0].id, third.all('classes')[0].id);
});

test('a device still on v1 syncing old rows up gets folded in, not duplicated', () => {
  const upgraded = createStore(memoryPersistence(v1Document()));
  // The old device pushes its v1 collections; merge keeps them, and the next
  // normalize pass migrates them onto the classes that already exist.
  const { merged } = mergeDocuments(upgraded.raw(), v1Document());
  const reloaded = createStore(memoryPersistence(merged));

  assert.equal(reloaded.all('classes').length, 1);
  assert.equal(reloaded.all('checkItems').length, 1);
  assert.equal(reloaded.all('subjects').length, 1);
});
