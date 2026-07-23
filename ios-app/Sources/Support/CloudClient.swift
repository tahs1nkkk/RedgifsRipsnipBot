import Foundation

/// One file in the cloud (Cloudflare R2, served by the Worker).
struct CloudFile: Identifiable, Decodable, Equatable {
    let name: String
    let size: Int64
    let mtime: Double
    let kind: String

    var id: String { name }
    var isVideo: Bool { kind == "video" }
    var date: Date { Date(timeIntervalSince1970: mtime / 1000) }
}

enum CloudError: LocalizedError {
    case notConfigured
    case badResponse(Int)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Bulut ayarlanmamış (Ayarlar → Bulut)"
        case .badResponse(let code): return "Sunucu \(code) döndürdü"
        }
    }
}

/// Talks to the Cloudflare Worker's R2-backed media endpoints (/api/media).
/// Every call re-reads the settings, so pasting the Worker URL and a token into
/// the settings screen is all it takes — no restart, no rebuild.
struct CloudClient {
    let base: URL
    let token: String

    /// Nil while the settings are incomplete; callers treat that as
    /// "cloud does not exist", not as an error.
    static func fromSettings() -> CloudClient? {
        let settings = AppSettings.shared
        guard settings.cloudConfigured,
              let base = URL(string: settings.archiveURL.trimmingCharacters(in: .whitespaces)) else { return nil }
        return CloudClient(base: base, token: settings.sharedToken)
    }

    private func request(_ path: String, method: String = "GET") -> URLRequest {
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func check(_ response: URLResponse) throws {
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200...299).contains(code) else { throw CloudError.badResponse(code) }
    }

    func list() async throws -> [CloudFile] {
        let (data, response) = try await URLSession.shared.data(for: request("api/media"))
        try check(response)
        return try JSONDecoder().decode([CloudFile].self, from: data)
    }

    /// Streams the file up; the server dodges name collisions itself and
    /// answers with the name it actually stored.
    @discardableResult
    func upload(fileURL: URL, preferredName: String) async throws -> String {
        let encoded = preferredName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? preferredName
        var request = request("api/media/\(encoded)", method: "PUT")
        request.timeoutInterval = 3600
        let (data, response) = try await URLSession.shared.upload(for: request, fromFile: fileURL)
        try check(response)
        struct Reply: Decodable { let name: String }
        return (try? JSONDecoder().decode(Reply.self, from: data).name) ?? preferredName
    }

    func delete(name: String) async throws {
        let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
        let (_, response) = try await URLSession.shared.data(for: request("api/media/\(encoded)", method: "DELETE"))
        try check(response)
    }

    /// AVPlayer and AsyncImage cannot send an Authorization header, so streaming
    /// carries the token as a query parameter — the server accepts both forms.
    func streamURL(name: String) -> URL {
        let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
        var components = URLComponents(url: base.appendingPathComponent("api/media/\(encoded)"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "token", value: token)]
        return components.url!
    }
}
