import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Transcodes downloaded images so Photos gets a friendly format. Scrolller (and
/// a few others) serve WebP; the user wants plain JPG on disk, and Photos is
/// happier with it. Uses ImageIO so it never touches UIKit or the main thread.
enum ImageConverter {
    /// Re-encodes a WebP file as JPEG next to it, returning the new URL, or nil
    /// when the source is not decodable (leave the original untouched then).
    static func webpToJPEG(_ fileURL: URL, quality: CGFloat = 0.95) -> URL? {
        guard
            let source = CGImageSourceCreateWithURL(fileURL as CFURL, nil),
            let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else { return nil }

        let outURL = fileURL.deletingLastPathComponent()
            .appendingPathComponent("rg-\(UUID().uuidString).jpg")
        guard let destination = CGImageDestinationCreateWithURL(
            outURL as CFURL, UTType.jpeg.identifier as CFString, 1, nil
        ) else { return nil }

        CGImageDestinationAddImage(
            destination, image,
            [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary
        )
        guard CGImageDestinationFinalize(destination) else {
            try? FileManager.default.removeItem(at: outURL)
            return nil
        }
        return outURL
    }

    /// True when the fetched bytes are WebP, by MIME first then file extension.
    static func isWebP(mime: String, fileURL: URL) -> Bool {
        if mime.lowercased() == "image/webp" { return true }
        return fileURL.pathExtension.lowercased() == "webp"
    }
}
