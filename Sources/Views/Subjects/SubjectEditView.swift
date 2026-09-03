import SwiftUI
import SwiftData
import UniformTypeIdentifiers

struct SubjectEditView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    let subject: Subject?

    @State private var name: String = ""
    @State private var colorHex: String = SubjectColor.palette[0]
    @State private var showingFileImporter = false
    @State private var linkError: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Subject Name", text: $name)
                Section("Color") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 12) {
                        ForEach(SubjectColor.palette, id: \.self) { hex in
                            Circle()
                                .fill(SubjectColor.color(for: hex))
                                .frame(width: 32, height: 32)
                                .overlay {
                                    if hex == colorHex {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(.white)
                                            .font(.caption.bold())
                                    }
                                }
                                .onTapGesture { colorHex = hex }
                        }
                    }
                    .padding(.vertical, 4)
                }

                if let subject {
                    Section {
                        ForEach(subject.linkedFiles ?? []) { file in
                            Button {
                                open(file)
                            } label: {
                                Label(file.displayName, systemImage: file.isDirectory ? "folder.fill" : "doc.fill")
                            }
                        }
                        .onDelete { offsets in
                            let files = subject.linkedFiles ?? []
                            for index in offsets { modelContext.delete(files[index]) }
                        }
                        Button {
                            showingFileImporter = true
                        } label: {
                            Label("Link a File or Folder", systemImage: "plus")
                        }
                    } header: {
                        Text("Linked Notes")
                    } footer: {
                        Text("Link a GoodNotes notebook or folder from iCloud Drive to jump straight to it. This only works if GoodNotes is set to store that notebook in iCloud Drive/Files (GoodNotes settings → Document Storage) - the app can't reach into GoodNotes' own private storage directly.")
                    }
                }

                if let linkError {
                    Text(linkError)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .navigationTitle(subject == nil ? "New Subject" : "Edit Subject")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                if let subject {
                    name = subject.name
                    colorHex = subject.colorHex
                }
            }
            .fileImporter(isPresented: $showingFileImporter, allowedContentTypes: [.item]) { result in
                linkFile(from: result)
            }
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 320)
        #endif
    }

    private func save() {
        if let subject {
            subject.name = name
            subject.colorHex = colorHex
        } else {
            modelContext.insert(Subject(name: name, colorHex: colorHex))
        }
        dismiss()
    }

    private func linkFile(from result: Result<URL, Error>) {
        guard let subject else { return }
        linkError = nil
        switch result {
        case .failure(let error):
            linkError = error.localizedDescription
        case .success(let url):
            let didAccess = url.startAccessingSecurityScopedResource()
            defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
            guard let bookmarkData = FileBookmark.makeBookmark(for: url) else {
                linkError = "Couldn't create a persistent link to that item."
                return
            }
            let file = LinkedFile(
                displayName: url.lastPathComponent,
                bookmarkData: bookmarkData,
                isDirectory: url.hasDirectoryPath,
                subject: subject
            )
            modelContext.insert(file)
        }
    }

    private func open(_ file: LinkedFile) {
        linkError = nil
        guard let url = FileBookmark.resolve(file.bookmarkData) else {
            linkError = "Couldn't find \"\(file.displayName)\" anymore. It may have moved."
            return
        }
        let didAccess = url.startAccessingSecurityScopedResource()
        openURL(url) { accepted in
            if didAccess { url.stopAccessingSecurityScopedResource() }
            if !accepted {
                linkError = "No app could open \"\(file.displayName)\"."
            }
        }
    }
}
