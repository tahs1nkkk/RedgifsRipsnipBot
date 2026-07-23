import SwiftUI
import WebKit

struct WebViewContainer: UIViewRepresentable {
    let controller: BrowserController

    func makeUIView(context: Context) -> WKWebView { controller.attachWebView() }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct BrowserScreen: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var browser: BrowserController
    @ObservedObject private var downloader = Downloader.shared
    @FocusState private var addressFocused: Bool

    private let quickSites: [(String, String)] = [
        ("RedGifs", "https://www.redgifs.com"),
        ("Reddit", "https://www.reddit.com"),
        ("Scrolller", "https://scrolller.com"),
        ("Coomer", "https://coomer.st"),
        ("Instagram", "https://www.instagram.com")
    ]

    var body: some View {
        VStack(spacing: 0) {
            addressBar
            ZStack(alignment: .bottom) {
                WebViewContainer(controller: browser)
                    .ignoresSafeArea(.keyboard)
                overlays
            }
        }
    }

    private var addressBar: some View {
        HStack(spacing: 10) {
            Button(action: { browser.goBack() }) { Image(systemName: "chevron.left") }
                .disabled(!browser.canGoBack)
            Button(action: { browser.goForward() }) { Image(systemName: "chevron.right") }
                .disabled(!browser.canGoForward)

            TextField("adres", text: $browser.addressText)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .submitLabel(.go)
                .focused($addressFocused)
                .onSubmit {
                    addressFocused = false
                    browser.load(browser.addressText)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 9))

            if browser.isLoading {
                ProgressView().controlSize(.small)
            } else {
                Button(action: { browser.reload() }) { Image(systemName: "arrow.clockwise") }
            }

            Menu {
                ForEach(quickSites, id: \.0) { name, url in
                    Button(name) { browser.load(url) }
                }
            } label: {
                Image(systemName: "square.grid.2x2")
            }
        }
        .font(.system(size: 16, weight: .medium))
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var overlays: some View {
        VStack(spacing: 10) {
            Spacer()
            HStack(alignment: .bottom) {
                if settings.masterEnabled && browser.isRedditPage {
                    SearchOverlayView()
                }
                Spacer()
                if settings.masterEnabled && settings.showFab {
                    fabButton
                }
            }
            .padding(.horizontal, 16)
            if downloader.phase != .idle {
                DownloadHUDView(phase: downloader.phase)
                    .padding(.horizontal, 12)
            }
        }
        .padding(.bottom, 10)
    }

    private var fabButton: some View {
        Button(action: { browser.triggerFabDownload() }) {
            Image(systemName: "arrow.down.to.line")
                .font(.system(size: 21, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(Circle().fill(Color.blue.opacity(0.92)))
                .shadow(color: .black.opacity(0.35), radius: 9, y: 4)
        }
        .accessibilityLabel("Bu sayfadaki medyayı indir")
    }
}

struct DownloadHUDView: View {
    let phase: Downloader.Phase

    var body: some View {
        HStack(spacing: 10) {
            icon
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                if let detail { Text(detail).font(.system(size: 12)).foregroundStyle(.secondary) }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.25), radius: 10, y: 4)
    }

    @ViewBuilder private var icon: some View {
        switch phase {
        case .fetching: ProgressView()
        case .saving: ProgressView()
        case .done: Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case .failed: Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
        case .idle: EmptyView()
        }
    }

    private var title: String {
        switch phase {
        case .fetching(let name, _, _, _): return name
        case .saving(let name): return name
        case .done(let message): return message
        case .failed(let message): return message
        case .idle: return ""
        }
    }

    private var detail: String? {
        switch phase {
        case .fetching(_, let received, let total, let startedAt):
            // Coomer often omits content-length; moving bytes and a rate are
            // the honest signal that a slow transfer is alive, not stuck.
            var text = "İndiriliyor… \(Self.bytes(received))"
            if total > 0 {
                let percent = Int((Double(received) / Double(total) * 100).rounded())
                text += " / \(Self.bytes(total)) (%\(min(100, percent)))"
            }
            let elapsed = Date().timeIntervalSince(startedAt)
            if elapsed > 0.4 && received > 0 {
                text += " · \(Self.bytes(Int64(Double(received) / elapsed)))/sn"
            }
            return text
        case .saving: return "Fotoğraflara kaydediliyor…"
        default: return nil
        }
    }

    private static func bytes(_ value: Int64) -> String {
        if value >= 1_048_576 { return String(format: "%.1f MB", Double(value) / 1_048_576) }
        return "\(max(1, value / 1024)) KB"
    }
}
