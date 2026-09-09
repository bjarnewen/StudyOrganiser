// App shell: routing, rendering, the edit sheets, and sync orchestration.

import { createStore, localStoragePersistence } from './store.js';
import { parseICS } from './ics.js';
import { autoImport, applyRuleCorrection } from './importer.js';
import { fetchCalendarText, fetchMirror, mirrorAvailable, readFileAsText } from './calendar.js';
import {
  CLASS_TYPES, PRIORITIES, SUBJECT_PALETTE, subjectColor, timeString,
} from './domain.js';
import { icon, SECTION_SYMBOLS, TYPE_SYMBOLS } from './icons.js';
import { typeBadge } from './components.js';
import {
  el, escapeHtml, openSheet, confirmSheet, toast,
  textField, textAreaField, selectField, segmentedField,
  toLocalInputValue, fromLocalInputValue,
} from './ui.js';
import {
  loadSyncConfig, saveSyncConfig, clearSyncConfig,
  verifyToken, findSyncGist, createSyncGist, syncOnce, SyncError,
} from './sync.js';

import * as todayView from './views/today.js';
import * as scheduleView from './views/schedule.js';
import * as assignmentsView from './views/assignments.js';
import * as subjectsView from './views/subjects.js';
import * as settingsView from './views/settings.js';

const STORAGE_KEY = 'studyorganiser.data';

const SECTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'subjects', label: 'Subjects' },
  { id: 'settings', label: 'Settings' },
];

const VIEWS = {
  today: todayView,
  schedule: scheduleView,
  assignments: assignmentsView,
  subjects: subjectsView,
  settings: settingsView,
};

const store = createStore(localStoragePersistence(STORAGE_KEY));
let syncConfig = loadSyncConfig();

const state = {
  section: 'today',
  assignmentFilterSubjectId: null,
  mirrorAvailable: false,
  lastSyncedAt: syncConfig.lastSyncedAt || 0,
  syncStatusText: 'Idle',
  importMessage: null,
  importFailed: false,
};

const context = { store, state, get syncConfig() { return syncConfig; } };

// ---------------------------------------------------------------- rendering

const content = document.getElementById('content');
const sidebarNav = document.getElementById('sidebar-nav');
const tabBar = document.getElementById('tab-bar');

function renderNav() {
  sidebarNav.innerHTML = SECTIONS.map(({ id, label }) => `
    <a class="nav-item ${state.section === id ? 'active' : ''}" href="#/${id}">
      ${icon(SECTION_SYMBOLS[id])}<span>${label}</span>
    </a>`).join('');

  tabBar.innerHTML = SECTIONS.map(({ id, label }) => `
    <a class="tab-item ${state.section === id ? 'active' : ''}" href="#/${id}" aria-label="${label}">
      ${icon(SECTION_SYMBOLS[id])}<span>${label}</span>
    </a>`).join('');
}

let renderQueued = false;

function render() {
  renderQueued = false;
  renderNav();
  const view = VIEWS[state.section] || VIEWS.today;
  const scroller = content.parentElement;
  const previousScroll = scroller.scrollTop;
  content.replaceChildren(view.render(context));
  scroller.scrollTop = previousScroll;
}

/// Coalesces the bursts of store notifications a batch import produces.
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(render);
}

function navigate(section) {
  if (!VIEWS[section]) section = 'today';
  state.section = section;
  render();
}

