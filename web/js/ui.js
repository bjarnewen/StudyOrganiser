// Small DOM helpers: escaping, native <dialog> sheets, and toasts.

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

/// Opens a modal sheet. `render` receives the form element so callers can wire
/// up their own controls; resolving happens when the form is submitted (Save)
/// or the dialog is dismissed (Cancel / Escape).
export function openSheet({
  title, bodyHtml, confirmLabel = 'Save', destructive = false,
  hideCancel = false, onRender, onConfirm,
}) {
  return new Promise((resolve) => {
    const dialog = el(`
      <dialog class="sheet">
        <form method="dialog" class="sheet-form">
          <header class="sheet-header">
            <button type="button" class="link-button ${hideCancel ? 'invisible' : ''}" data-cancel>Cancel</button>
            <h2>${escapeHtml(title)}</h2>
            <button type="submit" class="link-button strong ${destructive ? 'destructive' : ''}" data-confirm>${escapeHtml(confirmLabel)}</button>
          </header>
          <div class="sheet-body">${bodyHtml}</div>
        </form>
      </dialog>
    `);

    document.body.appendChild(dialog);
    const form = dialog.querySelector('form');

    function close(result) {
      dialog.close();
      dialog.remove();
      resolve(result);
    }

    dialog.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close(null);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const result = onConfirm ? onConfirm(form) : true;
      if (result === false) return; // validation failed; keep the sheet open
      close(result);
    });

    if (onRender) onRender(form, { close });
    dialog.showModal();

    const firstField = form.querySelector('input:not([type=hidden]), textarea, select');
    if (firstField && !matchMedia('(pointer: coarse)').matches) firstField.focus();
  });
}

export function confirmSheet({ title, message, confirmLabel = 'Delete', destructive = true }) {
  return openSheet({
    title,
    confirmLabel,
    destructive,
    bodyHtml: `<p class="sheet-message">${escapeHtml(message)}</p>`,
    onConfirm: () => true,
  }).then((result) => result === true);
}

let toastTimer = null;

export function toast(message, kind = 'info') {
  let host = document.querySelector('.toast');
  if (!host) {
    host = el('<div class="toast" role="status" aria-live="polite"></div>');
    document.body.appendChild(host);
  }
  host.textContent = message;
  host.dataset.kind = kind;
  host.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove('visible'), 4000);
}

/// Field builders shared by the edit sheets.
export function textField({ name, label, value = '', placeholder = '', type = 'text', autocapitalize }) {
  return `
    <label class="field">
      <span class="field-label">${escapeHtml(label)}</span>
      <input class="field-input" type="${type}" name="${name}" value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}"
        ${autocapitalize ? `autocapitalize="${autocapitalize}"` : ''}
        ${type === 'url' || autocapitalize === 'none' ? 'autocorrect="off" spellcheck="false"' : ''} />
    </label>`;
}

export function textAreaField({ name, label, value = '', rows = 4, placeholder = '' }) {
  return `
    <label class="field">
      <span class="field-label">${escapeHtml(label)}</span>
      <textarea class="field-input" name="${name}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>
    </label>`;
}

export function selectField({ name, label, value, options }) {
  const rendered = options.map(({ value: optionValue, label: optionLabel }) => `
    <option value="${escapeHtml(optionValue)}" ${String(optionValue) === String(value) ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>
  `).join('');
  return `
    <label class="field">
      <span class="field-label">${escapeHtml(label)}</span>
      <select class="field-input" name="${name}">${rendered}</select>
    </label>`;
}

export function segmentedField({ name, label, value, options }) {
  const rendered = options.map(({ value: optionValue, label: optionLabel }) => `
    <label class="segment">
      <input type="radio" name="${name}" value="${escapeHtml(optionValue)}" ${String(optionValue) === String(value) ? 'checked' : ''} />
      <span>${escapeHtml(optionLabel)}</span>
    </label>`).join('');
  return `
    <div class="field">
      <span class="field-label">${escapeHtml(label)}</span>
      <div class="segmented" role="radiogroup" aria-label="${escapeHtml(label)}">${rendered}</div>
    </div>`;
}

/// <input type="datetime-local"> wants a local ISO string without the zone.
export function toLocalInputValue(timestamp) {
  const date = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInputValue(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
}
