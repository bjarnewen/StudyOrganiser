import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \ImportRule.matchText) private var rules: [ImportRule]

    @AppStorage("icsURL") private var icsURLString: String = ""
    @AppStorage("lastSyncDate") private var lastSyncTimestamp: Double = 0

    @State private var isImporting = false
    @State private var errorMessage: String?
    @State private var statusMessage: String?
    @State private var editingRule: ImportRule?

    private var lastSyncText: String {
        guard lastSyncTimestamp > 0 else { return "Never" }
        let date = Date(timeIntervalSince1970: lastSyncTimestamp)
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    var body: some View {
        Form {
            Section {
                TextField("iCal / webcal URL", text: $icsURLString)
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    #endif
                    .autocorrectionDisabled()
                    .onSubmit { Task { await importNow() } }
                Button {
                    Task { await importNow() }
                } label: {
                    if isImporting {
                        ProgressView()
                    } else {
                        Text("Import / Refresh Now")
                    }
                }
                .disabled(icsURLString.trimmingCharacters(in: .whitespaces).isEmpty || isImporting)
            } header: {
                Text("Calendar Source")
            } footer: {
                Text("Paste your calendar's iCal (.ics) link and the schedule builds itself automatically - each class's type (Lecture/Tutorial/Practical/Exam) and subject are detected from its title. In Google Calendar: Settings → pick your calendar under \"Settings for my calendars\" → \"Integrate calendar\" → copy \"Secret address in iCal format\".")
            }

            Section("Sync Status") {
                LabeledContent("Last Synced", value: lastSyncText)
                if let statusMessage {
                    Text(statusMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }

            if !rules.isEmpty {
                Section {
                    ForEach(rules) { rule in
                        Button {
                            editingRule = rule
                        } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(rule.matchText.capitalized)
                                        .foregroundStyle(.primary)
                                    Text(rule.subject?.name ?? "No subject")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                TypeBadge(type: rule.type)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .onDelete { offsets in
                        for index in offsets { modelContext.delete(rules[index]) }
                    }
                } header: {
                    Text("Class Mappings")
                } footer: {
                    Text("Tap a class to fix its detected type or subject.")
                }
            }
        }
        .navigationTitle("Settings")
        .sheet(item: $editingRule) { rule in
            EditImportRuleView(rule: rule)
        }
    }

    private func importNow() async {
        isImporting = true
        errorMessage = nil
        statusMessage = nil
        defer { isImporting = false }

        do {
            let events = try await ICSImporter.fetchAndParse(urlString: icsURLString)
            let summary = ICSImporter.autoImport(events: events, modelContext: modelContext)
            lastSyncTimestamp = Date.now.timeIntervalSince1970

            var parts = ["\(summary.totalDistinctClasses) class\(summary.totalDistinctClasses == 1 ? "" : "es") on your schedule"]
            if summary.newSubjectsCreated > 0 {
                parts.append("\(summary.newSubjectsCreated) new subject\(summary.newSubjectsCreated == 1 ? "" : "s") created")
            }
            statusMessage = parts.joined(separator: " · ")
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
