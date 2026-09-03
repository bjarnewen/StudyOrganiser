import Foundation
import SwiftData

/// Remembers how a calendar event title should be classified, so future
/// re-imports of the same recurring class don't need to be re-classified.
@Model
final class ImportRule {
    var matchText: String = ""
    var typeRaw: String = ClassType.other.rawValue
    var subject: Subject?

    var type: ClassType {
        get { ClassType(rawValue: typeRaw) ?? .other }
        set { typeRaw = newValue.rawValue }
    }

    init(matchText: String, type: ClassType, subject: Subject?) {
        self.matchText = matchText
        self.typeRaw = type.rawValue
        self.subject = subject
    }
}
