// A plain-text dump of why each piece of work does or doesn't appear on a class.
//
// The widgets and the Today view both decide this from several conditions at
// once — due mode, subject, date, whether the class is the course's next — and
// when nothing shows up there is no way to tell which condition failed. This
// reports each one by name.

import { dateKey, dateFromKey, occurrencesOn, nextOccurrenceForSubject, minutesNow } from './schedule.js';
import { detectBlocks, currentBlock } from './blocks.js';

function formatWhen(timestamp) {
  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) return 'no date';
  return new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatTime(minutes) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
  return `${hour}:${String(minutes % 60).padStart(2, '0')}`;
}

/// Why this assignment does or does not land on a class today.
function explainAssignment(store, assignment, today, todaysOccurrences) {
  const subject = store.get('subjects', assignment.subjectId);
  const dueSubject = store.get('subjects', assignment.dueSubjectId);
  const mode = assignment.dueMode === 'class' ? 'by next class' : 'on a date';

  const facts = [
    `mode=${mode}`,
    `subject=${subject ? subject.name : 'NONE'}`,
  ];
  if (assignment.dueMode === 'class') {
    facts.push(`due-by=${dueSubject ? dueSubject.name : 'NONE'}`);
  } else {
    facts.push(`due=${formatWhen(assignment.dueDate)}`);
  }

  let verdict;
  if (assignment.dueMode === 'class') {
    if (!assignment.dueSubjectId) {
      verdict = 'HIDDEN — set to "by next class" but no course chosen';
    } else {
      const next = nextOccurrenceForSubject(store, assignment.dueSubjectId);
      if (!next) {
        verdict = 'HIDDEN — that course has no upcoming class in the calendar';
      } else if (next.date !== today) {
        verdict = `shown on ${next.date} (that course's next class is not today)`;
      } else {
        verdict = `SHOWN on today's ${formatTime(next.startMinutes)} class`;
      }
    }
  } else if (!assignment.subjectId) {
    verdict = 'footer only — no subject, so there is no class to attach it to';
  } else if (typeof assignment.dueDate !== 'number') {
    verdict = 'HIDDEN — no due date stored';
  } else {
    const endOfToday = dateFromKey(today).getTime() + 86400000;
    if (assignment.dueDate >= endOfToday) {
      verdict = 'not yet — due after today';
    } else {
      const mine = todaysOccurrences.filter((o) => o.subjectId === assignment.subjectId);
      verdict = mine.length === 0
        ? 'footer only — that course has no class today'
        : `SHOWN on today's ${formatTime(mine[0].startMinutes)} class`;
    }
  }

  return `  "${assignment.title}"\n      ${facts.join('  ')}\n      -> ${verdict}`;
}

export function buildDiagnostics(store) {
  const today = dateKey(new Date());
  const lines = [];
  const occurrences = occurrencesOn(store, today);

  lines.push('Study Organiser diagnostic');
  lines.push(`today: ${today} (device clock ${formatTime(minutesNow())}, zone ${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
  lines.push(`schema: v${store.raw().schemaVersion}`);
  lines.push(
    `counts: ${store.all('subjects').length} subjects, ${store.all('classes').length} classes, `
    + `${store.all('occurrences').length} sessions, ${store.all('assignments').length} assignments, `
    + `${store.all('checkItems').length} check items`,
  );

  const blocks = detectBlocks(store);
  const active = currentBlock(blocks, today);
  lines.push(`blocks: ${blocks.length} detected, current = ${active ? `${active.label} (${active.start}..${active.end})` : 'none'}`);
  lines.push('');

  lines.push(`Classes today (${occurrences.length}):`);
  if (occurrences.length === 0) {
    lines.push('  none — so nothing can attach to a class today');
  }
  for (const occurrence of occurrences) {
    const subject = store.get('subjects', occurrence.subjectId);
    const next = nextOccurrenceForSubject(store, occurrence.subjectId);
    lines.push(
      `  ${formatTime(occurrence.startMinutes)}-${formatTime(occurrence.endMinutes)} `
      + `${subject ? subject.name : 'NO SUBJECT'} [${occurrence.type}]`
      + `  isNextForCourse=${next && next.id === occurrence.id ? 'yes' : 'no'}`,
    );
  }
  lines.push('');

  const open = store.all('assignments').filter((a) => !a.isCompleted);
  const done = store.all('assignments').length - open.length;
  lines.push(`Open assignments (${open.length}${done > 0 ? `, ${done} completed and ignored` : ''}):`);
  if (open.length === 0) lines.push('  none');
  for (const assignment of open) {
    lines.push(explainAssignment(store, assignment, today, occurrences));
  }
  lines.push('');

  const checks = store.all('checkItems').filter((item) => !item.isResolved);
  lines.push(`Open check items (${checks.length}):`);
  if (checks.length === 0) lines.push('  none');
  for (const item of checks) {
    const subject = store.get('subjects', item.subjectId);
    const next = nextOccurrenceForSubject(store, item.subjectId);
    lines.push(`  "${item.text}"  subject=${subject ? subject.name : 'NONE'}  -> ${
      !item.subjectId ? 'HIDDEN — no course'
        : !next ? 'HIDDEN — that course has no upcoming class'
          : next.date === today ? `SHOWN on today's ${formatTime(next.startMinutes)} class`
            : `shown on ${next.date}`
    }`);
  }

  return lines.join('\n');
}
