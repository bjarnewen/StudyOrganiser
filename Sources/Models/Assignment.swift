import Foundation
import SwiftData

@Model
final class Assignment {
    var title: String = ""
    var notes: String = ""
    var dueDate: Date = Date.now
    var isCompleted: Bool = false
    var priorityRaw: Int = 1
    var createdAt: Date = Date.now
    var subject: Subject?

    var priority: Priority {
        get { Priority(rawValue: priorityRaw) ?? .medium }
        set { priorityRaw = newValue.rawValue }
    }

    init(title: String, dueDate: Date, notes: String = "", priority: Priority = .medium, subject: Subject? = nil) {
        self.title = title
        self.dueDate = dueDate
        self.notes = notes
        self.priorityRaw = priority.rawValue
        self.createdAt = .now
        self.subject = subject
    }
}