function applyRoute() {
  const section = (location.hash || '#/today').replace(/^#\/?/, '') || 'today';
  navigate(section);
}

// ------------------------------------------------------------------ sheets

function subjectOptions(selectedId) {
  return [
    { value: '', label: 'None' },
    ...store.all('subjects')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((subject) => ({ value: subject.id, label: subject.name })),
  ].map((option) => ({ ...option, selected: option.value === selectedId }));
}

/// Port of ClassDetailView: the class's details plus its running list of
/// follow-up notes, which stay attached so they resurface next time it comes around.
async function openClassDetail(entryId) {
  const entry = store.get('scheduleEntries', entryId);
  if (!entry) return;
  const subject = store.get('subjects', entry.subjectId);

  await openSheet({
    title: subject?.name || entry.title,
    confirmLabel: 'Done',
    hideCancel: true,
    bodyHtml: `
      <div class="detail-summary">
        ${typeBadge(entry.type)}
        <span class="detail-time">${escapeHtml(timeString(entry.startMinutes))} – ${escapeHtml(timeString(entry.endMinutes))}</span>
      </div>
      ${entry.location ? `<p class="detail-location">${icon('mappin.and.ellipse')}${escapeHtml(entry.location)}</p>` : ''}
      <div class="field">
        <span class="field-label">Add a note</span>
        <div class="inline-add">
          <input class="field-input" type="text" data-note-text placeholder="e.g. Review chapter 3 before next class" />
          <button type="button" class="secondary-button" data-add-note>Add</button>
        </div>
        <p class="field-hint">Notes stay attached to this class, so they're here again next time it comes around.</p>
      </div>
      <div data-notes-host></div>`,
    onRender(form) {
      const host = form.querySelector('[data-notes-host]');
      const input = form.querySelector('[data-note-text]');

      function notesHtml() {
        const notes = store.all('classNotes')
          .filter((note) => note.scheduleEntryId === entryId)
          .sort((a, b) => b.createdAt - a.createdAt);
        if (notes.length === 0) return '';
        return `
          <h3 class="group-header">Follow-up Notes</h3>
          <div class="list-card">
            ${notes.map((note) => `
              <div class="note-row ${note.isResolved ? 'done' : ''}">
                <button type="button" class="toggle-button" data-toggle-note="${escapeHtml(note.id)}"
                  aria-label="${note.isResolved ? 'Mark as unresolved' : 'Mark as resolved'}">
                  ${icon(note.isResolved ? 'checkmark.circle.fill' : 'circle', { className: note.isResolved ? 'checked' : '' })}
                </button>
                <span class="note-text">${escapeHtml(note.text)}</span>
                <button type="button" class="icon-button destructive" data-delete-note="${escapeHtml(note.id)}" aria-label="Delete note">${icon('trash')}</button>
              </div>`).join('')}
          </div>`;
      }

      function refreshNotes() { host.innerHTML = notesHtml(); }

      function addNote() {
        const text = input.value.trim();
        if (!text) return;
        store.insert('classNotes', { text, isResolved: false, scheduleEntryId: entryId });
        input.value = '';
        refreshNotes();
      }

      form.querySelector('[data-add-note]').addEventListener('click', addNote);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          addNote();
        }
      });

      host.addEventListener('click', (event) => {
        const toggle = event.target.closest('[data-toggle-note]');
        if (toggle) {
          const note = store.get('classNotes', toggle.dataset.toggleNote);
          if (note) store.update('classNotes', note.id, { isResolved: !note.isResolved });
          refreshNotes();
          return;
        }
        const remove = event.target.closest('[data-delete-note]');
        if (remove) {
          store.remove('classNotes', remove.dataset.deleteNote);
          refreshNotes();
        }
      });

      refreshNotes();
    },
    onConfirm: () => true,
  });
}

