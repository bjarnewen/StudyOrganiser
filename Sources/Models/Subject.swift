import Foundation
import SwiftData

@Model
final class Subject {
    var name: String = ""
    var colorHex: String = "0A84FF"
    var createdAt: Date = Date.now

    @Relationship(deleteRule: .cascade, inverse: \ScheduleEntry.subject)
    var scheduleEntries: [ScheduleEntry]? = []

    @Relationship(deleteRule: .cascade, inverse: \Assignment.subject)
    var assignments: [Assignment]? = []

    @Relationship(deleteRule: .cascade, inverse: \ImportRule.subject)
    var importRules: [ImportRule]? = []

    @Relationship(deleteRule: .cascade, inverse: \LinkedFile.subject)
    var linkedFiles: [LinkedFile]? = []

    /// Distinct classes (by matchKey), not raw ScheduleEntry rows - a calendar
    /// that publishes each week's occurrence as its own event would otherwise
    /// inflate this into a much larger, meaningless number.
    var distinctClassCount: Int {
        Set((scheduleEntries ?? []).map(\.matchKey)).count
    }

    init(name: String, colorHex: String = "0A84FF") {
        self.name = name
        self.colorHex = colorHex
        self.createdAt = .now
    }
}
