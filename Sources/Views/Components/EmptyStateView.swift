import SwiftUI

struct EmptyStateView: View {
    let systemImage: String
    let message: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.system(size: 32))
                .foregroundStyle(.secondary)
            Text(message)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
    }
}
