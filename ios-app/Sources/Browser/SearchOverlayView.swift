import SwiftUI

/// The Reddit user-search trigger, native edition. Sits translucent at the
/// bottom-left; the first tap makes it fully visible for 2.5 seconds, a second
/// tap within that window opens the search sheet. Search URLs are the exact
/// formulas from content-reddit.js; results open as tabs in the phone's
/// default browser.
struct SearchOverlayView: View {
    @State private var revealed = false
    @State private var showSheet = false
    @State private var revertTask: Task<Void, Never>?

    var body: some View {
        Button(action: handleTap) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .liquidGlass(in: Circle(), tint: .orange, interactive: true)
        }
        .opacity(revealed ? 1 : 0.28)
        .animation(.easeInOut(duration: 0.18), value: revealed)
        .accessibilityLabel("Reddit kullanıcı ara")
        .sheet(isPresented: $showSheet) { SearchSheet() }
    }

    private func handleTap() {
        if revealed {
            revertTask?.cancel()
            revealed = false
            showSheet = true
            return
        }
        revealed = true
        revertTask?.cancel()
        revertTask = Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            guard !Task.isCancelled else { return }
            revealed = false
        }
    }
}

struct SearchSheet: View {
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    private let providers: [(id: String, label: String)] = [
        ("reddit", "Reddit"), ("old", "Old Reddit"), ("google", "Google"), ("bing", "Bing")
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section("Kullanıcı") {
                    TextField("u/kullanici", text: $settings.searchUsername)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("r/subreddit (opsiyonel)", text: $settings.searchSubreddit)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Section("Nerede aransın") {
                    ForEach(providers, id: \.id) { provider in
                        Toggle(provider.label, isOn: providerBinding(provider.id))
                    }
                }
                Section {
                    Button(action: runSearch) {
                        Label("Ara — varsayılan tarayıcıda aç", systemImage: "arrow.up.forward.app")
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(RedditSearch.sanitize(settings.searchUsername).isEmpty || settings.searchProviders.isEmpty)
                }
            }
            .navigationTitle("Kullanıcı Ara")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Kapat") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func providerBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { settings.searchProviders.contains(id) },
            set: { enabled in
                if enabled { settings.searchProviders.insert(id) } else { settings.searchProviders.remove(id) }
            }
        )
    }

    private func runSearch() {
        let urls = providers.map(\.id)
            .filter { settings.searchProviders.contains($0) }
            .compactMap { RedditSearch.buildURL(username: settings.searchUsername, subreddit: settings.searchSubreddit, provider: $0) }
        guard !urls.isEmpty else { return }
        dismiss()
        // Safari needs a beat between opens or it keeps only the last tab.
        Task {
            for url in urls {
                openURL(url)
                try? await Task.sleep(nanoseconds: 400_000_000)
            }
        }
    }
}

/// Port of spSanitize/spBuildUrl from content-reddit.js — author: searches the
/// index (which a hidden profile does not hide) with t=all so old posts show.
enum RedditSearch {
    static func sanitize(_ value: String) -> String {
        var text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        text = text.replacingOccurrences(
            of: "^https?://(?:www\\.|old\\.|new\\.)?reddit\\.com/", with: "",
            options: [.regularExpression, .caseInsensitive]
        )
        text = text.replacingOccurrences(of: "^/+", with: "", options: .regularExpression)
        text = text.replacingOccurrences(
            of: "^(?:u|user|r)/", with: "",
            options: [.regularExpression, .caseInsensitive]
        )
        if text.hasPrefix("@") { text.removeFirst() }
        text = text.replacingOccurrences(of: "[^A-Za-z0-9_-]", with: "", options: .regularExpression)
        return String(text.prefix(40))
    }

    static func buildURL(username: String, subreddit: String, provider: String) -> URL? {
        let user = sanitize(username)
        guard !user.isEmpty else { return nil }
        let sub = sanitize(subreddit)

        func encode(_ value: String) -> String {
            value.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? value
        }
        let authorQuery = encode("author:\(user)")

        switch provider {
        case "old":
            if !sub.isEmpty {
                return URL(string: "https://old.reddit.com/r/\(encode(sub))/search?q=\(authorQuery)&restrict_sr=on&sort=new&t=all&include_over_18=on")
            }
            return URL(string: "https://old.reddit.com/search?q=\(authorQuery)&sort=new&t=all&include_over_18=on")
        case "google", "bing":
            let query = sub.isEmpty
                ? "site:reddit.com \"u/\(user)\""
                : "site:reddit.com/r/\(sub) \"u/\(user)\""
            let base = provider == "google" ? "https://www.google.com/search?q=" : "https://www.bing.com/search?q="
            return URL(string: base + encode(query))
        default:
            if !sub.isEmpty {
                return URL(string: "https://www.reddit.com/r/\(encode(sub))/search/?q=\(authorQuery)&restrict_sr=1&sort=new&t=all&include_over_18=on")
            }
            return URL(string: "https://www.reddit.com/search/?q=\(authorQuery)&sort=new&t=all")
        }
    }
}
