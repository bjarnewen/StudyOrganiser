// Port of Sources/Views/Settings/SettingsView.swift, plus the sync setup that
// replaces the iCloud capability from the SwiftData version.

import { typeBadge } from '../components.js';
import { el, escapeHtml } from '../ui.js';
import { icon } from '../icons.js';

function formatTimestamp(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  });
}

export function render(context) {
  const { store, state, syncConfig } = context;
  const settings = store.settings();
  const rules = store.all('importRules').sort((a, b) => a.matchText.localeCompare(b.matchText));

  const mirrorRow = state.mirrorAvailable
    ? `<p class="field-hint good">${icon('checkmark')}A daily mirror of your calendar is published with the app — importing uses it automatically, so no CORS workaround is needed.</p>`
    : `<p class="field-hint">No mirror is published yet. Add your calendar URL as an <code>ICS_URL</code> repository secret to have GitHub Actions refresh one daily — see the README.</p>`;

  const rulesSection = rules.length === 0 ? '' : `
    <section class="settings-group">
      <h2>Class Mappings</h2>
      <div class="list-card">
        ${rules.map((rule) => {
          const subject = store.get('subjects', rule.subjectId);
          return `
            <button type="button" class="rule-row" data-rule-id="${escapeHtml(rule.id)}">
              <span class="subject-row-main">
                <span class="row-title">${escapeHtml(rule.matchText.replace(/\b\w/g, (c) => c.toUpperCase()))}</span>
                <span class="row-details"><span class="row-meta">${escapeHtml(subject ? subject.name : 'No subject')}</span></span>
              </span>
              ${typeBadge(rule.type)}
            </button>`;
        }).join('')}
      </div>
      <p class="field-hint">Tap a class to fix its detected type or subject. The correction sticks for future syncs.</p>
    </section>`;

  const syncConnected = Boolean(syncConfig.token && syncConfig.gistId);
  const syncSection = syncConnected
    ? `
      <p class="field-hint good">${icon('checkmark')}Connected as <strong>${escapeHtml(syncConfig.login || 'your GitHub account')}</strong>. Changes sync automatically.</p>
      <dl class="status-list">
        <div><dt>Last synced</dt><dd>${escapeHtml(formatTimestamp(state.lastSyncedAt))}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(state.syncStatusText || 'Idle')}</dd></div>
      </dl>
      <div class="button-row">
        <button type="button" class="secondary-button" data-sync-now>${icon('arrow.clockwise')}<span>Sync now</span></button>
        <button type="button" class="secondary-button destructive" data-sync-disconnect>Disconnect</button>
      </div>`
    : `
      <p class="field-hint">Your data currently lives only on this device. Connect a GitHub account to keep this Mac, MacBook and iPad in step — it stores one private gist and costs nothing.</p>
      <div class="button-row">
        <button type="button" class="primary-button" data-sync-connect>${icon('icloud.fill')}<span>Set up sync</span></button>
      </div>`;

  return el(`
    <div class="view view-settings">
      <header class="page-header"><h1>Settings</h1></header>

      <section class="settings-group">
        <h2>Calendar Source</h2>
        <label class="field">
          <span class="field-label">iCal / webcal URL</span>
          <input class="field-input" type="url" data-ics-url inputmode="url" autocapitalize="none"
            autocorrect="off" spellcheck="false" placeholder="https://calendar.google.com/…/basic.ics"
            value="${escapeHtml(settings.icsUrl || '')}" />
        </label>
        <div class="button-row">
          <button type="button" class="primary-button" data-import-now>${icon('arrow.clockwise')}<span>Import / Refresh Now</span></button>
          <button type="button" class="secondary-button" data-import-file>${icon('square.and.arrow.down')}<span>Import .ics file</span></button>
        </div>
        <input type="file" accept=".ics,text/calendar" data-ics-file hidden />
        <p class="field-hint">Paste your calendar's iCal (.ics) link and the schedule builds itself — each class's type and subject are detected from its title. In Google Calendar: Settings → pick your calendar → "Integrate calendar" → copy "Secret address in iCal format".</p>
        ${mirrorRow}
        <details class="disclosure">
          <summary>Calendar won't download?</summary>
          <p class="field-hint">Browsers can't read most .ics URLs directly — the calendar server has to allow it, and Google's doesn't. Either import the file by hand with the button above, publish the daily mirror (README), or route the download through a CORS proxy below. A proxy sees your calendar URL, so only use one you trust.</p>
          <label class="field">
            <span class="field-label">CORS proxy template</span>
            <input class="field-input" type="text" data-cors-proxy autocapitalize="none" autocorrect="off"
              spellcheck="false" placeholder="https://your-proxy.example/?{url}"
              value="${escapeHtml(settings.corsProxy || '')}" />
          </label>
          <p class="field-hint">Must contain <code>{url}</code>, which is replaced with the encoded calendar address.</p>
        </details>
      </section>

      <section class="settings-group">
        <h2>Calendar Status</h2>
        <dl class="status-list">
          <div><dt>Last imported</dt><dd>${escapeHtml(formatTimestamp(settings.lastImportAt))}</dd></div>
          <div><dt>Classes on your schedule</dt><dd>${store.all('importRules').length}</dd></div>
        </dl>
        ${state.importMessage ? `<p class="field-hint ${state.importFailed ? 'bad' : 'good'}">${escapeHtml(state.importMessage)}</p>` : ''}
      </section>

      <section class="settings-group">
        <h2>Sync Across Devices</h2>
        ${syncSection}
      </section>

      ${rulesSection}

      <section class="settings-group">
        <h2>This Device</h2>
        <div class="button-row">
          <button type="button" class="secondary-button" data-export-data>${icon('square.and.arrow.down')}<span>Export a backup</span></button>
          <button type="button" class="secondary-button destructive" data-reset-data>Erase local data</button>
        </div>
        <p class="field-hint">Erasing clears this device only. If sync is connected the data comes back on the next sync — disconnect first if you meant to start over.</p>
      </section>
    </div>`);
}
