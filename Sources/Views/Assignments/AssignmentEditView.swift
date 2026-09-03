import SwiftUI
import SwiftData

struct AssignmentEditView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Subject.name) private var subjects: [Subject]

    let assignment: Assignment?

    @State private var title: String = ""
    @State private var dueDate: Date = .now
    @State private var notes: String = ""
    @State private var priority: Priority = .medium
    @State private var subject: Subject?

    var body: some View {
        NavigationStack {
            Form {
                Section("Details") {
                    TextField("Title", text: $title)
                    DatePicker("Due", selection: $dueDate)
                    Picker("Subject", selection: $subject) {
                        Text("None").tag(Subject?.none)
                        ForEach(subjects) { option in
                            Text(option.name).tag(Optional(option))
                        }
                    }
                    Picker("Priority", selection: $priority) {
                        ForEach(Priority.allCases) { p in
                            Text(p.label).tag(p)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                Section("Notes") {
                    TextEditor(text: $notes)
                        .frame(minHeight: 100)
                }
            }
            .navigationTitle(assignment == nil ? "New Assignment" : "Edit Assignment")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear(perform: loadIfNeeded)
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 420)
        #endif
    }

    private func loadIfNeeded() {
        guard let assignment else { return }
        title = assignment.title
        dueDate = assignment.dueDate
        notes = assignment.notes
        priority = assignment.priority
        subject = assignment.subject
    }

    private func save() {
        if let assignment {
            assignment.title = title
            assignment.dueDate = dueDate
            assignment.notes = notes
            assignment.priority = priority
            assignment.subject = subject
        } else {
            let new = Assignment(title: title, dueDate: dueDate, notes: notes, priority: priority, subject: subject)
            modelContext.insert(new)
        }
        dismiss()
    }
}
