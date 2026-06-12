import SwiftUI
#if os(iOS)
import WebKit
#endif

/// Встроенный плеер видео-решения (Rutube embed) — паритет с iframe-встройкой
/// сайта (app/video_solutions.js: toRutubeEmbedUrl).
struct RutubePlayerSheet: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                #if os(iOS)
                VideoWebView(url: Self.embedURL(from: url))
                #else
                Link("Открыть видео", destination: url)
                #endif
            }
            .background(Color.black)
            .navigationTitle("Видео-решение")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Закрыть") { dismiss() }
                }
            }
        }
    }

    /// Порт toRutubeEmbedUrl: rutube.ru/video/<id> | /video/embed/<id> |
    /// /play/embed/<id> -> https://rutube.ru/play/embed/<id>; иначе исходный URL.
    static func embedURL(from url: URL) -> URL {
        guard let host = url.host, host.lowercased().contains("rutube") else { return url }
        let parts = url.pathComponents.filter { $0 != "/" && !$0.isEmpty }
        var id: String?
        if let i = parts.firstIndex(of: "play"), i + 2 < parts.count + 1,
           parts.indices.contains(i + 1), parts[i + 1] == "embed",
           parts.indices.contains(i + 2) {
            id = parts[i + 2]
        } else if let i = parts.firstIndex(of: "video") {
            if parts.indices.contains(i + 1), parts[i + 1] == "embed",
               parts.indices.contains(i + 2) {
                id = parts[i + 2]
            } else if parts.indices.contains(i + 1) {
                id = parts[i + 1]
            }
        }
        guard let id, !id.isEmpty,
              let escaped = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let embed = URL(string: "https://rutube.ru/play/embed/\(escaped)")
        else { return url }
        return embed
    }
}

#if os(iOS)
private struct VideoWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let view = WKWebView(frame: .zero, configuration: config)
        view.backgroundColor = .black
        view.isOpaque = true
        view.scrollView.isScrollEnabled = false
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        if view.url != url {
            view.load(URLRequest(url: url))
        }
    }
}
#endif

/// Кнопка «Видео-решение», открывающая встроенный плеер шитом.
struct VideoSolutionButton: View {
    let url: URL
    @State private var showPlayer = false

    var body: some View {
        Button {
            showPlayer = true
        } label: {
            Label("Видео-решение", systemImage: "play.rectangle.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(Theme.accent)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showPlayer) {
            RutubePlayerSheet(url: url)
        }
    }
}
