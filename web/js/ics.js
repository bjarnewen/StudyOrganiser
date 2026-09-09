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

  const startWeekday = startDate.getDay() + 1; // JS 0=Sunday -> Foundation 1=Sunday
  const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();

  const rrule = properties.RRULE ? properties.RRULE.value : null;
  if (rrule) {
    const ruleParts = {};
    for (const part of rrule.split(';')) {
      const splitAt = part.indexOf('=');
      if (splitAt === -1) continue;
      ruleParts[part.slice(0, splitAt).toUpperCase()] = part.slice(splitAt + 1);
    }
    let weekdays = [startWeekday];
    if (ruleParts.BYDAY) {
      // Tokens may carry an ordinal prefix ("2MO", "-1FR"); the day code is the last two characters.
      const parsed = ruleParts.BYDAY.split(',')
        .map((token) => BYDAY_TO_WEEKDAY[token.trim().toUpperCase().slice(-2)])
        .filter((weekday) => weekday !== undefined);
      if (parsed.length > 0) weekdays = parsed;
    }
    return {
      uid, summary, location,
      isRecurringWeekly: true,
      weekdays,
      specificDate: null,
      startMinutes, endMinutes,
    };
  }

  return {
    uid, summary, location,
    isRecurringWeekly: false,
    weekdays: [startWeekday],
    specificDate: startDate.toISOString(),
    startMinutes, endMinutes,
  };
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
