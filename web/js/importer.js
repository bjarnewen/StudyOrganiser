// Turning a parsed calendar into the app's data.
//
// Two things come out of an import:
//   * a *class* per distinct calendar series — "Calculus 1, Lecture" — which is
//     what notes, rules and assignments hang off;
//   * an *occurrence* per concrete date that class actually runs.
//
// Storing the dates rather than a weekday is what lets the week view show a
// real calendar, and lets the app tell which courses are running right now.

import { guessClassType, guessSubjectName, normalize, SUBJECT_PALETTE } from './domain.js';
import { expandOccurrences } from './ics.js';

/// Fully automatic import: every class title not seen before gets its type and
/// subject guessed and saved as a reusable rule, then the classes and their
/// dates are written. Corrections happen afterwards in Settings.
export function autoImport(events, store) {
  return store.batch((tx) => {
    const ruleMap = new Map();
    for (const rule of tx.all('importRules')) ruleMap.set(rule.matchText, rule);

    const subjectByName = new Map();
    for (const subject of tx.all('subjects')) subjectByName.set(normalize(subject.name), subject);

    const grouped = new Map();
    for (const event of events) {
      const key = normalize(event.summary);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(event);
    }

    let newClassesClassified = 0;
    let newSubjectsCreated = 0;

    for (const [key, group] of grouped) {
      if (ruleMap.has(key)) continue;
      const sampleTitle = group[0].summary;
      const subjectName = guessSubjectName(sampleTitle);
      const normalizedName = normalize(subjectName);

      let subject = subjectByName.get(normalizedName);
      if (!subject) {
        const colorHex = SUBJECT_PALETTE[subjectByName.size % SUBJECT_PALETTE.length];
        subject = tx.insert('subjects', { name: subjectName, colorHex });
        subjectByName.set(normalizedName, subject);
        newSubjectsCreated += 1;
      }

      ruleMap.set(key, tx.insert('importRules', {
        matchText: key,
        type: guessClassType(sampleTitle),
        subjectId: subject.id,
      }));
      newClassesClassified += 1;
    }

    const stats = applyImport(events, [...ruleMap.values()], tx);

    return {
      totalDistinctClasses: ruleMap.size,
      newClassesClassified,
      newSubjectsCreated,
      ...stats,
    };
  });
}

/// Creates or updates the class series and their dated occurrences.
export function applyImport(events, rules, tx) {
  const ruleMap = new Map();
  for (const rule of rules) ruleMap.set(rule.matchText, rule);

  const classByMatchKey = new Map();
  for (const klass of tx.all('classes')) classByMatchKey.set(klass.matchKey, klass);

  const occurrenceByUID = new Map();
  for (const occurrence of tx.all('occurrences')) {
    if (occurrence.sourceUID) occurrenceByUID.set(occurrence.sourceUID, occurrence);
  }

  const touchedClassIds = new Set();
  const seenOccurrenceUIDs = new Set();
  let unboundedSeries = 0;

  for (const event of events) {
    const key = normalize(event.summary);
    const rule = ruleMap.get(key);
    if (!rule) continue;

    let klass = classByMatchKey.get(key);
    if (klass) {
      tx.update('classes', klass.id, {
        title: event.summary,
        type: rule.type,
        location: event.location,
        subjectId: rule.subjectId,
      });
    } else {
      klass = tx.insert('classes', {
        matchKey: key,
        title: event.summary,
        type: rule.type,
        location: event.location,
        subjectId: rule.subjectId,
      });
      classByMatchKey.set(key, klass);
    }
    touchedClassIds.add(klass.id);

    for (const occurrence of expandOccurrences(event)) {
      if (!occurrence.bounded) unboundedSeries += 1;
      const sourceUID = `${event.uid}::${occurrence.date}`;
      seenOccurrenceUIDs.add(sourceUID);
      const existing = occurrenceByUID.get(sourceUID);
      const fields = {
        classId: klass.id,
        subjectId: rule.subjectId,
        date: occurrence.date,
        startMinutes: occurrence.startMinutes,
        endMinutes: occurrence.endMinutes,
        location: event.location,
        type: rule.type,
      };
      if (existing) {
        tx.update('occurrences', existing.id, fields);
      } else {
        tx.insert('occurrences', { ...fields, sourceUID });
      }
    }
  }

  // A class that moved or was cancelled leaves occurrences behind on its old
  // dates. Anything belonging to a class this import touched but not produced
  // by it is stale, so drop it rather than let a ghost class sit in the week.
  let removed = 0;
  for (const occurrence of tx.all('occurrences')) {
    if (!touchedClassIds.has(occurrence.classId)) continue;
    if (seenOccurrenceUIDs.has(occurrence.sourceUID)) continue;
    tx.remove('occurrences', occurrence.id);
    removed += 1;
  }

  return {
    occurrencesWritten: seenOccurrenceUIDs.size,
    occurrencesRemoved: removed,
    hasUnboundedSeries: unboundedSeries > 0,
  };
}

/// Re-applies a corrected rule to the class it produced and every dated
/// occurrence of it, so a fix in Settings shows up everywhere at once.
export function applyRuleCorrection(store, ruleId, { type, subjectId }) {
  store.batch((tx) => {
    const rule = tx.get('importRules', ruleId);
    if (!rule) return;
    tx.update('importRules', ruleId, { type, subjectId });

    for (const klass of tx.all('classes')) {
      if (klass.matchKey !== rule.matchText) continue;
      tx.update('classes', klass.id, { type, subjectId });
      for (const occurrence of tx.all('occurrences')) {
        if (occurrence.classId === klass.id) {
          tx.update('occurrences', occurrence.id, { type, subjectId });
        }
      }
    }
  });
}
