import Foundation
import SwiftData

/// A file or folder the user linked in from outside the app (e.g. a GoodNotes
/// notebook or folder stored in iCloud Drive), kept as a security-scoped bookmark
/// so it can be reopened later without re-prompting the system file picker.
@Model
final class LinkedFile {
    var displayName: String = ""
    var bookmarkData: Data = Data()
    var isDirectory: Bool = false
    var addedAt: Date = Date.now
    var subject: Subject?

    init(displayName: String, bookmarkData: Data, isDirectory: Bool, subject: Subject?) {
        self.displayName = displayName
        self.bookmarkData = bookmarkData
        self.isDirectory = isDirectory
        self.addedAt = .now
        self.subject = subject
    }
}
