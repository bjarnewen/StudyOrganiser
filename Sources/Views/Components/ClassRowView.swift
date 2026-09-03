import SwiftUI

struct ClassRowView: View {
    let entry: ScheduleEntry

    private var timeRangeText: String {
        "\(Self.timeString(fromMinutes: entry.startMinutes)) – \(Self.timeString(fromMinutes: entry.endMinutes))"
    }

    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 3)
                .fill(SubjectColor.color(for: entry.subject?.colorHex))
                .frame(width: 5)

            VStack(alignment: .leading, spacing: 4) {
                Text(entry.subject?.name ?? entry.title)
                    .font(.headline)
                HStack(spacing: 8) {
                    TypeBadge(type: entry.type)
                    if !entry.location.isEmpty {
                        Label(entry.location, systemImage: "mappin.and.ellipse")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            Text(timeRangeText)
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    static func timeString(fromMinutes minutes: Int) -> String {
        var components = DateComponents()
        components.hour = minutes / 60
        components.minute = minutes % 60
        let date = Calendar.current.date(from: components) ?? .now
        return date.formatted(date: .omitted, time: .shortened)
    }
}