/// Port of AssignmentEditView.
async function openAssignmentEditor(assignmentId) {
  const assignment = assignmentId ? store.get('assignments', assignmentId) : null;
  const dueDate = assignment ? assignment.dueDate : Date.now();

  const result = await openSheet({
    title: assignment ? 'Edit Assignment' : 'New Assignment',
    bodyHtml: `
      ${textField({ name: 'title', label: 'Title', value: assignment?.title || '', placeholder: 'e.g. Problem set 3' })}
      ${textField({ name: 'dueDate', label: 'Due', value: toLocalInputValue(dueDate), type: 'datetime-local' })}
      ${selectField({ name: 'subjectId', label: 'Subject', value: assignment?.subjectId || '', options: subjectOptions(assignment?.subjectId) })}
      ${segmentedField({ name: 'priority', label: 'Priority', value: assignment ? assignment.priority : 1, options: PRIORITIES.map((p) => ({ value: p.value, label: p.label })) })}
      ${textAreaField({ name: 'notes', label: 'Notes', value: assignment?.notes || '' })}
      ${assignment ? '<div class="button-row"><button type="button" class="secondary-button destructive" data-delete>Delete assignment</button></div>' : ''}`,
    onRender(form, { close }) {
      const deleteButton = form.querySelector('[data-delete]');
      if (deleteButton) {
        deleteButton.addEventListener('click', async () => {
          close(null);
          const confirmed = await confirmSheet({
            title: 'Delete assignment?',
            message: `"${assignment.title}" will be removed from every synced device.`,
          });
          if (confirmed) {
            store.remove('assignments', assignment.id);
            toast('Assignment deleted');
          }
        });
      }
    },
    onConfirm(form) {
      const data = new FormData(form);
      const title = String(data.get('title') || '').trim();
      if (!title) {
        form.querySelector('[name=title]').focus();
        return false;
      }
      return {
        title,
        dueDate: fromLocalInputValue(String(data.get('dueDate'))),
        subjectId: String(data.get('subjectId') || '') || null,
        priority: Number(data.get('priority')),
        notes: String(data.get('notes') || ''),
      };
    },
  });

  if (!result) return;
  if (assignment) {
    store.update('assignments', assignment.id, result);
  } else {
    store.insert('assignments', { ...result, isCompleted: false });
  }
}

/// Port of SubjectEditView. Linked files became linked *URLs*: a browser has no
/// equivalent of a security-scoped bookmark, and a URL has the advantage of
/// syncing to the other devices, which a per-device bookmark never could.
async function openSubjectEditor(subjectId) {
  const subject = subjectId ? store.get('subjects', subjectId) : null;

  const swatches = SUBJECT_PALETTE.map((hex) => `
    <label class="swatch">
      <input type="radio" name="colorHex" value="${hex}" ${hex === (subject?.colorHex || SUBJECT_PALETTE[0]) ? 'checked' : ''} />
      <span style="background:${subjectColor(hex)}">${icon('checkmark')}</span>
    </label>`).join('');

  const result = await openSheet({
    title: subject ? 'Edit Subject' : 'New Subject',
    bodyHtml: `
      ${textField({ name: 'name', label: 'Subject name', value: subject?.name || '', placeholder: 'e.g. Linear Algebra' })}
      <div class="field">
        <span class="field-label">Colour</span>
        <div class="swatch-grid">${swatches}</div>
      </div>
      ${subject ? `
        <div class="field">
          <span class="field-label">Links</span>
          <div data-links-host></div>
          <div class="inline-add">
            <input class="field-input" type="text" data-link-name placeholder="Name, e.g. GoodNotes notebook" />
            <input class="field-input" type="url" data-link-url placeholder="https://…" autocapitalize="none" autocorrect="off" spellcheck="false" />
            <button type="button" class="secondary-button" data-add-link>Add</button>
          </div>
          <p class="field-hint">Paste a share link to a notebook, folder or document — an iCloud Drive or GoodNotes share link, a Google Drive file, anything with a URL. Links sync to your other devices, and open in whichever app handles them there.</p>
        </div>
        <div class="button-row"><button type="button" class="secondary-button destructive" data-delete>Delete subject</button></div>` : ''}`,
    onRender(form, { close }) {
      if (!subject) return;
      const host = form.querySelector('[data-links-host]');

      function refreshLinks() {
        const links = store.all('links')
          .filter((link) => link.subjectId === subject.id)
          .sort((a, b) => a.addedAt - b.addedAt);
        host.innerHTML = links.length === 0 ? '' : `
          <div class="list-card">
            ${links.map((link) => `
              <div class="link-row">
                <a class="link-main" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
                  ${icon('link')}<span>${escapeHtml(link.displayName)}</span>
                </a>
                <button type="button" class="icon-button destructive" data-delete-link="${escapeHtml(link.id)}" aria-label="Remove link">${icon('trash')}</button>
              </div>`).join('')}
          </div>`;
      }

      form.querySelector('[data-add-link]').addEventListener('click', () => {
        const nameInput = form.querySelector('[data-link-name]');
        const urlInput = form.querySelector('[data-link-url]');
        const url = urlInput.value.trim();
        if (!url) {
          urlInput.focus();
          return;
        }
        let parsed;
        try {
          parsed = new URL(url);
        } catch {
          toast('That link needs to be a full URL, starting with https://', 'error');
          return;
        }
        store.insert('links', {
          displayName: nameInput.value.trim() || parsed.hostname,
          url: parsed.toString(),
          subjectId: subject.id,
          addedAt: Date.now(),
        });
        nameInput.value = '';
        urlInput.value = '';
        refreshLinks();
      });

      host.addEventListener('click', (event) => {
        const remove = event.target.closest('[data-delete-link]');
        if (!remove) return;
        store.remove('links', remove.dataset.deleteLink);
        refreshLinks();
      });

      form.querySelector('[data-delete]').addEventListener('click', async () => {
        close(null);
        const confirmed = await confirmSheet({
          title: 'Delete subject?',
          message: `"${subject.name}" and everything filed under it — classes, assignments, notes and links — will be removed from every synced device.`,
        });
        if (confirmed) {
          store.remove('subjects', subject.id);
          toast('Subject deleted');
        }
      });

      refreshLinks();
    },
    onConfirm(form) {
      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      if (!name) {
        form.querySelector('[name=name]').focus();
        return false;
      }
      return { name, colorHex: String(data.get('colorHex') || SUBJECT_PALETTE[0]) };
    },
  });

  if (!result) return;
  if (subject) {
    store.update('subjects', subject.id, result);
  } else {
    store.insert('subjects', result);
  }
}

