import SwiftUI
import UIKit

/// Fetches each supported site's own icon for the home tiles, caches it on disk
/// and never blocks the grid on it.
///
/// The tile always draws immediately from `SupportedSite.tint`; if a real icon
/// turns up it fades in over that. So a site that blocks the fetch, serves an
/// undecodable .ico or is simply offline still gets a usable branded tile
/// instead of a grey hole.
@MainActor
final class FaviconLoader: ObservableObject {
    static let shared = FaviconLoader()

    @Published private(set) var icons: [String: UIImage] = [:]
    private var attempted: Set<String> = []

    private let directory: URL = {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("favicons", isDirectory: true)
    }()

    func icon(for site: SupportedSite) -> UIImage? { icons[site.id] }

    /// Safe to call from every tile on every redraw; the `attempted` set makes
    /// every call after the first free.
    func load(_ site: SupportedSite) {
        guard !attempted.contains(site.id) else { return }
        attempted.insert(site.id)

        if let cached = UIImage(contentsOfFile: cacheURL(site).path) {
            icons[site.id] = cached
            return
        }
        guard let origin = site.pageURL else { return }
        Task { [weak self] in
            guard let image = await FaviconFetch.icon(origin: origin), let self else { return }
            self.icons[site.id] = image
            self.writeCache(image, for: site)
        }
    }

    /// Sites redesign; a cached icon can outlive its logo by months. Wiping the
    /// folder and the attempt set makes the next home screen fetch fresh.
    func clearCache() {
        try? FileManager.default.removeItem(at: directory)
        attempted.removeAll()
        icons.removeAll()
    }

    private func cacheURL(_ site: SupportedSite) -> URL {
        directory.appendingPathComponent("\(site.id).png")
    }

    private func writeCache(_ image: UIImage, for site: SupportedSite) {
        guard let data = image.pngData() else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: cacheURL(site), options: .atomic)
    }
}

/// Kept outside the class so it stays free of actor isolation — nothing here
/// touches UI state, and the caller is already on the main actor when it awaits.
private enum FaviconFetch {
    // Some CDNs answer a bare fetch with 403 and a browser UA with a PNG.
    private static let userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
        + "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"

    static func icon(origin: URL) async -> UIImage? {
        // Apple's own convention first: those are the large, square icons meant
        // for a home screen, which is exactly the shape a tile needs. Declared
        // icons come next, because a site that bothers to declare one usually
        // declares the good one. favicon.ico is last — tiny, and UIImage
        // decodes .ico only sometimes.
        var candidates = [
            origin.appendingPathComponent("apple-touch-icon.png"),
            origin.appendingPathComponent("apple-touch-icon-precomposed.png")
        ]
        candidates.append(contentsOf: await declaredIcons(origin: origin))
        candidates.append(origin.appendingPathComponent("favicon.ico"))

        for candidate in candidates {
            if let image = await download(candidate) { return image }
        }
        return nil
    }

    private static func request(_ url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        request.timeoutInterval = 8
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        return request
    }

    private static func download(_ url: URL) async -> UIImage? {
        guard let (data, response) = try? await URLSession.shared.data(for: request(url)),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let image = UIImage(data: data),
              // Some sites answer every path with a 200 HTML page, and some
              // "icons" are tracking dots. A 16-pixel square is neither an icon
              // worth showing nor evidence the fetch worked.
              image.size.width >= 32, image.size.height >= 32 else { return nil }
        return image
    }

    /// Scrapes `<link rel="… icon …" href="…">` out of the home page. A regex
    /// over HTML is normally a mistake; this one only has to survive the five
    /// sites in the catalog, and a miss falls through to the generated tile.
    private static func declaredIcons(origin: URL) async -> [URL] {
        guard let (data, _) = try? await URLSession.shared.data(for: request(origin)),
              let html = String(data: data.prefix(300_000), encoding: .utf8) else { return [] }

        let linkPattern = "<link[^>]+rel=[\"'][^\"']*icon[^\"']*[\"'][^>]*>"
        guard let linkRegex = try? NSRegularExpression(pattern: linkPattern, options: .caseInsensitive),
              let hrefRegex = try? NSRegularExpression(pattern: "href=[\"']([^\"']+)[\"']", options: .caseInsensitive)
        else { return [] }

        var found: [URL] = []
        for match in linkRegex.matches(in: html, range: NSRange(html.startIndex..., in: html)) {
            guard let tagRange = Range(match.range, in: html) else { continue }
            let tag = String(html[tagRange])
            guard let href = hrefRegex.firstMatch(in: tag, range: NSRange(tag.startIndex..., in: tag)),
                  let hrefRange = Range(href.range(at: 1), in: tag) else { continue }
            let raw = String(tag[hrefRange]).replacingOccurrences(of: "&amp;", with: "&")
            if let url = URL(string: raw, relativeTo: origin)?.absoluteURL,
               url.scheme?.hasPrefix("http") == true {
                found.append(url)
            }
        }
        return found.sorted { score($0) > score($1) }
    }

    private static func score(_ url: URL) -> Int {
        let text = url.absoluteString.lowercased()
        if text.contains("apple-touch") { return 3 }
        if text.contains(".png") { return 2 }
        if text.hasSuffix(".svg") { return 0 }  // UIImage cannot decode SVG.
        return 1
    }
}
