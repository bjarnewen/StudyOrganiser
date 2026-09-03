import Foundation
import SwiftData

@Model
final class ScheduleEntry {
    var title: String = ""
    var typeRaw: String = ClassType.other.rawValue
    /// Calendar weekday: 1 = Sunday ... 7 = Saturday. Meaningful when isRecurringWeekly is true.
    var dayOfWeek: Int = 2
    var startMinutes: Int = 540
    var endMinutes: Int = 600
    var location: String = ""
    var isRecurringWeekly: Bool = true
    /// Set for one-off, non-recurring events imported from the calendar.
    var specificDate: Date?
    /// Used to de-duplicate re-imports of the same calendar event.
    var sourceUID: String?
    /// Normalized event title, shared with the ImportRule that classified this entry -
    /// lets an edited rule propagate its new type/subject to every entry it produced.
    var matchKey: String = ""
    var subject: Subject?

    @Relationship(deleteRule: .cascade, inverse: \ClassNote.scheduleEntry)
    var notes: [ClassNote]? = []

    var type: ClassType {
        get { ClassType(rawValue: typeRaw) ?? .other }
        set { typeRaw = newValue.rawValue }
    }

    init(
        title: String,
        type: ClassType,
        dayOfWeek: Int,
        startMinutes: Int,
        endMinutes: Int,
        location: String = "",
        isRecurringWeekly: Bool = true,
        specificDate: Date? = nil,
        sourceUID: String? = nil,
        matchKey: String = "",
        subject: Subject? = nil
    ) {
        self.title = title
        self.typeRaw = type.rawValue
        self.dayOfWeek = dayOfWeek
        self.startMinutes = startMinutes
        self.endMinutes = endMinutes
        self.location = location
        self.isRecurringWeekly = isRecurringWeekly
        self.specificDate = specificDate
        self.sourceUID = sourceUID
        self.matchKey = matchKey
        self.subject = subject
    }
}
