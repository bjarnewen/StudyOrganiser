import SwiftUI

struct TypeBadge: View {
    let type: ClassType

    var body: some View {
        Label(type.rawValue, systemImage: type.symbolName)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(.secondary.opacity(0.15), in: Capsule())
    }
}
