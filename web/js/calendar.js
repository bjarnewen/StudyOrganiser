// Getting the .ics file into the browser.
//
// The Swift app could just download the URL. A browser can't: calendar
// providers (Google's "secret address" included) serve .ics files without
// Access-Control-Allow-Origin, so a direct fetch from the page is blocked by
// CORS. Three ways around that, in the order the app tries them:
//
//  1. the mirror — a copy of the calendar published next to the app by the
//     GitHub Actions workflow, so it's same-origin and always allowed;
//  2. a direct fetch — works for the providers that do send CORS headers;
//  3. a CORS proxy the user opts into, knowing the URL passes through it.
//
// Failing all that, the .ics can always be dropped in as a file.

import { normalizeCalendarURL } from './ics.js';

export const MIRROR_PATH = './calendar.ics';

function looksLikeCalendar(text) {
  return typeof text === 'string' && text.includes('BEGIN:VCALENDAR');
}

export async function fetchMirror() {
  const response = await fetch(`${MIRROR_PATH}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`mirror returned ${response.status}`);
  const text = await response.text();
  if (!looksLikeCalendar(text)) throw new Error('mirror is not a calendar file');
  return text;
}

export async function mirrorAvailable() {
  try {
    await fetchMirror();
    return true;
  } catch {
    return false;
  }
}

export function buildProxyURL(template, target) {
  if (!template || !template.includes('{url}')) return null;
  return template.replace('{url}', encodeURIComponent(target));
}

/// Downloads and returns the raw .ics text, or throws an Error whose message is
/// safe to show the user.
export async function fetchCalendarText(rawURL, { proxyTemplate = '' } = {}) {
  const url = normalizeCalendarURL(rawURL);
  if (!url) throw new Error("That doesn't look like a valid calendar URL.");

  let directFailure = null;
  try {
    const response = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    if (!response.ok) throw new Error(`the server returned ${response.status}`);
    const text = await response.text();
    if (!looksLikeCalendar(text)) throw new Error('the response was not a calendar file');
    return text;
  } catch (error) {
    directFailure = error;
  }

  const proxied = buildProxyURL(proxyTemplate, url);
  if (proxied) {
    try {
      const response = await fetch(proxied, { cache: 'no-store' });
      if (!response.ok) throw new Error(`the proxy returned ${response.status}`);
      const text = await response.text();
      if (!looksLikeCalendar(text)) throw new Error('the proxy did not return a calendar file');
      return text;
    } catch (error) {
      throw new Error(`Couldn't download the calendar directly (${directFailure.message}) or through the proxy (${error.message}).`);
    }
  }

  throw new Error(
    `Couldn't download the calendar: ${directFailure.message}. `
    + 'Most calendar providers block browsers from reading their .ics files directly. '
    + 'Set up the daily mirror, or import the file by hand — both are explained under Calendar Source.',
  );
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That file couldn't be read."));
    reader.readAsText(file);
  });
}
