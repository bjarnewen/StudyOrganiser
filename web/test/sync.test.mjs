import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeDocuments } from '../js/sync.js';
import { createStore, memoryPersistence } from '../js/store.js';

function doc(subjects = {}, settings = { updatedAt: 0 }) {
  return {
    subjects, scheduleEntries: {}, assignments: {},
    importRules: {}, classNotes: {}, links: {}, settings,
  };
}

const subject = (id, name, updatedAt, deletedAt = null) => ({
  id, name, colorHex: '0A84FF', createdAt: 1000, updatedAt, deletedAt,
});

test('a record only this device has is kept and marked for upload', () => {
  const { merged, localChanged, remoteChanged } = mergeDocuments(
    doc({ a: subject('a', 'Analysis', 5000) }),
    doc(),
  );
  assert.equal(merged.subjects.a.name, 'Analysis');
  assert.equal(remoteChanged, true);
  assert.equal(localChanged, false);
});

test('a record only the other device has is pulled in', () => {
  const { merged, localChanged, remoteChanged } = mergeDocuments(
    doc(),
    doc({ b: subject('b', 'Chemistry', 5000) }),
  );
  assert.equal(merged.subjects.b.name, 'Chemistry');
  assert.equal(localChanged, true);
  assert.equal(remoteChanged, false);
});

test('the newer edit of the same record wins in both directions', () => {
  const older = subject('a', 'Old name', 1000);
  const newer = subject('a', 'New name', 9000);

  const pulled = mergeDocuments(doc({ a: older }), doc({ a: newer }));
  assert.equal(pulled.merged.subjects.a.name, 'New name');
  assert.equal(pulled.localChanged, true);
  assert.equal(pulled.remoteChanged, false);

  const pushed = mergeDocuments(doc({ a: newer }), doc({ a: older }));
  assert.equal(pushed.merged.subjects.a.name, 'New name');
  assert.equal(pushed.remoteChanged, true);
  assert.equal(pushed.localChanged, false);
});

test('two devices that edited different records offline keep both edits', () => {
  const { merged, localChanged, remoteChanged } = mergeDocuments(
    doc({ a: subject('a', 'Edited on the iPad', 8000), shared: subject('shared', 'Shared', 100) }),
    doc({ b: subject('b', 'Edited on the Mac', 8000), shared: subject('shared', 'Shared', 100) }),
  );
  assert.deepEqual(Object.keys(merged.subjects).sort(), ['a', 'b', 'shared']);
  assert.equal(localChanged, true);
  assert.equal(remoteChanged, true);
});

test('a delete beats an older edit of the same record', () => {
  const { merged } = mergeDocuments(
    doc({ a: subject('a', 'Renamed locally', 3000) }),
    doc({ a: subject('a', 'Analysis', 7000, 7000) }),
  );
  assert.equal(merged.subjects.a.deletedAt, 7000);
});

test('an edit made after a delete resurrects the record deliberately', () => {
  const { merged } = mergeDocuments(
    doc({ a: subject('a', 'Back again', 9000) }),
    doc({ a: subject('a', 'Analysis', 7000, 7000) }),
  );
  assert.equal(merged.subjects.a.deletedAt, null);
  assert.equal(merged.subjects.a.name, 'Back again');
});

test('settings move as a unit, newest wins', () => {
  const { merged, localChanged } = mergeDocuments(
    doc({}, { icsUrl: 'https://old.example/cal.ics', updatedAt: 100 }),
    doc({}, { icsUrl: 'https://new.example/cal.ics', updatedAt: 200 }),
  );
  assert.equal(merged.settings.icsUrl, 'https://new.example/cal.ics');
  assert.equal(localChanged, true);
});

test('merging against an empty gist leaves local data untouched', () => {
  const local = doc({ a: subject('a', 'Analysis', 5000) });
  const { merged, localChanged } = mergeDocuments(local, null);
  assert.deepEqual(Object.keys(merged.subjects), ['a']);
  assert.equal(localChanged, false);
});

test('a merged document round-trips back into the store', () => {
  const store = createStore(memoryPersistence());
  const { merged } = mergeDocuments(store.raw(), doc({ a: subject('a', 'Pulled', 5000) }));
  store.replaceAll(merged);
  assert.deepEqual(store.all('subjects').map((s) => s.name), ['Pulled']);
});
