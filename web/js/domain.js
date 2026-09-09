// Port of Sources/Models/ClassType.swift, Priority.swift,
// Views/Components/SubjectColor.swift and Services/SubjectNameGuesser.swift.

export const CLASS_TYPES = ['Lecture', 'Tutorial', 'Practical', 'Exam', 'Other'];

/// Keyword groups used both to guess a class's type and (in guessSubjectName)
/// to strip the type indicator out of a title to recover the subject name.
export const KEYWORDS_BY_TYPE = {
  Lecture: ['lecture', 'vorlesung'],
  Tutorial: ['tutorial', 'übung', 'uebung', 'exercise'],
  Practical: ['practical', 'lab', 'praktikum'],
  Exam: ['exam', 'klausur', 'test', 'prüfung', 'pruefung', 'final', 'midterm'],
};

/// Best-effort guess based on common naming conventions in university timetable exports.
export function guessClassType(title) {
  const lowered = (title || '').toLowerCase();
  for (const [type, keywords] of Object.entries(KEYWORDS_BY_TYPE)) {
    if (keywords.some((keyword) => lowered.includes(keyword))) return type;
  }
  return 'Other';
}

const ALL_KEYWORDS = Object.values(KEYWORDS_BY_TYPE).flat();
const LEADING_COURSE_CODE = /^[A-Za-z]{2,8}\d{2,6}(-\d{1,6})?\s+/;
const SEPARATORS = /[:\-–—,()[\]]/g;

/// Strips a leading course-code token like "WBPH001-10" or "CS101", common in
/// university timetable exports, so the guessed subject name is just the
/// human-readable course title.
function stripLeadingCourseCode(text) {
  return text.replace(LEADING_COURSE_CODE, '');
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/// Strips the class-type indicator (and surrounding punctuation) out of a
/// calendar event title, leaving what's most likely the course/subject name.
/// E.g. "Lecture: Linear Algebra" -> "Linear Algebra".
export function guessSubjectName(title) {
  let cleaned = stripLeadingCourseCode(title || '');
  for (const keyword of ALL_KEYWORDS) {
    cleaned = cleaned.replace(new RegExp(escapeRegExp(keyword), 'gi'), ' ');
  }
  cleaned = cleaned.replace(SEPARATORS, ' ');
  const result = cleaned.split(/\s+/).filter(Boolean).join(' ');
  return result === '' ? (title || '').trim() : result;
}

export const PRIORITIES = [
  { value: 0, label: 'Low', color: '#34C759' },
  { value: 1, label: 'Medium', color: '#FF9500' },
  { value: 2, label: 'High', color: '#FF3B30' },
];

export function priorityInfo(raw) {
  return PRIORITIES.find((p) => p.value === raw) || PRIORITIES[1];
}

export const SUBJECT_PALETTE = [
  'FF3B30', 'FF9500', 'FFCC00', '34C759', '00C7BE',
  '30B0C7', '0A84FF', '5E5CE6', 'AF52DE', 'FF2D55',
];

export function subjectColor(hex) {
  if (typeof hex === 'string' && /^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`;
  return 'var(--accent)';
}

/// Calendar weekday numbers match Foundation's: 1 = Sunday ... 7 = Saturday.
export const WEEKDAY_ORDER = [2, 3, 4, 5, 6, 7, 1]; // Monday...Sunday

export function weekdayName(weekday, style = 'long') {
  // 1 = Sunday. 2021-08-01 was a Sunday, so day-of-month == weekday for that week.
  const date = new Date(2021, 7, weekday);
  return date.toLocaleDateString(undefined, { weekday: style });
}

export function timeString(minutes) {
  const date = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function normalize(text) {
  return (text || '').trim().toLowerCase();
}
