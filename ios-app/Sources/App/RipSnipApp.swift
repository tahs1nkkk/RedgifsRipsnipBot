import SwiftUI

@main
struct RipSnipApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(AppSettings.shared)
                .environmentObject(DownloadRecordStore.shared)
                .environmentObject(BrowserController.shared)
        }
    }
}
