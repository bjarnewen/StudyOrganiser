// Port of Sources/Services/ICSParser.swift.
//
// One parsed event describes an occurrence pattern extracted from a VEVENT
// block. A weekly-recurring event with multiple BYDAY values (e.g. MO,WE,FR)
// expands to one entry per weekday.
//
// Foundation reads the parsed instant back out in the device's *local* calendar
// to derive weekday/start/end minutes, so this port does the same: resolve each
// DTSTART/DTEND to an absolute instant first, then read it in local time.

/// RFC 5545 line unfolding: a line beginning with a space or tab continues the
/// previous one. Also normalizes CRLF/CR line endings to LF.
function unfold(text) {
  return text.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '');
}

function removingICSEscapes(value) {
  return value
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/g, ' ')
    .replace(/\\N/g, ' ')
    .replace(/\\\\/g, '\\');
}

/// Milliseconds to add to a UTC timestamp to get the wall-clock reading in `timeZone`.
function timeZoneOffset(timestamp, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = {};
  for (const part of formatter.formatToParts(new Date(timestamp))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  // Intl renders midnight as hour 24 in some engines.
  const hour = parts.hour === 24 ? 0 : parts.hour;
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second);
  return asUTC - timestamp;
}

/// The instant at which the given wall-clock time occurs in `timeZone`.
/// Throws if the zone identifier isn't one Intl recognizes.
function instantInZone(y, mo, d, h, mi, s, timeZone) {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  const firstOffset = timeZoneOffset(naive, timeZone);
  let timestamp = naive - firstOffset;
  const secondOffset = timeZoneOffset(timestamp, timeZone);
  if (secondOffset !== firstOffset) timestamp = naive - secondOffset;
  return new Date(timestamp);
}

/// Parses an ICS date/date-time value. Mirrors the Swift implementation:
/// a trailing "Z" means UTC, an unrecognized or absent TZID falls back to the
/// device's local zone, and a date without a time component is midnight local.
function parseICSDate(value, params) {
  const cleaned = (value || '').trim();
  const isUTC = cleaned.endsWith('Z');

  const match = cleaned.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?Z?$/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const y = Number(year), mo = Number(month), d = Number(day);
  const h = Number(hour || 0), mi = Number(minute || 0), s = Number(second || 0);

  // The zone is picked first and the wall-clock components are then read in it,
  // which is what setting DateFormatter.timeZone does on the Swift side.
  if (isUTC) return new Date(Date.UTC(y, mo - 1, d, h, mi, s));

  // TZID values are sometimes quoted; Intl won't accept the quotes.
  const tzid = (params.TZID || '').replace(/^"|"$/g, '');
  if (tzid) {
    try {
      return instantInZone(y, mo, d, h, mi, s, tzid);
    } catch {
      // Windows-style zone names ("W. Europe Standard Time") land here, the same
      // way TimeZone(identifier:) returns nil for them in the Swift version.
    }
  }
  return new Date(y, mo - 1, d, h, mi, s);
}

const BYDAY_TO_WEEKDAY = { SU: 1, MO: 2, TU: 3, WE: 4, TH: 5, FR: 6, SA: 7 };

/// A local calendar day, as YYYY-MM-DD. Dates are compared and stored as these
/// strings rather than timestamps so a class never drifts across midnight when
/// the device's zone differs from the calendar's.
export function dateKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateFromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseRecurrence(rrule, startDate) {
  const parts = {};
  for (const part of rrule.split(';')) {
    const splitAt = part.indexOf('=');
    if (splitAt === -1) continue;
    parts[part.slice(0, splitAt).toUpperCase()] = part.slice(splitAt + 1);
  }

  let weekdays = [startDate.getDay() + 1];
  if (parts.BYDAY) {
    // Tokens may carry an ordinal prefix ("2MO", "-1FR"); the day code is the last two characters.
    const parsed = parts.BYDAY.split(',')
      .map((token) => BYDAY_TO_WEEKDAY[token.trim().toUpperCase().slice(-2)])
      .filter((weekday) => weekday !== undefined);
    if (parsed.length > 0) weekdays = parsed;
  }

  return {
    freq: (parts.FREQ || 'WEEKLY').toUpperCase(),
    interval: Math.max(1, Number(parts.INTERVAL || 1) || 1),
    count: parts.COUNT ? Number(parts.COUNT) : null,
    until: parts.UNTIL ? parseICSDate(parts.UNTIL, {}) : null,
    weekdays: [...new Set(weekdays)].sort((a, b) => a - b),
  };
}

