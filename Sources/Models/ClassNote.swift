import Foundation
import SwiftData

/// A follow-up note attached to a specific weekly class (e.g. "review chapter 3
/// before next lecture"), so it's visible again the next time that class comes around.
@Model
final class ClassNote {
    var text: String = ""
    var createdAt: Date = Date.now
    var isResolved: Bool = false
    var scheduleEntry: ScheduleEntry?

    init(text: String, scheduleEntry: ScheduleEntry?) {
        self.text = text
        self.createdAt = .now
        self.scheduleEntry = scheduleEntry
    }
}
