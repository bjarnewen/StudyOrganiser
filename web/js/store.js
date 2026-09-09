// Record store backing the app. Mirrors the SwiftData schema in Sources/Models,
// with two changes needed to make it syncable through a plain JSON file:
//
//  * every record carries createdAt/updatedAt/deletedAt so two devices editing
//    offline can be merged per record rather than whole-file last-write-wins;
//  * deletes are soft (deletedAt is stamped, the row stays) so a delete on one
//    device isn't resurrected by an older copy on another.
//
// SwiftData's `deleteRule: .cascade` relationships are replicated in cascade().

export const COLLECTIONS = [
  'subjects', 'scheduleEntries', 'assignments', 'importRules', 'classNotes', 'links',
];

export const SCHEMA_VERSION = 1;

function emptyData() {
  const data = { schemaVersion: SCHEMA_VERSION, settings: { updatedAt: 0 } };
  for (const collection of COLLECTIONS) data[collection] = {};
  return data;
}

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/// `persistence` is { load(): object|null, save(data): void } so the store can be
/// driven by localStorage in the browser and by memory in tests.
export function createStore(persistence) {
  let data = normalizeData(persistence.load());
  const listeners = new Set();

  function normalizeData(raw) {
    const base = emptyData();
    if (!raw || typeof raw !== 'object') return base;
    for (const collection of COLLECTIONS) {
      const incoming = raw[collection];
      if (incoming && typeof incoming === 'object') {
        for (const [id, record] of Object.entries(incoming)) {
          if (record && typeof record === 'object') base[collection][id] = { ...record, id };
        }
      }
    }
    if (raw.settings && typeof raw.settings === 'object') {
      base.settings = { updatedAt: 0, ...raw.settings };
    }
    return base;
  }

  function notify() {
    for (const listener of listeners) listener();
  }

  function persist({ silent = false } = {}) {
    persistence.save(data);
    if (!silent) notify();
  }

  const store = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /// The full document, including tombstones — this is what gets synced.
    raw() { return data; },

    replaceAll(next) {
      data = normalizeData(next);
      persist();
    },

    all(collection) {
      return Object.values(data[collection]).filter((record) => !record.deletedAt);
    },

    /// Includes tombstones. Used by sync and by cascade bookkeeping.
    allIncludingDeleted(collection) {
      return Object.values(data[collection]);
    },

    get(collection, id) {
      if (!id) return null;
      const record = data[collection][id];
      return record && !record.deletedAt ? record : null;
    },

    insert(collection, fields) {
      const now = Date.now();
      const record = {
        id: newId(),
        createdAt: now,
        ...fields,
        updatedAt: now,
        deletedAt: null,
      };
      data[collection][record.id] = record;
      persist();
      return record;
    },

    update(collection, id, fields) {
      const record = data[collection][id];
      if (!record) return null;
      Object.assign(record, fields, { updatedAt: Date.now() });
      persist();
      return record;
    },

    /// Applies changes without touching persistence, so a batch (e.g. a calendar
    /// import) results in a single write and a single re-render.
    batch(work) {
      const result = work(mutators);
      persist();
      return result;
    },

    remove(collection, id) {
      const now = Date.now();
      softDelete(collection, id, now);
      persist();
    },

    settings() { return data.settings; },

    updateSettings(fields) {
      Object.assign(data.settings, fields, { updatedAt: Date.now() });
      persist();
    },

    /// Settings that must never leave the device (the sync token) are stored
    /// separately by the caller, so nothing here needs redacting before upload.
    clearEverything() {
      data = emptyData();
      persist();
    },
  };

  // Mutators handed to batch(): same semantics, minus the per-call persist.
  const mutators = {
    insert(collection, fields) {
      const now = Date.now();
      const record = { id: newId(), createdAt: now, ...fields, updatedAt: now, deletedAt: null };
      data[collection][record.id] = record;
      return record;
    },
    update(collection, id, fields) {
      const record = data[collection][id];
      if (!record) return null;
      Object.assign(record, fields, { updatedAt: Date.now() });
      return record;
    },
    remove(collection, id) { softDelete(collection, id, Date.now()); },
    all(collection) { return store.all(collection); },
    get(collection, id) { return store.get(collection, id); },
  };

  function softDelete(collection, id, now) {
    const record = data[collection][id];
    if (!record || record.deletedAt) return;
    record.deletedAt = now;
    record.updatedAt = now;
    cascade(collection, id, now);
  }

  /// Replicates the `deleteRule: .cascade` relationships declared on Subject
  /// (schedule entries, assignments, import rules, linked files) and on
  /// ScheduleEntry (class notes).
  function cascade(collection, id, now) {
    if (collection === 'subjects') {
      for (const dependent of ['scheduleEntries', 'assignments', 'importRules', 'links']) {
        for (const record of Object.values(data[dependent])) {
          if (record.subjectId === id && !record.deletedAt) softDelete(dependent, record.id, now);
        }
      }
    } else if (collection === 'scheduleEntries') {
      for (const note of Object.values(data.classNotes)) {
        if (note.scheduleEntryId === id && !note.deletedAt) softDelete('classNotes', note.id, now);
      }
    }
  }

  return store;
}

export function localStoragePersistence(key) {
  return {
    load() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save(data) {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (error) {
        console.warn('Could not save locally:', error);
      }
    },
  };
}

export function memoryPersistence(initial = null) {
  let held = initial;
  return {
    load() { return held; },
    save(data) { held = JSON.parse(JSON.stringify(data)); },
  };
}
