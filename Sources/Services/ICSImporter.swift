import Foundation
import SwiftData

enum ICSImportError: LocalizedError {
    case invalidURL
    case networkError(String)
    case emptyCalendar

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "That doesn't look like a valid calendar URL."
        case .networkError(let message): return "Couldn't download the calendar: \(message)"
        case .emptyCalendar: return "No events were found in that calendar."
        }
    }
}

struct ImportSummary {
    /// Distinct classes on the schedule (one per ImportRule), not raw
    /// ScheduleEntry rows - a calendar that publishes each week's occurrence
    /// as its own event would otherwise inflate this into a much larger,
    /// meaningless number.
    var totalDistinctClasses: Int
    var newClassesClassified: Int
    var newSubjectsCreated: Int
}

@MainActor
enum ICSImporter {
    static func normalizedURL(from input: String) -> URL? {
        var trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("webcal://") {
            trimmed = "https://" + trimmed.dropFirst("webcal://".count)
        }
        return URL(string: trimmed)
    }

    static func fetchAndParse(urlString: String) async throws -> [ParsedICSEvent] {
        guard let url = normalizedURL(from: urlString) else {
            throw ICSImportError.invalidURL
        }
        let data: Data
        do {
            (data, _) = try await URLSession.shared.data(from: url)
        } catch {
            throw ICSImportError.networkError(error.localizedDescription)
        }
        guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) else {
            throw ICSImportError.networkError("Could not read the calendar data.")
        }
        let events = ICSParser.parse(text)
        guard !events.isEmpty else { throw ICSImportError.emptyCalendar }
        return events
    }

    static func normalize(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// Fully automatic import: for every class title not seen before, guesses its
    /// type (Lecture/Tutorial/Practical/Exam/Other) and subject (matching an existing
    /// subject by name, or creating a new one), saves that as a reusable ImportRule,
    /// then creates/updates the ScheduleEntry records. No user interaction required -
    /// mistakes can be corrected afterward by editing the rule in Settings.
    static func autoImport(events: [ParsedICSEvent], modelContext: ModelContext) -> ImportSummary {
        let existingRules = (try? modelContext.fetch(FetchDescriptor<ImportRule>())) ?? []
        var ruleMap: [String: ImportRule] = [:]
        for rule in existingRules {
            ruleMap[rule.matchText] = rule
        }

        let existingSubjects = (try? modelContext.fetch(FetchDescriptor<Subject>())) ?? []
        var subjectByNormalizedName: [String: Subject] = [:]
        for subject in existingSubjects {
            subjectByNormalizedName[normalize(subject.name)] = subject
        }

        var grouped: [String: [ParsedICSEvent]] = [:]
        for event in events {
            grouped[normalize(event.summary), default: []].append(event)
        }

        var newClassesClassified = 0
        var newSubjectsCreated = 0

        for (key, group) in grouped where ruleMap[key] == nil {
            let sampleTitle = group[0].summary
            let type = ClassType.guess(fromTitle: sampleTitle)
            let subjectName = SubjectNameGuesser.guess(fromTitle: sampleTitle)
            let normalizedSubjectName = normalize(subjectName)

            let subject: Subject
            if let existing = subjectByNormalizedName[normalizedSubjectName] {
                subject = existing
            } else {
                let colorHex = SubjectColor.palette[subjectByNormalizedName.count % SubjectColor.palette.count]
                let created = Subject(name: subjectName, colorHex: colorHex)
                modelContext.insert(created)
                subjectByNormalizedName[normalizedSubjectName] = created
                subject = created
                newSubjectsCreated += 1
            }

            let rule = ImportRule(matchText: key, type: type, subject: subject)
            modelContext.insert(rule)
            ruleMap[key] = rule
            newClassesClassified += 1
        }

        applyImport(events: events, rules: Array(ruleMap.values), modelContext: modelContext)

        return ImportSummary(
            totalDistinctClasses: ruleMap.count,
            newClassesClassified: newClassesClassified,
            newSubjectsCreated: newSubjectsCreated
        )
    }

    /// Creates or updates ScheduleEntry records for every parsed event that has
    /// a matching ImportRule.
    static func applyImport(events: [ParsedICSEvent], rules: [ImportRule], modelContext: ModelContext) {
        var ruleMap: [String: ImportRule] = [:]
        for rule in rules {
            ruleMap[rule.matchText] = rule
        }

        let existingEntries = (try? modelContext.fetch(FetchDescriptor<ScheduleEntry>())) ?? []
        var entriesByUID: [String: ScheduleEntry] = [:]
        for entry in existingEntries {
            if let uid = entry.sourceUID {
                entriesByUID[uid] = entry
            }
        }

        for event in events {
            let key = normalize(event.summary)
            guard let rule = ruleMap[key] else { continue }

            if event.isRecurringWeekly {
                for weekday in event.weekdays {
                    let compositeUID = "\(event.uid)-\(weekday)"
                    upsert(
                        uid: compositeUID,
                        matchKey: key,
                        title: event.summary,
                        type: rule.type,
                        dayOfWeek: weekday,
                        startMinutes: event.startMinutes,
                        endMinutes: event.endMinutes,
                        location: event.location,
                        isRecurringWeekly: true,
                        specificDate: nil,
                        subject: rule.subject,
                        existing: entriesByUID[compositeUID],
                        modelContext: modelContext
                    )
                }
            } else {
                upsert(
                    uid: event.uid,
                    matchKey: key,
                    title: event.summary,
                    type: rule.type,
                    dayOfWeek: event.weekdays.first ?? 1,
                    startMinutes: event.startMinutes,
                    endMinutes: event.endMinutes,
                    location: event.location,
                    isRecurringWeekly: false,
                    specificDate: event.specificDate,
                    subject: rule.subject,
                    existing: entriesByUID[event.uid],
                    modelContext: modelContext
                )
            }
        }
    }

    private static func upsert(
        uid: String,
        matchKey: String,
        title: String,
        type: ClassType,
        dayOfWeek: Int,
        startMinutes: Int,
        endMinutes: Int,
        location: String,
        isRecurringWeekly: Bool,
        specificDate: Date?,
        subject: Subject?,
        existing: ScheduleEntry?,
        modelContext: ModelContext
    ) {
        if let existing {
            existing.title = title
            existing.typeRaw = type.rawValue
            existing.matchKey = matchKey
            existing.subject = subject
            existing.startMinutes = startMinutes
            existing.endMinutes = endMinutes
            existing.location = location
            existing.specificDate = specificDate
        } else {
            let entry = ScheduleEntry(
                title: title,
                type: type,
                dayOfWeek: dayOfWeek,
                startMinutes: startMinutes,
                endMinutes: endMinutes,
                location: location,
                isRecurringWeekly: isRecurringWeekly,
                specificDate: specificDate,
                sourceUID: uid,
                matchKey: matchKey,
                subject: subject
            )
            modelContext.insert(entry)
        }
    }
}