/// Port of EditImportRuleView.
async function openRuleEditor(ruleId) {
  const rule = store.get('importRules', ruleId);
  if (!rule) return;

  const result = await openSheet({
    title: rule.matchText.replace(/\b\w/g, (c) => c.toUpperCase()),
    bodyHtml: `
      ${segmentedField({ name: 'type', label: 'Class type', value: rule.type, options: CLASS_TYPES.map((t) => ({ value: t, label: t })) })}
      ${selectField({ name: 'subjectId', label: 'Subject', value: rule.subjectId || '', options: subjectOptions(rule.subjectId) })}
      <p class="field-hint">The correction is applied to every class this rule already created, and sticks for future syncs.</p>`,
    onConfirm(form) {
      const data = new FormData(form);
      return {
        type: String(data.get('type')),
        subjectId: String(data.get('subjectId') || '') || null,
      };
    },
  });

  if (!result) return;
  applyRuleCorrection(store, ruleId, result);
  toast('Class mapping updated');
}

// -------------------------------------------------------------------- sync

let syncTimer = null;
let syncInFlight = false;
let applyingRemote = false;

function setSyncStatus(text) {
  state.syncStatusText = text;
  if (state.section === 'settings') scheduleRender();
}

function syncConnected() {
  return Boolean(syncConfig.token && syncConfig.gistId);
}

async function runSync({ quiet = true } = {}) {
  if (!syncConnected() || syncInFlight) return;
  syncInFlight = true;
  setSyncStatus('Syncing…');
  try {
    applyingRemote = true;
    const { pulled } = await syncOnce({ token: syncConfig.token, gistId: syncConfig.gistId, store });
    applyingRemote = false;

    state.lastSyncedAt = Date.now();
    syncConfig = { ...syncConfig, lastSyncedAt: state.lastSyncedAt };
    saveSyncConfig(syncConfig);
    setSyncStatus('Up to date');
    if (pulled) {
      scheduleRender();
      if (!quiet) toast('Pulled changes from your other devices');
    }
  } catch (error) {
    applyingRemote = false;
    setSyncStatus(error instanceof SyncError ? error.message : 'Sync failed');
    if (!quiet) toast(error.message, 'error');
  } finally {
    syncInFlight = false;
    if (state.section === 'settings') scheduleRender();
  }
}

function scheduleSync() {
  if (!syncConnected() || applyingRemote) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => runSync(), 2500);
}

