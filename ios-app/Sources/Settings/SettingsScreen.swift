import SwiftUI

struct SettingsScreen: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var browser: BrowserController

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("İndirme katmanı", isOn: $settings.masterEnabled)
                    Toggle("Yüzen indirme butonu", isOn: $settings.showFab)
                } header: {
                    Text("Genel")
                } footer: {
                    Text("İndirme katmanı kapalıyken sitelere buton eklenmez. Değişiklik açık sayfaya anında iner; inatçı sayfalarda bir yenileme yeter.")
                }

                Section("Siteler") {
                    Toggle("RedGifs profil fotoğrafı butonu", isOn: $settings.redgifsAvatarDownload)
                    Toggle("Reddit görselleri", isOn: $settings.redditImages)
                    Toggle("Reddit avatarlarında buton gizle", isOn: $settings.hideRedditProfileAvatars)
                    Toggle("Scrolller butonları", isOn: $settings.scrolllerButtons)
                    Toggle("Coomer butonları", isOn: $settings.coomerButtons)
                    Toggle("Instagram butonları", isOn: $settings.instagramButtons)
                }

                Section {
                    VStack(alignment: .leading) {
                        Text("Buton boyutu: \(Int(settings.buttonSize)) px")
                        Slider(value: $settings.buttonSize, in: 48...72, step: 2)
                    }
                    TextField("Açılış sayfası", text: $settings.homeURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                } header: {
                    Text("Tarayıcı")
                }

                Section {
                    Button("Sayfayı yenile") { browser.reload() }
                    Link("Fotoğraflar iznini yönet", destination: URL(string: UIApplication.openSettingsURLString)!)
                } header: {
                    Text("Diğer")
                } footer: {
                    Text("İndirilenler doğrudan Fotoğraflar'a kaydedilir; paylaşım sayfası yoktur. Galeri, Fotoğraflar'da Gizli klasörüne taşınanları göstermez. webm dosyaları Fotoğraflar tarafından kabul edilmez.")
                }
            }
            .navigationTitle("Ayarlar")
        }
    }
}
