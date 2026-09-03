import Foundation

/// Wraps security-scoped bookmark creation/resolution so a file or folder the
/// user picks once (e.g. a GoodNotes notebook or folder in iCloud Drive) can be
/// reopened later without re-prompting the system file picker.
enum FileBookmark {
    static func makeBookmark(for url: URL) -> Data? {
        #if os(macOS)
        return try? url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil)
        #else
        return try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
        #endif
    }

    static func resolve(_ data: Data) -> URL? {
        var isStale = false
        #if os(macOS)
        let options: URL.BookmarkResolutionOptions = [.withSecurityScope]
        #else
        let options: URL.BookmarkResolutionOptions = []
        #endif
        return try? URL(resolvingBookmarkData: data, options: options, relativeTo: nil, bookmarkDataIsStale: &isStale)
    }
}
