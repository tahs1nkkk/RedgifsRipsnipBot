import Combine
import UIKit
import WebKit

/// Owns the single WKWebView, injects the generated JS payload and answers the
/// bridge's messages — the native counterpart of the extension's background
/// script plus the Orion bridge, rolled into one.
@MainActor
final class BrowserController: NSObject, ObservableObject {
    static let shared = BrowserController(settings: .shared, records: .shared)

    @Published var addressText = ""
    @Published var currentHost = ""
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var isLoading = false

    let settings: AppSettings
    let records: DownloadRecordStore
    private(set) var webView: WKWebView?
    private var cancellables = Set<AnyCancellable>()

    // WKWebView's default user agent lacks the Safari token, which makes
    // Instagram and Google refuse logins. Present as mobile Safari instead.
    private static let safariUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
        + "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"

    init(settings: AppSettings, records: DownloadRecordStore) {
        self.settings = settings
        self.records = records
        super.init()
        NotificationCenter.default.publisher(for: AppSettings.changedNotification)
            .sink { [weak self] _ in
                Task { @MainActor in self?.broadcastSettings() }
            }
            .store(in: &cancellables)
    }

    var isRedditPage: Bool {
        currentHost == "reddit.com" || currentHost.hasSuffix(".reddit.com")
    }

    // MARK: - Web view

    func attachWebView() -> WKWebView {
        if let webView { return webView }

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let controller = configuration.userContentController
        controller.addScriptMessageHandler(self, contentWorld: .defaultClient, name: "rgNative")

        // Worlds mirror the extension: handlers isolated from the page,
        // the RedGifs clipboard hook in the page's own world.
        addScript(controller, resource: "rg-core", injection: .atDocumentStart, world: .defaultClient)
        addScript(controller, resource: "rg-handlers", injection: .atDocumentEnd, world: .defaultClient)
        addScript(controller, resource: "rg-page-hook", injection: .atDocumentStart, world: .page)

        let view = WKWebView(frame: .zero, configuration: configuration)
        view.customUserAgent = Self.safariUA
        view.allowsBackForwardNavigationGestures = true
        view.navigationDelegate = self
        view.uiDelegate = self
        if #available(iOS 16.4, *) { view.isInspectable = true }
        webView = view

        load(settings.homeURL)
        return view
    }

    private func addScript(_ controller: WKUserContentController, resource: String, injection: WKUserScriptInjectionTime, world: WKContentWorld) {
        guard let url = Bundle.main.url(forResource: resource, withExtension: "js"),
              let source = try? String(contentsOf: url, encoding: .utf8) else {
            assertionFailure("Missing bundled script \(resource).js — run scripts/build-ios-app-js.js")
            return
        }
        controller.addUserScript(WKUserScript(source: source, injectionTime: injection, forMainFrameOnly: false, in: world))
    }

    func load(_ text: String) {
        var raw = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return }
        if !raw.lowercased().hasPrefix("http://") && !raw.lowercased().hasPrefix("https://") {
            raw = "https://\(raw)"
        }
        guard let url = URL(string: raw) else { return }
        _ = attachWebView()
        webView?.load(URLRequest(url: url))
    }

    func goBack() { webView?.goBack() }
    func goForward() { webView?.goForward() }
    func reload() { webView?.reload() }

    private func syncNavigationState() {
        guard let webView else { return }
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
        if let url = webView.url {
            addressText = url.absoluteString
            currentHost = url.host?.lowercased() ?? ""
        }
    }

    // MARK: - Bridge

    func broadcastSettings() {
        guard let webView else { return }
        let js = "window.__rgNativeSettingsChanged && window.__rgNativeSettingsChanged(\(settings.settingsPayloadJSON()));"
        webView.evaluateJavaScript(js, in: nil, in: .defaultClient, completionHandler: nil)
    }

    func triggerFabDownload() {
        guard let webView else { return }
        let js = "window.__rgFabDownload ? window.__rgFabDownload() : 'none';"
        webView.evaluateJavaScript(js, in: nil, in: .defaultClient) { result in
            if case .success(let value) = result, let outcome = value as? String, outcome == "none" {
                Downloader.shared.flash("İndirilecek medya bulunamadı")
            }
        }
    }

    private func currentCookies() async -> [HTTPCookie] {
        guard let store = webView?.configuration.websiteDataStore.httpCookieStore else { return [] }
        return await withCheckedContinuation { continuation in
            store.getAllCookies { continuation.resume(returning: $0) }
        }
    }

    private func route(kind: String, body: [String: Any], pageURL: URL?) async -> Any {
        switch kind {
        case "storageGet":
            // Only the settings key exists natively; extras ride along inside it.
            return [AppSettings.settingsKey: settings.settingsPayload()]
        case "storageSet":
            if let items = body["items"] as? [String: Any],
               let stored = items[AppSettings.settingsKey] as? [String: Any] {
                settings.mergeExtraSettings(stored)
            }
            return [:] as [String: Any]
        case "storageRemove":
            return [:] as [String: Any]
        case "message":
            guard let message = body["message"] as? [String: Any],
                  let type = message["type"] as? String else {
                return ["ok": false, "error": "APP00: boş mesaj"]
            }
            switch type {
            case "OPEN_TAB":
                if let urlString = message["url"] as? String { load(urlString) }
                return ["ok": true]
            case "START_RIPSNIP":
                return ["ok": false, "error": "IOS03: Ripsnip iOS'ta desteklenmiyor"]
            case "DIRECT_DOWNLOAD":
                let cookies = await currentCookies()
                return await Downloader.shared.handleDirectDownload(
                    message, pageURL: pageURL, cookies: cookies, userAgent: Self.safariUA, records: records
                )
            default:
                return ["ok": false, "error": "APP01: bilinmeyen mesaj \(type)"]
            }
        default:
            return ["ok": false, "error": "APP02: bilinmeyen istek"]
        }
    }
}

// MARK: - WKScriptMessageHandlerWithReply

extension BrowserController: WKScriptMessageHandlerWithReply {
    nonisolated func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let body = message.body as? [String: Any], let kind = body["kind"] as? String else {
            replyHandler(nil, "APP03: çözülemeyen mesaj gövdesi")
            return
        }
        Task { @MainActor in
            let pageURL = self.webView?.url
            let result = await self.route(kind: kind, body: body, pageURL: pageURL)
            replyHandler(result, nil)
        }
    }
}

// MARK: - WKNavigationDelegate / WKUIDelegate

extension BrowserController: WKNavigationDelegate, WKUIDelegate {
    nonisolated func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        Task { @MainActor in
            self.isLoading = true
            self.syncNavigationState()
        }
    }

    nonisolated func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        Task { @MainActor in self.syncNavigationState() }
    }

    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            self.isLoading = false
            self.syncNavigationState()
            self.broadcastSettings()
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in self.isLoading = false }
    }

    nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in self.isLoading = false }
    }

    // target=_blank links load in the same view; the app has one tab.
    nonisolated func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            Task { @MainActor in self.webView?.load(URLRequest(url: url)) }
        }
        return nil
    }
}
