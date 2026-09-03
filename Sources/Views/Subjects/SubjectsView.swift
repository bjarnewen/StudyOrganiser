import SwiftUI
import SwiftData

struct SubjectsView: View {
    @Query(sort: \Subject.name) private var subjects: [Subject]
    @Environment(\.modelContext) private var modelContext
    @State private var showingAddSheet = false
    @State private var editingSubject: Subject?

    var body: some View {
        List {
            ForEach(subjects) { subject in
                HStack(spacing: 12) {
                    Circle()
                        .fill(SubjectColor.color(for: subject.colorHex))
                        .frame(width: 16, height: 16)
                    VStack(alignment: .leading) {
                        Text(subject.name).font(.headline)
                        Text("\(subject.distinctClassCount) classes · \(subject.assignments?.count ?? 0) assignments")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.bold())
                        .foregroundStyle(.tertiary)
                }
                .contentShape(Rectangle())
                .onTapGesture { editingSubject = subject }
            }
            .onDelete(perform: delete)
        }
        .overlay {
            if subjects.isEmpty {
                EmptyStateView(systemImage: "books.vertical", message: "No subjects yet. Add one to get started.")
            }
        }
        .navigationTitle("Subjects")
        .toolbar {
            ToolbarItem {
                Button {
                    showingAddSheet = true
                } label: {
                    Label("Add Subject", systemImage: "plus")
                }
            }
        }
        .sheet(isPresented: $showingAddSheet) {
            SubjectEditView(subject: nil)
        }
        .sheet(item: $editingSubject) { subject in
            SubjectEditView(subject: subject)
        }
    }

    private func delete(at offsets: IndexSet) {
        for index in offsets {
            modelContext.delete(subjects[index])
        }
    }
}
