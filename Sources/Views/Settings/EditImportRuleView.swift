import SwiftUI
import SwiftData

/// Lets the user correct a class's auto-detected type/subject after the fact.
/// The change is applied to the saved rule (so future syncs stay correct) and
/// propagated immediately to every ScheduleEntry that rule already produced.
struct EditImportRuleView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Subject.name) private var subjects: [Subject]

    let rule: ImportRule

    @State private var type: ClassType
    @State private var subject: Subject?

    init(rule: ImportRule) {
        self.rule = rule
        _type = State(initialValue: rule.type)
        _subject = State(initialValue: rule.subject)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Class Type") {
                    Picker("Type", selection: $type) {
                        ForEach(ClassType.allCases) { t in
                            Text(t.rawValue).tag(t)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                Section("Subject") {
                    Picker("Subject", selection: $subject) {
                        Text("None").tag(Subject?.none)
                        ForEach(subjects) { option in
                            Text(option.name).tag(Optional(option))
                        }
                    }
                }
            }
            .navigationTitle(rule.matchText.capitalized)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 320)
        #endif
    }

    private func save() {
        rule.typeRaw = type.rawValue
        rule.subject = subject

        let matchKey = rule.matchText
        let allEntries = (try? modelContext.fetch(FetchDescriptor<ScheduleEntry>())) ?? []
        for entry in allEntries where entry.matchKey == matchKey {
            entry.typeRaw = type.rawValue
            entry.subject = subject
        }
        dismiss()
    }
}
