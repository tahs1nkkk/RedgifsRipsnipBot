import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            BrowserScreen()
                .tabItem { Label("Tarayıcı", systemImage: "globe") }
            GalleryScreen()
                .tabItem { Label("Galeri", systemImage: "photo.on.rectangle") }
            SettingsScreen()
                .tabItem { Label("Ayarlar", systemImage: "gearshape") }
        }
    }
}
