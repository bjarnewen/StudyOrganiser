import Foundation

/// Strips the class-type indicator (and surrounding punctuation) out of a
/// calendar event title, leaving what's most likely the course/subject name.
/// E.g. "Lecture: Linear Algebra" -> "Linear Algebra".
enum SubjectNameGuesser {
    private static let keywords: [String] = ClassType.keywordsByType.values.flatMap { $0 }
    private static let leadingCourseCodeRegex = try! NSRegularExpression(
        pattern: "^[A-Za-z]{2,8}\\d{2,6}(-\\d{1,6})?\\s+"
    )

    static func guess(fromTitle title: String) -> String {
        var cleaned = stripLeadingCourseCode(title)
        for keyword in keywords {
            cleaned = cleaned.replacingOccurrences(of: keyword, with: " ", options: [.caseInsensitive])
        }
        let separators = CharacterSet(charactersIn: ":-–—,()[]")
        cleaned = String(cleaned.unicodeScalars.map { separators.contains($0) ? " " : Character($0) })
        let words = cleaned.split(separator: " ", omittingEmptySubsequences: true)
        let result = words.joined(separator: " ")
        return result.isEmpty ? title.trimmingCharacters(in: .whitespaces) : result
    }

    /// Strips a leading course-code token like "WBPH001-10" or "CS101", common
    /// in university timetable exports, so the guessed subject name is just
    /// the human-readable course title.
    private static func stripLeadingCourseCode(_ text: String) -> String {
        let range = NSRange(text.startIndex..., in: text)
        return leadingCourseCodeRegex.stringByReplacingMatches(in: text, range: range, withTemplate: "")
    }
}
