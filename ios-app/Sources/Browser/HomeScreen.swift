import SwiftUI

/// The browser tab's landing page: one big tile per supported site.
///
/// The list is `SiteCatalog`, which is generated from the same array that
/// decides where handlers get injected — so adding a site to the build script
/// is the only step needed to make it appear here.
struct HomeScreen: View {
    @EnvironmentObject private var browser: BrowserController
    @ObservedObject private var favicons = FaviconLoader.shared

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 16)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                GlassGroup(spacing: 20) {
                    LazyVGrid(columns: columns, spacing: 16) {
                        ForEach(SiteCatalog.sites) { site in
                            SiteTile(site: site, icon: favicons.icon(for: site))
                                .onTapGesture { browser.openSite(site) }
                                .onAppear { favicons.load(site) }
                        }
                    }
                }
                if !browser.lastVisited.isEmpty {
                    resumeRow
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 28)
        }
        .scrollDismissesKeyboard(.immediately)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("TasuDownloader").font(.system(size: 30, weight: .bold, design: .rounded))
            Text("Bir site seç, indirme butonu ekranda seni bekliyor.")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Coming back to the home screen should not cost the page you were on:
    /// the web view is still alive behind it, so this is a resume, not a reload.
    private var resumeRow: some View {
        Button {
            browser.showingHome = false
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "arrow.uturn.forward")
                    .font(.system(size: 15, weight: .semibold))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Kaldığın yere dön").font(.system(size: 14, weight: .semibold))
                    Text(browser.lastVisited)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 13)
            .frame(maxWidth: .infinity)
            .liquidGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous), interactive: true)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
    }
}

private struct SiteTile: View {
    let site: SupportedSite
    let icon: UIImage?

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 26, style: .continuous) }

    var body: some View {
        VStack(spacing: 12) {
            badge
            Text(site.name)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 22)
        .liquidGlass(in: shape, tint: site.color.opacity(0.55), interactive: true)
        .contentShape(shape)
        .animation(.easeOut(duration: 0.2), value: icon != nil)
    }

    @ViewBuilder private var badge: some View {
        if let icon {
            Image(uiImage: icon)
                .resizable()
                .scaledToFill()
                .frame(width: 62, height: 62)
                .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                .transition(.opacity)
        } else {
            // Generated fallback: the site's own colour plus its initial. Drawn
            // at the same size as a real icon so the grid never reflows when
            // one finally loads.
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .fill(site.color.gradient)
                .frame(width: 62, height: 62)
                .overlay(
                    Text(site.initial)
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                )
        }
    }
}
