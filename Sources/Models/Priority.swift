import SwiftUI

enum Priority: Int, Codable, CaseIterable, Identifiable, Comparable {
    case low = 0
    case medium = 1
    case high = 2

    var id: Int { rawValue }

    var label: String {
        switch self {
        case .low: return "Low"
        case .medium: return "Medium"
        case .high: return "High"
        }
    }

    var color: Color {
        switch self {
        case .low: return .green
        case .medium: return .orange
        case .high: return .red
        }
    }

    static func < (lhs: Priority, rhs: Priority) -> Bool { lhs.rawValue < rhs.rawValue }
}
