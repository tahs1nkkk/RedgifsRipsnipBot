import Foundation

/// App-side settings store. The payload the in-app browser reads mirrors the
/// extension's `rgRipsnipSettings` JSON (see edge-extension/common/settings.js),
/// so the injected handlers see the exact shape they always have.
final class AppSettings: ObservableObject {
    static let shared = AppSettings()
    static let changedNotification = Notification.Name("rgSettingsChanged")
    static let settingsKey = "rgRipsnipSettings"

    @Published var masterEnabled: Bool { didSet { persist() } }
    @Published var showFab: Bool { didSet { persist() } }
    @Published var redgifsAvatarDownload: Bool { didSet { persist() } }
    @Published var redditImages: Bool { didSet { persist() } }
    @Published var hideRedditProfileAvatars: Bool { didSet { persist() } }
    @Published var scrolllerButtons: Bool { didSet { persist() } }
    @Published var coomerButtons: Bool { didSet { persist() } }
    @Published var instagramButtons: Bool { didSet { persist() } }
    @Published var buttonSize: Double { didSet { persist() } }
    @Published var homeURL: String { didSet { persist() } }

    // Reddit search overlay state, persisted like the extension's panel.
    @Published var searchUsername: String { didSet { persist() } }
    @Published var searchSubreddit: String { didSet { persist() } }
    @Published var searchProviders: Set<String> { didSet { persist() } }

    /// Keys handlers wrote through chrome.storage.set (folder lists and the
    /// like). Kept verbatim and merged back into every read so those flows
    /// keep working; the native-owned keys above always win.
    private(set) var extraSettings: [String: Any]

    private let defaults = UserDefaults.standard
    private var loading = true

    init() {
        masterEnabled = defaults.object(forKey: "masterEnabled") as? Bool ?? true
        showFab = defaults.object(forKey: "showFab") as? Bool ?? true
        redgifsAvatarDownload = defaults.object(forKey: "redgifsAvatarDownload") as? Bool ?? true
        redditImages = defaults.object(forKey: "redditImages") as? Bool ?? true
        hideRedditProfileAvatars = defaults.object(forKey: "hideRedditProfileAvatars") as? Bool ?? true
        scrolllerButtons = defaults.object(forKey: "scrolllerButtons") as? Bool ?? true
        coomerButtons = defaults.object(forKey: "coomerButtons") as? Bool ?? true
        instagramButtons = defaults.object(forKey: "instagramButtons") as? Bool ?? true
        buttonSize = defaults.object(forKey: "buttonSize") as? Double ?? 48
        homeURL = defaults.string(forKey: "homeURL") ?? "https://www.redgifs.com"
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
        defaults.set(masterEnabled, forKey: "masterEnabled")
        defaults.set(showFab, forKey: "showFab")
        defaults.set(redgifsAvatarDownload, forKey: "redgifsAvatarDownload")
        defaults.set(redditImages, forKey: "redditImages")
        defaults.set(hideRedditProfileAvatars, forKey: "hideRedditProfileAvatars")
        defaults.set(scrolllerButtons, forKey: "scrolllerButtons")
        defaults.set(coomerButtons, forKey: "coomerButtons")
        defaults.set(instagramButtons, forKey: "instagramButtons")
        defaults.set(buttonSize, forKey: "buttonSize")
        defaults.set(homeURL, forKey: "homeURL")
        defaults.set(searchUsername, forKey: "searchUsername")
        defaults.set(searchSubreddit, forKey: "searchSubreddit")
        defaults.set(Array(searchProviders), forKey: "searchProviders")
        NotificationCenter.default.post(name: Self.changedNotification, object: nil)
    }

    func mergeExtraSettings(_ items: [String: Any]) {
        let owned: Set<String> = [
            "buttonVisibility", "rightShiftDownload", "ripsnipFallback", "buttonSize",
            "redgifsAvatarDownload", "redditImages", "hideRedditProfileAvatars",
            "scrolllerButtons", "coomerButtons", "instagramButtons",
            "feedButtons", "profileButtons", "iframeButton", "directDownloads"
        ]
        for (key, value) in items where !owned.contains(key) {
            extraSettings[key] = value
        }
        if let data = try? JSONSerialization.data(withJSONObject: extraSettings) {
            defaults.set(data, forKey: "extraSettings")
        }
        NotificationCenter.default.post(name: Self.changedNotification, object: nil)
    }

    /// The dictionary handlers receive for `rgRipsnipSettings`. Mobile-hostile
    /// values are forced here, exactly like the Orion bridge's storage wrapper:
    /// hover never fires on touch, there is no hardware keyboard, and buttons
    /// below 48px are hard to hit.
    func settingsPayload() -> [String: Any] {
        var payload = extraSettings
        payload["buttonVisibility"] = "always"
        payload["rightShiftDownload"] = false
        payload["ripsnipFallback"] = false
        payload["directDownloads"] = true
        payload["buttonSize"] = max(48, Int(buttonSize))
        payload["feedButtons"] = masterEnabled
        payload["profileButtons"] = masterEnabled
        payload["iframeButton"] = masterEnabled
        payload["redgifsAvatarDownload"] = masterEnabled && redgifsAvatarDownload
        payload["redditImages"] = masterEnabled && redditImages
        payload["hideRedditProfileAvatars"] = hideRedditProfileAvatars
        payload["scrolllerButtons"] = masterEnabled && scrolllerButtons
        payload["coomerButtons"] = masterEnabled && coomerButtons
        payload["instagramButtons"] = masterEnabled && instagramButtons
        return payload
    }

    func settingsPayloadJSON() -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: settingsPayload()),
              let json = String(data: data, encoding: .utf8) else { return "{}" }
        return json
    }
}
