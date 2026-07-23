import Foundation

struct DownloadRecord: Codable, Identifiable, Equatable {
    let id: UUID
    let assetId: String
    let filename: String
    let site: String
    let sourceURL: String
    let savedAt: Date
    let isVideo: Bool
}

/// What the app itself downloaded. The gallery is driven by these records but
/// renders through PhotoKit, so an item hidden or deleted in Photos disappears
/// from the gallery too — the record only says "this was downloaded once".
@MainActor
final class DownloadRecordStore: ObservableObject {
    static let shared = DownloadRecordStore()

    @Published private(set) var records: [DownloadRecord] = []

    private var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("download-records.json")
    }

    init() {
        load()
    }

    func add(assetId: String, filename: String, site: String, sourceURL: String, isVideo: Bool) {
        let record = DownloadRecord(
            id: UUID(), assetId: assetId, filename: filename, site: site,
            sourceURL: sourceURL, savedAt: Date(), isVideo: isVideo
        )
        records.insert(record, at: 0)
        save()
    }

    func remove(_ record: DownloadRecord) {
        records.removeAll { $0.id == record.id }
        save()
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let parsed = try? JSONDecoder().decode([DownloadRecord].self, from: data) else { return }
        records = parsed
    }

    private func save() {
        let dir = fileURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(records) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }
}