function parseEvent(lines) {
  const properties = {};
  for (const line of lines) {
    if (!line) continue;
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const namePart = line.slice(0, colonIndex);
    const value = line.slice(colonIndex + 1);
    const nameComponents = namePart.split(';');
    const name = nameComponents[0].toUpperCase();
    const params = {};
    for (const paramString of nameComponents.slice(1)) {
      const splitAt = paramString.indexOf('=');
      if (splitAt === -1) continue;
      params[paramString.slice(0, splitAt).toUpperCase()] = paramString.slice(splitAt + 1);
    }
    properties[name] = { params, value };
  }

  const dtstart = properties.DTSTART;
  if (!dtstart) return null;
  const startDate = parseICSDate(dtstart.value, dtstart.params);
  if (!startDate || Number.isNaN(startDate.getTime())) return null;

  let endDate = null;
  if (properties.DTEND) {
    endDate = parseICSDate(properties.DTEND.value, properties.DTEND.params);
  }
  if (!endDate || Number.isNaN(endDate.getTime())) {
    endDate = new Date(startDate.getTime() + 3600 * 1000);
  }

  const summary = properties.SUMMARY ? removingICSEscapes(properties.SUMMARY.value) : 'Untitled';
  const location = properties.LOCATION ? removingICSEscapes(properties.LOCATION.value) : '';
  const uid = properties.UID ? properties.UID.value : `generated-${crypto.randomUUID()}`;

  const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  let endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
  // A class ending after midnight, or a DTEND on a later day, would otherwise
  // read as a negative-length block in the week grid.
  if (endMinutes <= startMinutes) endMinutes = Math.min(startMinutes + 60, 24 * 60);

  // EXDATE can appear more than once and can list several dates per line.
  const exceptions = new Set();
  for (const [name, entry] of Object.entries(properties)) {
    if (!name.startsWith('EXDATE')) continue;
    for (const value of entry.value.split(',')) {
      const excluded = parseICSDate(value, entry.params);
      if (excluded && !Number.isNaN(excluded.getTime())) exceptions.add(dateKey(excluded));
    }
  }

  return {
    uid,
    summary,
    location,
    start: startDate,
    startDateKey: dateKey(startDate),
    startMinutes,
    endMinutes,
    recurrence: properties.RRULE ? parseRecurrence(properties.RRULE.value, startDate) : null,
    exceptions: [...exceptions],
  };
}

/// The number of days ahead an unbounded rule is expanded. A timetable that
/// recurs "forever" would otherwise produce occurrences without end, and the
/// series would never look finished for block detection.
export const UNBOUNDED_HORIZON_DAYS = 365;

/// Turns one parsed event into the concrete dates it actually happens on.
/// Everything downstream — the week grid, the "taught right now" filter and
/// block detection — reads occurrences, never the rule.
export function expandOccurrences(event, { horizonDays = UNBOUNDED_HORIZON_DAYS } = {}) {
  const base = {
    startMinutes: event.startMinutes,
    endMinutes: event.endMinutes,
  };
  const rule = event.recurrence;
  if (!rule) {
    return [{ ...base, date: event.startDateKey, bounded: true }];
  }

  const exceptions = new Set(event.exceptions);
  const horizonEnd = addDays(event.start, horizonDays);
  const hardEnd = rule.until && rule.until < horizonEnd ? rule.until : horizonEnd;
  const bounded = Boolean(rule.until || rule.count);

  const occurrences = [];
  const emit = (date) => {
    const key = dateKey(date);
    if (exceptions.has(key)) return true;
    occurrences.push({ ...base, date: key, bounded });
    return rule.count === null || occurrences.length < rule.count;
  };

  if (rule.freq === 'WEEKLY') {
    // Walk from the Sunday of DTSTART's week so BYDAY entries earlier in the
    // week than DTSTART are still placed on the right day.
    let weekStart = addDays(event.start, -event.start.getDay());
    while (weekStart <= hardEnd) {
      for (const weekday of rule.weekdays) {
        const date = addDays(weekStart, weekday - 1);
        if (date < event.start && dateKey(date) !== event.startDateKey) continue;
        if (date > hardEnd) continue;
        if (!emit(date)) return occurrences;
      }
      weekStart = addDays(weekStart, 7 * rule.interval);
    }
    return occurrences;
  }

  if (rule.freq === 'DAILY') {
    for (let date = event.start; date <= hardEnd; date = addDays(date, rule.interval)) {
      if (!emit(date)) return occurrences;
    }
    return occurrences;
  }

  // MONTHLY/YEARLY are vanishingly rare in a class timetable. Rather than
  // guess at BYSETPOS/BYMONTHDAY semantics, keep the first occurrence so the
  // event isn't silently lost, and let it be corrected by hand.
  return [{ ...base, date: event.startDateKey, bounded: true }];
}

export function parseICS(icsText) {
  const lines = unfold(icsText || '').split('\n');
  const events = [];
  let currentLines = [];
  let insideEvent = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r/g, '');
    if (line === 'BEGIN:VEVENT') {
      insideEvent = true;
      currentLines = [];
    } else if (line === 'END:VEVENT') {
      insideEvent = false;
      const event = parseEvent(currentLines);
      if (event) events.push(event);
      currentLines = [];
    } else if (insideEvent) {
      currentLines.push(line);
    }
  }
  return events;
}

export function normalizeCalendarURL(input) {
  let trimmed = (input || '').trim();
  if (trimmed.startsWith('webcal://')) trimmed = `https://${trimmed.slice('webcal://'.length)}`;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}
