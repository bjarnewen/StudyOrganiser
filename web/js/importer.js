// Port of Sources/Services/ICSImporter.swift.

import { guessClassType, guessSubjectName, normalize, SUBJECT_PALETTE } from './domain.js';

/// Fully automatic import: for every class title not seen before, guesses its
/// type (Lecture/Tutorial/Practical/Exam/Other) and subject (matching an existing
/// subject by name, or creating a new one), saves that as a reusable import rule,
/// then creates/updates the schedule entries. No user interaction required —
/// mistakes can be corrected afterward by editing the rule in Settings.
export function autoImport(events, store) {
  return store.batch((tx) => {
    const ruleMap = new Map();
    for (const rule of tx.all('importRules')) ruleMap.set(rule.matchText, rule);

    const subjectByNormalizedName = new Map();
    for (const subject of tx.all('subjects')) {
      subjectByNormalizedName.set(normalize(subject.name), subject);
    }

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
      const type = guessClassType(sampleTitle);
      const subjectName = guessSubjectName(sampleTitle);
      const normalizedSubjectName = normalize(subjectName);

      let subject = subjectByNormalizedName.get(normalizedSubjectName);
      if (!subject) {
        const colorHex = SUBJECT_PALETTE[subjectByNormalizedName.size % SUBJECT_PALETTE.length];
        subject = tx.insert('subjects', { name: subjectName, colorHex });
        subjectByNormalizedName.set(normalizedSubjectName, subject);
        newSubjectsCreated += 1;
      }

      const rule = tx.insert('importRules', { matchText: key, type, subjectId: subject.id });
      ruleMap.set(key, rule);
      newClassesClassified += 1;
    }

    applyImport(events, [...ruleMap.values()], tx);

    return {
      totalDistinctClasses: ruleMap.size,
      newClassesClassified,
      newSubjectsCreated,
    };
  });
}

/// Creates or updates schedule entries for every parsed event that has a
/// matching import rule.
export function applyImport(events, rules, tx) {
  const ruleMap = new Map();
  for (const rule of rules) ruleMap.set(rule.matchText, rule);

  const entriesByUID = new Map();
  for (const entry of tx.all('scheduleEntries')) {
    if (entry.sourceUID) entriesByUID.set(entry.sourceUID, entry);
  }

  for (const event of events) {
    const key = normalize(event.summary);
    const rule = ruleMap.get(key);
    if (!rule) continue;

    if (event.isRecurringWeekly) {
      for (const weekday of event.weekdays) {
        const compositeUID = `${event.uid}-${weekday}`;
        upsert(tx, {
          uid: compositeUID,
          matchKey: key,
          title: event.summary,
          type: rule.type,
          dayOfWeek: weekday,
          startMinutes: event.startMinutes,
          endMinutes: event.endMinutes,
          location: event.location,
          isRecurringWeekly: true,
          specificDate: null,
          subjectId: rule.subjectId,
          existing: entriesByUID.get(compositeUID),
        });
      }
    } else {
      upsert(tx, {
        uid: event.uid,
        matchKey: key,
        title: event.summary,
        type: rule.type,
        dayOfWeek: event.weekdays[0] ?? 1,
        startMinutes: event.startMinutes,
        endMinutes: event.endMinutes,
        location: event.location,
        isRecurringWeekly: false,
        specificDate: event.specificDate,
        subjectId: rule.subjectId,
        existing: entriesByUID.get(event.uid),
      });
    }
  }
}

function upsert(tx, fields) {
  const {
    uid, matchKey, title, type, dayOfWeek, startMinutes, endMinutes,
    location, isRecurringWeekly, specificDate, subjectId, existing,
  } = fields;

  if (existing) {
    // dayOfWeek and isRecurringWeekly are deliberately not refreshed here: the
    // Swift original leaves them alone so a weekly entry keeps the weekday its
    // composite UID was created for.
    tx.update('scheduleEntries', existing.id, {
      title, type, matchKey, subjectId, startMinutes, endMinutes, location, specificDate,
    });
  } else {
    tx.insert('scheduleEntries', {
      title, type, dayOfWeek, startMinutes, endMinutes, location,
      isRecurringWeekly, specificDate, sourceUID: uid, matchKey, subjectId,
    });
  }
}

/// Re-applies a corrected rule to every schedule entry it already produced,
/// matching EditImportRuleView.save().
export function applyRuleCorrection(store, ruleId, { type, subjectId }) {
  store.batch((tx) => {
    const rule = tx.get('importRules', ruleId);
    if (!rule) return;
    tx.update('importRules', ruleId, { type, subjectId });
    for (const entry of tx.all('scheduleEntries')) {
      if (entry.matchKey === rule.matchText) {
        tx.update('scheduleEntries', entry.id, { type, subjectId });
      }
    }
  });
}
