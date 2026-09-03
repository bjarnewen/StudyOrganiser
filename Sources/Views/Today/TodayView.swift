import SwiftUI
import SwiftData

struct TodayView: View {
    @Query(sort: \ScheduleEntry.startMinutes) private var allEntries: [ScheduleEntry]
    @Query(sort: \Assignment.dueDate) private var allAssignments: [Assignment]

    @State private var selectedEntry: ScheduleEntry?

    private var todayWeekday: Int { Calendar.current.component(.weekday, from: .now) }

    private var todaysClasses: [ScheduleEntry] {
        allEntries
            .filter { entry in
                if entry.isRecurringWeekly {
                    return entry.dayOfWeek == todayWeekday
                } else if let date = entry.specificDate {
                    return Calendar.current.isDateInToday(date)
                }
                return false
            }
            .sorted { $0.startMinutes < $1.startMinutes }
    }

    private var upcomingAssignments: [Assignment] {
        allAssignments
            .filter { !$0.isCompleted }
            .sorted { $0.dueDate < $1.dueDate }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header

                sectionHeader("Today's Classes", systemImage: "calendar")
                if todaysClasses.isEmpty {
                    EmptyStateView(systemImage: "cup.and.saucer", message: "No classes today. Enjoy the break!")
                } else {
                    VStack(spacing: 10) {
                        ForEach(todaysClasses) { entry in
                            ClassRowView(entry: entry)
                                .contentShape(Rectangle())
                                .onTapGesture { selectedEntry = entry }
                        }
                    }
                }

                sectionHeader("Due Soon", systemImage: "flag.fill")
                if upcomingAssignments.isEmpty {
                    EmptyStateView(systemImage: "checkmark.circle", message: "Nothing due. You're all caught up!")
                } else {
                    VStack(spacing: 10) {
                        ForEach(upcomingAssignments.prefix(6)) { assignment in
                            AssignmentRowView(assignment: assignment)
                        }
                    }
                }
            }
            .padding(24)
        }
        .navigationTitle("Today")
        .sheet(item: $selectedEntry) { entry in
            ClassDetailView(entry: entry)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(Date.now, format: .dateTime.weekday(.wide).month(.wide).day())
                .font(.largeTitle.bold())
            Text("\(todaysClasses.count) classes today · \(upcomingAssignments.count) assignments pending")
                .foregroundStyle(.secondary)
        }
    }

    private func sectionHeader(_ title: String, systemImage: String) -> some View {
        Label(title, systemImage: systemImage)
            .font(.title2.bold())
    }
}