async function openSyncSetup() {
  const result = await openSheet({
    title: 'Set up sync',
    confirmLabel: 'Connect',
    bodyHtml: `
      <p class="sheet-message">Study Organiser keeps your data in a single <strong>private gist</strong> on your own GitHub account. Every device you paste the same token into stays in step, and nothing is stored anywhere else.</p>
      <ol class="steps">
        <li>Open <a href="https://github.com/settings/tokens/new?scopes=gist&description=Study%20Organiser%20sync" target="_blank" rel="noopener noreferrer">github.com/settings/tokens/new</a> — the link preselects what's needed.</li>
        <li>Check <strong>only</strong> the <code>gist</code> scope, pick an expiry, and generate the token.</li>
        <li>Copy it and paste it below. Do this once per device.</li>
      </ol>
      ${textField({ name: 'token', label: 'GitHub token', placeholder: 'ghp_…', autocapitalize: 'none' })}
      <p class="field-hint">The token is kept in this browser's local storage on this device only — it is never written into the synced file. A token with the <code>gist</code> scope can read and write all of your gists, so revoke it from GitHub's settings if you stop using the app.</p>`,
    onConfirm(form) {
      const token = String(new FormData(form).get('token') || '').trim();
      if (!token) {
        form.querySelector('[name=token]').focus();
        return false;
      }
      return { token };
    },
  });

  if (!result) return;
  const { token } = result;
  setSyncStatus('Connecting…');

  try {
    const login = await verifyToken(token);
    let gistId = await findSyncGist(token);
    let created = false;
    if (!gistId) {
      gistId = await createSyncGist(token, store.raw());
      created = true;
    }
    syncConfig = { token, gistId, login };
    saveSyncConfig(syncConfig);
    await runSync({ quiet: false });
    toast(created
      ? `Sync set up for ${login}. A private gist now holds your data.`
      : `Connected to the existing sync gist on ${login}.`);
  } catch (error) {
    setSyncStatus(error.message);
    toast(error.message, 'error');
  }
  scheduleRender();
}

async function disconnectSync() {
  const confirmed = await confirmSheet({
    title: 'Disconnect sync?',
    message: 'This device stops syncing and forgets the token. Your data stays on this device, and the gist stays on GitHub.',
    confirmLabel: 'Disconnect',
  });
  if (!confirmed) return;
  clearSyncConfig();
  syncConfig = {};
  state.lastSyncedAt = 0;
  setSyncStatus('Idle');
  scheduleRender();
  toast('Sync disconnected');
}

// ---------------------------------------------------------------- calendar

async function importCalendarText(icsText, sourceLabel) {
  const events = parseICS(icsText);
  if (events.length === 0) {
    state.importFailed = true;
    state.importMessage = 'No events were found in that calendar.';
    scheduleRender();
    return;
  }

  const summary = autoImport(events, store);
  store.updateSettings({ lastImportAt: Date.now() });

  const parts = [`${summary.totalDistinctClasses} ${summary.totalDistinctClasses === 1 ? 'class' : 'classes'} on your schedule`];
  if (summary.newSubjectsCreated > 0) {
    parts.push(`${summary.newSubjectsCreated} new ${summary.newSubjectsCreated === 1 ? 'subject' : 'subjects'} created`);
  }
  state.importFailed = false;
  state.importMessage = `${parts.join(' · ')} (from ${sourceLabel})`;
  scheduleRender();
  toast(state.importMessage);
}

