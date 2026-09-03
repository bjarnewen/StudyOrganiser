import Foundation

/// One occurrence pattern extracted from a VEVENT block. A weekly-recurring
/// event with multiple BYDAY values (e.g. MO,WE,FR) expands to one entry per weekday.
struct ParsedICSEvent {
    let uid: String
    let summary: String
    let location: String
    let isRecurringWeekly: Bool
    let weekdays: [Int] // Calendar weekday values: 1 = Sunday ... 7 = Saturday
    let specificDate: Date? // set when not recurring
    let startMinutes: Int
    let endMinutes: Int
}

enum ICSParser {
    static func parse(_ icsText: String) -> [ParsedICSEvent] {
        let unfolded = unfold(icsText)
        let lines = unfolded.components(separatedBy: .newlines)

        var events: [ParsedICSEvent] = []
        var currentLines: [String] = []
        var insideEvent = false

        for rawLine in lines {
            let line = rawLine.trimmingCharacters(in: CharacterSet(charactersIn: "\r"))
            if line == "BEGIN:VEVENT" {
                insideEvent = true
                currentLines = []
            } else if line == "END:VEVENT" {
                insideEvent = false
                if let event = parseEvent(currentLines) {
                    events.append(event)
                }
                currentLines = []
            } else if insideEvent {
                currentLines.append(line)
            }
        }
        return events
    }

    /// RFC 5545 line unfolding: a line that starts with a space or tab is a
    /// continuation of the previous line.
    private static func unfold(_ text: String) -> String {
        var result = ""
        result.reserveCapacity(text.count)
        var previousWasNewline = false
        for character in text {
            if character == "\n" || character == "\r" {
                previousWasNewline = true
                result.append(character)
            } else if previousWasNewline && (character == " " || character == "\t") {
                if result.hasSuffix("\n") { result.removeLast() }
                if result.hasSuffix("\r") { result.removeLast() }
                previousWasNewline = false
            } else {
                previousWasNewline = false
                result.append(character)
            }
        }
        return result
    }

    private static func parseEvent(_ lines: [String]) -> ParsedICSEvent? {
        var properties: [String: (params: [String: String], value: String)] = [:]

        for line in lines where !line.isEmpty {
            guard let colonIndex = line.firstIndex(of: ":") else { continue }
            let namePart = String(line[line.startIndex..<colonIndex])
            let value = String(line[line.index(after: colonIndex)...])
            let nameComponents = namePart.components(separatedBy: ";")
            let name = nameComponents[0].uppercased()
            var params: [String: String] = [:]
            for paramString in nameComponents.dropFirst() {
                let kv = paramString.components(separatedBy: "=")
                if kv.count == 2 { params[kv[0].uppercased()] = kv[1] }
            }
            properties[name] = (params, value)
        }

        guard let dtstart = properties["DTSTART"], let startDate = parseDate(dtstart.value, params: dtstart.params) else {
            return nil
        }

        let endDate: Date
        if let dtend = properties["DTEND"], let parsed = parseDate(dtend.value, params: dtend.params) {
            endDate = parsed
        } else {
            endDate = startDate.addingTimeInterval(3600)
        }

        let summary = properties["SUMMARY"]?.value.removingICSEscapes() ?? "Untitled"
        let location = properties["LOCATION"]?.value.removingICSEscapes() ?? ""
        let uid = properties["UID"]?.value ?? UUID().uuidString

        let calendar = Calendar.current
        let startWeekday = calendar.component(.weekday, from: startDate)
        let startMinutes = calendar.component(.hour, from: startDate) * 60 + calendar.component(.minute, from: startDate)
        let endMinutes = calendar.component(.hour, from: endDate) * 60 + calendar.component(.minute, from: endDate)

        if let rrule = properties["RRULE"]?.value {
            let ruleParts = rrule.components(separatedBy: ";").reduce(into: [String: String]()) { dict, part in
                let kv = part.components(separatedBy: "=")
                if kv.count == 2 { dict[kv[0].uppercased()] = kv[1] }
            }
            var weekdays: [Int] = [startWeekday]
            if let byDay = ruleParts["BYDAY"] {
                let dayMap = ["SU": 1, "MO": 2, "TU": 3, "WE": 4, "TH": 5, "FR": 6, "SA": 7]
                let parsedDays: [Int] = byDay.components(separatedBy: ",").compactMap { token in
                    let code = String(token.trimmingCharacters(in: .whitespaces).uppercased().suffix(2))
                    return dayMap[code]
                }
                if !parsedDays.isEmpty { weekdays = parsedDays }
            }
            return ParsedICSEvent(
                uid: uid,
                summary: summary,
                location: location,
                isRecurringWeekly: true,
                weekdays: weekdays,
                specificDate: nil,
                startMinutes: startMinutes,
                endMinutes: endMinutes
            )
        } else {
            return ParsedICSEvent(
                uid: uid,
                summary: summary,
                location: location,
                isRecurringWeekly: false,
                weekdays: [startWeekday],
                specificDate: startDate,
                startMinutes: startMinutes,
                endMinutes: endMinutes
            )
        }
    }

    private static func parseDate(_ value: String, params: [String: String]) -> Date? {
        let cleaned = value.trimmingCharacters(in: .whitespaces)
        let hasTime = cleaned.contains("T")
        let isUTC = cleaned.hasSuffix("Z")

        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        if isUTC {
            formatter.timeZone = TimeZone(identifier: "UTC")
        } else if let tzid = params["TZID"], let zone = TimeZone(identifier: tzid) {
            formatter.timeZone = zone
        } else {
            formatter.timeZone = .current
        }

        if hasTime {
            if isUTC {
                formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
                if let date = formatter.date(from: cleaned) { return date }
            }
            formatter.dateFormat = "yyyyMMdd'T'HHmmss"
            return formatter.date(from: cleaned)
        } else {
            formatter.dateFormat = "yyyyMMdd"
            return formatter.date(from: cleaned)
        }
    }
}

private extension String {
    func removingICSEscapes() -> String {
        self.replacingOccurrences(of: "\\,", with: ",")
            .replacingOccurrences(of: "\\;", with: ";")
            .replacingOccurrences(of: "\\n", with: " ")
            .replacingOccurrences(of: "\\N", with: " ")
            .replacingOccurrences(of: "\\\\", with: "\\")
    }
}
