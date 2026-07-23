import SwiftUI

struct RootView: View {
    @EnvironmentObject private var browser: BrowserController
    @State private var tab: Tab = .browser

    enum Tab: Hashable {
        case browser
        case gallery
        case settings
    }

    var body: some View {
        TabView(selection: selection) {
            BrowserScreen()
                .tag(Tab.browser)
                .tabItem { Label("Tarayıcı", systemImage: "globe") }
            GalleryScreen()
                .tag(Tab.gallery)
                .tabItem { Label("Galeri", systemImage: "photo.on.rectangle") }
            SettingsScreen()
                .tag(Tab.settings)
                .tabItem { Label("Ayarlar", systemImage: "gearshape") }
        }
    }

    /// SwiftUI calls this setter even when the tap lands on the tab that is
    /// already selected, which is what makes "tap Tarayıcı again to go home"
    /// possible without stealing a corner of the page for a home button.
    private var selection: Binding<Tab> {
        Binding(
            get: { tab },
            set: { next in
                if next == .browser && tab == .browser { browser.goHome() }
                tab = next
            }
        )
    }
}
