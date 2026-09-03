import Foundation

enum ClassType: String, Codable, CaseIterable, Identifiable {
    case lecture = "Lecture"
    case tutorial = "Tutorial"
    case practical = "Practical"
    case exam = "Exam"
    case other = "Other"

    var id: String { rawValue }

    var symbolName: String {
        switch self {
        case .lecture: return "person.wave.2.fill"
        case .tutorial: return "person.2.fill"
        case .practical: return "flask.fill"
        case .exam: return "list.clipboard.fill"
        case .other: return "calendar"
        }
    }

    /// Keyword groups used both to guess a class's type and (in SubjectNameGuesser)
    /// to strip the type indicator out of a title to recover the subject name.
    static let keywordsByType: [ClassType: [String]] = [
        .lecture: ["lecture", "vorlesung"],
        .tutorial: ["tutorial", "übung", "uebung", "exercise"],
        .practical: ["practical", "lab", "praktikum"],
        .exam: ["exam", "klausur", "test", "prüfung", "pruefung", "final", "midterm"],
    ]

    /// Best-effort guess based on common naming conventions in university timetable exports.
    static func guess(fromTitle title: String) -> ClassType {
        let lowered = title.lowercased()
        for (type, keywords) in keywordsByType {
            if keywords.contains(where: { lowered.contains($0) }) {
                return type
            }
        }
        return .other
    }
}
