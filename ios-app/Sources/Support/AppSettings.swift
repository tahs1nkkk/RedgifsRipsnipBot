import Foundation

/// App-side settings store. The payload the in-app browser reads mirrors the
/// extension's `rgRipsnipSettings` JSON (see edge-extension/common/settings.js),
/// so the injected handlers see the exact shape they always have.
///
/// What is *not* here is deliberate. This is a downloader, so there is no
/// switch for "turn downloading off" and none for "hide the download buttons":
/// the page-injected buttons are always hidden (the app drives them from the
/// floating button instead) and every handler capability is always on. A
/// setting that only ever has one sane value is a setting that lies about
/// having two.
final class AppSettings: ObservableObject {
    static let shared = AppSettings()
    static let changedNotification = Notification.Name("rgSettingsChanged")
    static let settingsKey = "rgRipsnipSettings"

    /// The floating button's diameter. Applies to that button and nothing else
    /// — the handlers' own buttons are invisible, so sizing them is meaningless.
    @Published var fabSize: Double { didSet { persist() } }
    /// Right-handed by default; left for the other half of the world.
    @Published var fabOnLeft: Bool { didSet { persist() } }
    /// The Reddit user-search bubble. Off for anyone who does not use it, since
    /// it does occupy a corner of every Reddit page.
    @Published var searchOverlayEnabled: Bool { didSet { persist() } }

    // Reddit search state, persisted like the extension's panel.
    @Published var searchUsername: String { didSet { persist() } }
    @Published var searchSubreddit: String { didSet { persist() } }
    @Published var searchProviders: Set<String> { didSet { persist() } }

    /// Keys handlers wrote through chrome.storage.set (folder lists and the
    /// like). Kept verbatim and merged back into every read so those flows keep
    /// working; the native-owned keys below always win.
    private(set) var extraSettings: [String: Any]

    private let defaults = UserDefaults.standard
    private var loading = true

    init() {
        fabSize = defaults.object(forKey: "fabSize") as? Double ?? 58
        fabOnLeft = defaults.object(forKey: "fabOnLeft") as? Bool ?? false
        searchOverlayEnabled = defaults.object(forKey: "searchOverlayEnabled") as? Bool ?? true
        searchUsername = defaults.string(forKey: "searchUsername") ?? ""
        searchSubreddit = defaults.string(forKey: "searchSubreddit") ?? ""
        searchProviders = Set(defaults.stringArray(forKey: "searchProviders") ?? ["reddit", "old"])
        if let data = defaults.data(forKey: "extraSettings"),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            extraSettings = parsed
        } else {
            extraSettings = [:]
        }
        loading = false
    }

    private func persist() {
        guard !loading else { return }
        defaults.set(fabSize, forKey: "fabSize")
        defaults.set(fabOnLeft, forKey: "fabOnLeft")
        defaults.set(searchOverlayEnabled, forKey: "searchOverlayEnabled")
        defaults.set(searchUsername, forKey: "searchUsername")
        defaults.set(searchSubreddit, forKey: "searchSubreddit")
        defaults.set(Array(searchProviders), forKey: "searchProviders")
        NotificationCenter.default.post(name: Self.changedNotification, object: nil)
    }

    func mergeExtraSettings(_ items: [String: Any]) {
        for (key, value) in items where !Self.forcedKeys.contains(key) {
            extraSettings[key] = value
        }
        if let data = try? JSONSerialization.data(withJSONObject: extraSettings) {
            defaults.set(data, forKey: "extraSettings")
        }
        NotificationCenter.default.post(name: Self.changedNotification, object: nil)
    }

    /// Everything `settingsPayload()` writes itself. A handler that persists one
    /// of these must not be able to pin the app to its own value.
    private static let forcedKeys: Set<String> = [
        "buttonVisibility", "rightShiftDownload", "ripsnipFallback", "directDownloads",
        "buttonSize", "feedButtons", "profileButtons", "iframeButton",
        "redgifsAvatarDownload", "redditImages", "hideRedditProfileAvatars",
        "scrolllerButtons", "coomerButtons", "instagramButtons"
    ]

    /// The dictionary handlers receive for `rgRipsnipSettings`.
    ///
    /// Every capability is on: the buttons are the app's media *resolvers*, not
    /// UI, so switching one off would only blind the floating button on that
    /// site. Mobile-hostile values are forced the same way the Orion bridge
    /// forces them — hover never fires on touch, and there is no Shift key.
    func settingsPayload() -> [String: Any] {
        var payload = extraSettings
        payload["buttonVisibility"] = "always"
        payload["rightShiftDownload"] = false
        payload["ripsnipFallback"] = false
        payload["directDownloads"] = true
        // Fixed, and unrelated to fabSize: this sizes the hidden buttons, and
        // the floating button finds media by asking where they sit. Big enough
        // to measure reliably, small enough to stay inside its media's box.
        payload["buttonSize"] = 48
        payload["feedButtons"] = true
        payload["profileButtons"] = true
        payload["iframeButton"] = true
        payload["redgifsAvatarDownload"] = true
        payload["redditImages"] = true
        // Avatars are below the floating button's 120px media threshold, so a
        // resolver there can never be reached; skipping them keeps busy Reddit
        // feeds from building hundreds of dead nodes.
        payload["hideRedditProfileAvatars"] = true
        payload["scrolllerButtons"] = true
        payload["coomerButtons"] = true
        payload["instagramButtons"] = true
        return payload
    }

    func settingsPayloadJSON() -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: settingsPayload()),
              let json = String(data: data, encoding: .utf8) else { return "{}" }
        return json
    }
}
