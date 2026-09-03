import SwiftUI
import SwiftData

@main
struct StudyOrganiserApp: App {
    let modelContainer: ModelContainer

    init() {
        let schema = Schema([Subject.self, ScheduleEntry.self, Assignment.self, ImportRule.self, ClassNote.self, LinkedFile.self])
        let cloudConfiguration = ModelConfiguration(schema: schema, cloudKitDatabase: .automatic)
        let localConfiguration = ModelConfiguration(schema: schema, cloudKitDatabase: .none)

        if let container = try? ModelContainer(for: schema, configurations: [cloudConfiguration]) {
            self.modelContainer = container
        } else if let container = try? ModelContainer(for: schema, configurations: [localConfiguration]) {
            self.modelContainer = container
        } else {
            fatalError("Could not initialize the data store.")
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(modelContainer)
        .defaultSize(width: 1100, height: 700)
    }
}
