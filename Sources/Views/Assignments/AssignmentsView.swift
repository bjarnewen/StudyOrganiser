import SwiftUI
import SwiftData

struct AssignmentsView: View {
    @Query(sort: \Assignment.dueDate) private var assignments: [Assignment]
    @Query(sort: \Subject.name) private var subjects: [Subject]
    @Environment(\.modelContext) private var modelContext

    @State private var showingAddSheet = false
    @State private var editingAssignment: Assignment?
    @State private var filterSubject: Subject?

    private var filtered: [Assignment] {
        guard let filterSubject else { return assignments }
        return assignments.filter { $0.subject?.persistentModelID == filterSubject.persistentModelID }
    }

    private var overdue: [Assignment] {
        filtered.filter { !$0.isCompleted && $0.dueDate < Calendar.current.startOfDay(for: .now) }
    }
    private var upcoming: [Assignment] {
        filtered.filter { !$0.isCompleted && $0.dueDate >= Calendar.current.startOfDay(for: .now) }
    }
    private var completed: [Assignment] { filtered.filter(\.isCompleted) }

    var body: some View {
        List {
            if !overdue.isEmpty {
                Section("Overdue") {
                    ForEach(overdue) { row($0) }
                }
            }
            Section("Upcoming") {
                if upcoming.isEmpty {
                    Text("Nothing upcoming").foregroundStyle(.secondary)
                } else {
                    ForEach(upcoming) { row($0) }
                }
            }
            if !completed.isEmpty {
                Section("Completed") {
                    ForEach(completed) { row($0) }
                }
            }
        }
        .overlay {
            if assignments.isEmpty {
                EmptyStateView(systemImage: "checklist", message: "No assignments yet. Tap + to add one.")
            }
        }
        .navigationTitle("Assignments")
        .toolbar {
            ToolbarItem {
                Menu {
                    Button("All Subjects") { filterSubject = nil }
                    ForEach(subjects) { subject in
                        Button(subject.name) { filterSubject = subject }
                    }
                } label: {
                    Label("Filter", systemImage: "line.3.horizontal.decrease.circle")
                }
            }
            ToolbarItem {
                Button {
                    showingAddSheet = true
                } label: {
                    Label("Add Assignment", systemImage: "plus")
                }
            }
        }
        .sheet(isPresented: $showingAddSheet) {
            AssignmentEditView(assignment: nil)
        }
        .sheet(item: $editingAssignment) { assignment in
            AssignmentEditView(assignment: assignment)
        }
    }

    private func row(_ assignment: Assignment) -> some View {
        AssignmentRowView(assignment: assignment)
            .contentShape(Rectangle())
            .onTapGesture { editingAssignment = assignment }
            .swipeActions(edge: .leading) {
                Button {
                    withAnimation { assignment.isCompleted.toggle() }
                } label: {
                    Label(assignment.isCompleted ? "Mark Incomplete" : "Mark Done", systemImage: "checkmark")
                }
                .tint(.green)
            }
            .swipeActions(edge: .trailing) {
                Button(role: .destructive) {
                    modelContext.delete(assignment)
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
    }
}
