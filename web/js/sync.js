// Sync across devices through a private GitHub gist.
//
// This is what replaces CloudKit from the SwiftData version. A gist is just a
// versioned JSON file behind an authenticated API, which is enough for a
// single-user app and costs nothing.
//
// Merging is per record, not per file: whichever copy of a record has the newer
// updatedAt wins, and deletes survive as tombstones. Two devices that were both
// offline therefore keep each other's edits instead of one silently winning.

import { COLLECTIONS, SCHEMA_VERSION } from './store.js';

const API = 'https://api.github.com';
const GIST_FILENAME = 'study-organiser.json';
const GIST_DESCRIPTION = 'Study Organiser — app data (private)';
const CONFIG_KEY = 'studyorganiser.sync';

/// The token never goes into the synced document, only into this device's own
/// storage, so it can't be uploaded to the gist by accident.
export function loadSyncConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSyncConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.warn('Could not save sync settings:', error);
  }
}

export function clearSyncConfig() {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch { /* nothing we can do */ }
}

export class SyncError extends Error {
  constructor(message, { recoverable = true } = {}) {
    super(message);
    this.name = 'SyncError';
    this.recoverable = recoverable;
  }
}

async function request(path, { token, method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SyncError("Couldn't reach GitHub. Check your connection.");
  }

  if (response.status === 401) {
    throw new SyncError('GitHub rejected the token. Create a new one and paste it in again.', { recoverable: false });
  }
  if (response.status === 403) {
    throw new SyncError('GitHub refused the request. The token probably lacks the "gist" scope.', { recoverable: false });
  }
  if (response.status === 404) {
    throw new SyncError('That sync gist no longer exists. Disconnect and set sync up again.', { recoverable: false });
  }
  if (!response.ok) {
    throw new SyncError(`GitHub returned ${response.status} ${response.statusText}.`);
  }
  return response.json();
}

async function readGistDocument(gist) {
  const file = gist.files && gist.files[GIST_FILENAME];
  if (!file) return null;
  // Gists over ~1 MB come back truncated with the full copy behind raw_url.
  const content = file.truncated && file.raw_url
    ? await (await fetch(file.raw_url)).text()
    : file.content;
  try {
    return JSON.parse(content);
  } catch {
    throw new SyncError('The sync file is not readable JSON. It may have been edited by hand.', { recoverable: false });
  }
}

function documentBody(data) {
  return { files: { [GIST_FILENAME]: { content: JSON.stringify(data, null, 2) } } };
}

/// Per-record last-write-wins. Returns the merged document plus whether it
/// differs from each side, so the caller knows if a push or a re-render is needed.
export function mergeDocuments(local, remote) {
  const merged = { schemaVersion: SCHEMA_VERSION, settings: {} };
  let localChanged = false;
  let remoteChanged = false;

  for (const collection of COLLECTIONS) {
    const localRecords = (local && local[collection]) || {};
    const remoteRecords = (remote && remote[collection]) || {};
    const combined = {};

    for (const id of new Set([...Object.keys(localRecords), ...Object.keys(remoteRecords)])) {
      const mine = localRecords[id];
      const theirs = remoteRecords[id];

      if (!theirs) {
        combined[id] = mine;
        remoteChanged = true;
      } else if (!mine) {
        combined[id] = theirs;
        localChanged = true;
      } else if ((theirs.updatedAt || 0) > (mine.updatedAt || 0)) {
        combined[id] = theirs;
        localChanged = true;
      } else {
        combined[id] = mine;
        if ((mine.updatedAt || 0) > (theirs.updatedAt || 0)) remoteChanged = true;
      }
    }
    merged[collection] = combined;
  }

  const localSettings = (local && local.settings) || { updatedAt: 0 };
  const remoteSettings = (remote && remote.settings) || { updatedAt: 0 };
  if ((remoteSettings.updatedAt || 0) > (localSettings.updatedAt || 0)) {
    merged.settings = remoteSettings;
    localChanged = true;
  } else {
    merged.settings = localSettings;
    if ((localSettings.updatedAt || 0) > (remoteSettings.updatedAt || 0)) remoteChanged = true;
  }

  return { merged, localChanged, remoteChanged };
}

/// Creates the private gist that will hold this account's data.
export async function createSyncGist(token, data) {
  const gist = await request('/gists', {
    token,
    method: 'POST',
    body: { description: GIST_DESCRIPTION, public: false, ...documentBody(data) },
  });
  return gist.id;
}

/// Finds an existing Study Organiser gist on the account, so a second device can
/// be connected with just the token — no need to copy the gist id across by hand.
export async function findSyncGist(token) {
  const gists = await request('/gists?per_page=100', { token });
  const match = gists.find((gist) => gist.files && gist.files[GIST_FILENAME]);
  return match ? match.id : null;
}

export async function verifyToken(token) {
  const user = await request('/user', { token });
  return user.login;
}

/// One full round trip: pull, merge, write the merge back locally, and push if
/// this device holds anything the gist doesn't.
export async function syncOnce({ token, gistId, store }) {
  const gist = await request(`/gists/${gistId}`, { token });
  const remote = await readGistDocument(gist);

  const local = store.raw();
  const { merged, localChanged, remoteChanged } = mergeDocuments(local, remote);

  if (localChanged || remote === null) store.replaceAll(merged);
  if (remoteChanged || remote === null) {
    await request(`/gists/${gistId}`, { token, method: 'PATCH', body: documentBody(merged) });
  }

  return { pulled: localChanged, pushed: remoteChanged || remote === null };
}
