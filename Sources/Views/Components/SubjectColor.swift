import SwiftUI

enum SubjectColor {
    static let palette: [String] = [
        "FF3B30", "FF9500", "FFCC00", "34C759", "00C7BE",
        "30B0C7", "0A84FF", "5E5CE6", "AF52DE", "FF2D55"
    ]

    static func color(for hex: String?) -> Color {
        guard let hex, let value = UInt32(hex, radix: 16) else { return .accentColor }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        return Color(red: r, green: g, blue: b)
    }
}