async function importNow() {
  const url = (store.settings().icsUrl || '').trim();
  state.importMessage = 'Importing…';
  state.importFailed = false;
  scheduleRender();

  // The mirror is same-origin and therefore always readable; only fall back to
  // hitting the calendar provider directly when there isn't one.
  if (state.mirrorAvailable) {
    try {
      await importCalendarText(await fetchMirror(), 'the daily mirror');
      return;
    } catch { /* fall through to the direct download */ }
  }

  if (!url) {
    state.importFailed = true;
    state.importMessage = 'Add your calendar URL first, or import an .ics file.';
    scheduleRender();
    return;
  }

  try {
    const text = await fetchCalendarText(url, { proxyTemplate: store.settings().corsProxy || '' });
    await importCalendarText(text, 'your calendar URL');
  } catch (error) {
    state.importFailed = true;
    state.importMessage = error.message;
    scheduleRender();
  }
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(store.raw(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `study-organiser-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------------------ interactions

content.addEventListener('click', async (event) => {
  const target = event.target;

  const entryButton = target.closest('[data-entry-id]');
  if (entryButton) return openClassDetail(entryButton.dataset.entryId);

  const toggleAssignment = target.closest('[data-toggle-assignment]');
  if (toggleAssignment) {
    const assignment = store.get('assignments', toggleAssignment.dataset.toggleAssignment);
    if (assignment) store.update('assignments', assignment.id, { isCompleted: !assignment.isCompleted });
    return undefined;
  }

  const assignmentButton = target.closest('[data-assignment-id]');
  if (assignmentButton) return openAssignmentEditor(assignmentButton.dataset.assignmentId);

  if (target.closest('[data-add-assignment]')) return openAssignmentEditor(null);

  const subjectButton = target.closest('[data-subject-id]');
  if (subjectButton) return openSubjectEditor(subjectButton.dataset.subjectId);

  if (target.closest('[data-add-subject]')) return openSubjectEditor(null);

  const ruleButton = target.closest('[data-rule-id]');
  if (ruleButton) return openRuleEditor(ruleButton.dataset.ruleId);

  if (target.closest('[data-import-now]')) return importNow();

  if (target.closest('[data-import-file]')) {
    content.querySelector('[data-ics-file]')?.click();
    return undefined;
  }

  if (target.closest('[data-sync-connect]')) return openSyncSetup();
  if (target.closest('[data-sync-now]')) return runSync({ quiet: false });
  if (target.closest('[data-sync-disconnect]')) return disconnectSync();
  if (target.closest('[data-export-data]')) return exportBackup();

  if (target.closest('[data-reset-data]')) {
    const confirmed = await confirmSheet({
      title: 'Erase local data?',
      message: 'Everything on this device is cleared. If sync is still connected it will come back on the next sync.',
      confirmLabel: 'Erase',
    });
    if (confirmed) {
      store.clearEverything();
      toast('Local data erased');
    }
    return undefined;
  }

  return undefined;
});

content.addEventListener('change', async (event) => {
  const target = event.target;

  if (target.matches('[data-subject-filter]')) {
    state.assignmentFilterSubjectId = target.value || null;
    scheduleRender();
    return;
  }

  if (target.matches('[data-ics-file]') && target.files?.[0]) {
    try {
      const text = await readFileAsText(target.files[0]);
      await importCalendarText(text, target.files[0].name);
    } catch (error) {
      state.importFailed = true;
      state.importMessage = error.message;
      scheduleRender();
    }
    target.value = '';
  }
});

// Settings text fields commit on blur so a half-typed URL isn't saved on every keystroke.
content.addEventListener('focusout', (event) => {
  const target = event.target;
  if (target.matches('[data-ics-url]')) {
    const value = target.value.trim();
    if (value !== (store.settings().icsUrl || '')) store.updateSettings({ icsUrl: value });
  } else if (target.matches('[data-cors-proxy]')) {
    const value = target.value.trim();
    if (value !== (store.settings().corsProxy || '')) store.updateSettings({ corsProxy: value });
  }
});

// ------------------------------------------------------------------- start

store.subscribe(() => {
  if (!applyingRemote) scheduleSync();
  scheduleRender();
});

window.addEventListener('hashchange', applyRoute);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') runSync();
});
window.addEventListener('online', () => runSync());
setInterval(() => {
  if (document.visibilityState === 'visible') runSync();
}, 60_000);

applyRoute();

mirrorAvailable().then((available) => {
  state.mirrorAvailable = available;
  if (state.section === 'settings') scheduleRender();
});

if (syncConnected()) runSync();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support is optional */ });
  });
}
