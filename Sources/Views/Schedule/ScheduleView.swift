import SwiftUI
import SwiftData

struct ScheduleView: View {
    @Query private var allEntries: [ScheduleEntry]

    @State private var selectedEntry: ScheduleEntry?

    private let weekdayOrder = [2, 3, 4, 5, 6, 7, 1] // Monday...Sunday (Calendar weekday: Sunday = 1)

    private func weekdaySymbol(_ weekday: Int) -> String {
        Calendar.current.weekdaySymbols[weekday - 1]
    }

    /// A representative weekly template. Recurring entries appear once per
    /// weekday as-is. One-off dated entries - common with calendars that
    /// publish each week's class as its own event instead of an RRULE - are
    /// collapsed to a single representative occurrence per class (the soonest
    /// upcoming one, or the most recent past one if none remain), so the
    /// weekly view reads like a normal timetable instead of one row per week.
    private func entries(for weekday: Int) -> [ScheduleEntry] {
        let dayEntries = allEntries.filter { $0.dayOfWeek == weekday }
        let recurring = dayEntries.filter { $0.isRecurringWeekly }

        let today = Calendar.current.startOfDay(for: .now)
        var representativeOneOff: [String: ScheduleEntry] = [:]
        for entry in dayEntries where !entry.isRecurringWeekly {
            if let existing = representativeOneOff[entry.matchKey] {
                representativeOneOff[entry.matchKey] = preferred(entry, existing, today: today)
            } else {
                representativeOneOff[entry.matchKey] = entry
            }
        }

        return (recurring + Array(representativeOneOff.values))
            .sorted { $0.startMinutes < $1.startMinutes }
    }

    private func preferred(_ a: ScheduleEntry, _ b: ScheduleEntry, today: Date) -> ScheduleEntry {
        guard let dateA = a.specificDate else { return b }
        guard let dateB = b.specificDate else { return a }
        let aUpcoming = dateA >= today
        let bUpcoming = dateB >= today
        if aUpcoming != bUpcoming { return aUpcoming ? a : b }
        return aUpcoming ? (dateA < dateB ? a : b) : (dateA > dateB ? a : b)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20, pinnedViews: [.sectionHeaders]) {
                ForEach(weekdayOrder, id: \.self) { weekday in
                    Section {
                        let dayEntries = entries(for: weekday)
                        if dayEntries.isEmpty {
                            EmptyStateView(systemImage: "moon.zzz", message: "No classes")
                                .padding(.leading, 4)
                        } else {
                            VStack(spacing: 10) {
                                ForEach(dayEntries) { entry in
                                    ClassRowView(entry: entry)
                                        .contentShape(Rectangle())
                                        .onTapGesture { selectedEntry = entry }
                                }
                            }
                        }
                    } header: {
                        Text(weekdaySymbol(weekday))
                            .font(.title3.bold())
                            .padding(.vertical, 6)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(.thinMaterial)
                    }
                }
            }
            .padding(20)
        }
        .navigationTitle("Schedule")
        .sheet(item: $selectedEntry) { entry in
            ClassDetailView(entry: entry)
        }
    }
}
