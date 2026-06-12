import SwiftUI
import WebKit

/// Картинка задачи. Контент сайта в основном SVG (AsyncImage их не декодирует),
/// поэтому SVG рендерим во встроенном WKWebView, растровые — через AsyncImage.
struct FigureView: View {
    let figure: Figure?
    var maxHeight: CGFloat = 280

    private var url: URL? {
        ContentService.shared.figureURL(figure)
    }

    var body: some View {
        if let url {
            if url.pathExtension.lowercased() == "svg" {
                SVGWebView(url: url)
                    .frame(height: maxHeight)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel(figure?.alt ?? "Рисунок к задаче")
            } else {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFit()
                    case .failure:
                        Image(systemName: "photo")
                            .foregroundStyle(Theme.textDim)
                    default:
                        ProgressView()
                    }
                }
                .frame(maxHeight: maxHeight)
                .frame(maxWidth: .infinity)
            }
        }
    }
}

#if os(iOS)
/// Лёгкий WKWebView только для отображения SVG по центру, без интеракции.
struct SVGWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.isScrollEnabled = false
        view.scrollView.backgroundColor = .clear
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        let html = """
        <!doctype html><html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          html,body{margin:0;padding:0;background:transparent;height:100%;}
          body{display:flex;align-items:center;justify-content:center;}
          img{max-width:100%;max-height:100vh;}
        </style></head>
        <body><img src="\(url.absoluteString)" alt=""></body></html>
        """
        view.loadHTMLString(html, baseURL: url.deletingLastPathComponent())
    }
}
#else
/// macOS-заглушка для dev-harness (в приложении не используется).
struct SVGWebView: View {
    let url: URL
    var body: some View {
        Image(systemName: "photo")
            .foregroundStyle(Theme.textDim)
    }
}
#endif
