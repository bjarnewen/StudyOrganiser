import SwiftUI

enum SidebarSection: String, CaseIterable, Identifiable {
    case today = "Today"
    case schedule = "Schedule"
    case assignments = "Assignments"
    case subjects = "Subjects"
    case settings = "Settings"

    var id: String { rawValue }

    var symbolName: String {
        switch self {
        case .today: return "sun.max.fill"
        case .schedule: return "calendar"
        case .assignments: return "checklist"
        case .subjects: return "books.vertical.fill"
        case .settings: return "gearshape.fill"
        }
    }
}

struct RootView: View {
    @State private var selection: SidebarSection? = .today

    var body: some View {
        NavigationSplitView {
            List(SidebarSection.allCases, selection: $selection) { section in
                Label(section.rawValue, systemImage: section.symbolName)
                    .tag(section)
            }
            .navigationTitle("Study Organiser")
        } detail: {
            NavigationStack {
                switch selection {
                case .today: TodayView()
                case .schedule: ScheduleView()
                case .assignments: AssignmentsView()
                case .subjects: SubjectsView()
                case .settings: SettingsView()
                case nil: TodayView()
                }
            }
        }
    }
}
