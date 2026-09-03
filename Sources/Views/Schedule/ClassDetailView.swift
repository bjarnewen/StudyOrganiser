import SwiftUI
import SwiftData

struct ClassDetailView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    let entry: ScheduleEntry

    @State private var newNoteText = ""

    private var sortedNotes: [ClassNote] {
        (entry.notes ?? []).sorted { $0.createdAt > $1.createdAt }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        TypeBadge(type: entry.type)
                        Spacer()
                        Text("\(ClassRowView.timeString(fromMinutes: entry.startMinutes)) – \(ClassRowView.timeString(fromMinutes: entry.endMinutes))")
                            .foregroundStyle(.secondary)
                    }
                    if !entry.location.isEmpty {
                        Label(entry.location, systemImage: "mappin.and.ellipse")
                    }
                }

                Section {
                    HStack {
                        TextField("e.g. Review chapter 3 before next class", text: $newNoteText)
                        Button("Add") { addNote() }
                            .disabled(newNoteText.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                } header: {
                    Text("Add a Note")
                } footer: {
                    Text("Notes stay attached to this class, so they're here again next time it comes around.")
                }

                if !sortedNotes.isEmpty {
                    Section("Follow-up Notes") {
                        ForEach(sortedNotes) { note in
                            HStack(alignment: .top, spacing: 10) {
                                Button {
                                    note.isResolved.toggle()
                                } label: {
                                    Image(systemName: note.isResolved ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(note.isResolved ? .green : .secondary)
                                }
                                .buttonStyle(.plain)
                                Text(note.text)
                                    .strikethrough(note.isResolved)
                                    .foregroundStyle(note.isResolved ? .secondary : .primary)
                            }
                        }
                        .onDelete(perform: deleteNotes)
                    }
                }
            }
            .navigationTitle(entry.subject?.name ?? entry.title)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 480)
        #endif
    }

    private func addNote() {
        let trimmed = newNoteText.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        let note = ClassNote(text: trimmed, scheduleEntry: entry)
        modelContext.insert(note)
        newNoteText = ""
    }

    private func deleteNotes(at offsets: IndexSet) {
        for index in offsets {
            modelContext.delete(sortedNotes[index])
        }
    }
}
