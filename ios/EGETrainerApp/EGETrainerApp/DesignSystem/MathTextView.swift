import SwiftUI
#if os(iOS)
import WebKit
#endif

/// Текст условия с TeX-формулами — паритет с task-stem сайта (MathJax 3,
/// разделители `\( \)` и `$ $`, SVG-вывод). Движок — vendored
/// Resources/mathjax-tex-svg.js, офлайн. Текст без TeX — нативный Text.
struct MathTextView: View {
    let text: String
    var fontSize: CGFloat = 17

    static func containsTeX(_ s: String) -> Bool {
        if s.contains("\\(") || s.contains("\\[") { return true }
        if let first = s.firstIndex(of: "$"),
           s[s.index(after: first)...].contains("$") { return true }
        return false
    }

    var body: some View {
        if Self.containsTeX(text) {
            #if os(iOS)
            MathWebView(text: text, fontSize: fontSize)
            #else
            Text(text)
                .font(.system(size: fontSize))
                .foregroundStyle(Theme.text)
                .fixedSize(horizontal: false, vertical: true)
            #endif
        } else {
            Text(text)
                .font(.system(size: fontSize))
                .foregroundStyle(Theme.text)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

#if os(iOS)
private struct MathWebView: View {
    let text: String
    let fontSize: CGFloat
    @State private var height: CGFloat = 30

    var body: some View {
        MathWebViewRepresentable(text: text, fontSize: fontSize, height: $height)
            .frame(height: height)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct MathWebViewRepresentable: UIViewRepresentable {
    let text: String
    let fontSize: CGFloat
    @Binding var height: CGFloat

    /// Рабочая директория рендера: один раз копируем туда mathjax из бандла,
    /// per-card HTML пишем рядом и грузим через loadFileURL (как <script src> на сайте).
    private static let workDir: URL? = {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("MathTextView", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let dst = dir.appendingPathComponent("mathjax-tex-svg.js")
            if !FileManager.default.fileExists(atPath: dst.path),
               let src = Bundle.main.url(forResource: "mathjax-tex-svg", withExtension: "js") {
                try FileManager.default.copyItem(at: src, to: dst)
            }
            return dir
        } catch {
            return nil
        }
    }()

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "size")
        controller.add(context.coordinator, name: "dbg")
        let config = WKWebViewConfiguration()
        config.userContentController = controller
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        view.isOpaque = false
        view.backgroundColor = .clear
        view.underPageBackgroundColor = .clear
        view.scrollView.isScrollEnabled = false
        view.scrollView.backgroundColor = .clear
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        guard context.coordinator.lastText != text else { return }
        context.coordinator.lastText = text
        guard let dir = Self.workDir else { return }
        let name = "stem-v3-\(abs(text.hashValue))-\(Int(fontSize)).html"
        let fileURL = dir.appendingPathComponent(name)
        if !FileManager.default.fileExists(atPath: fileURL.path) {
            try? html(for: text).write(to: fileURL, atomically: true, encoding: .utf8)
        }
        view.loadFileURL(fileURL, allowingReadAccessTo: dir)
    }

    /// Высота меряется по ВНУТРЕННЕМУ контейнеру #c (не по viewport — у того
    /// scrollHeight >= высоты вебвью, что давало «защёлкивание» гигантской
    /// высоты) и пересообщается через ResizeObserver при КАЖДОМ изменении
    /// размеров: LazyVStack может создать ячейку до назначения полной ширины
    /// (аудит 2026-06-12: тот же текст при 20pt — 504px, при 350pt — 120px).
    private func html(for stem: String) -> String {
        var escaped = stem
        for (raw, ent) in [("&", "&amp;"), ("<", "&lt;"), (">", "&gt;")] {
            escaped = escaped.replacingOccurrences(of: raw, with: ent)
        }
        return """
        <!doctype html><html><head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          :root{color-scheme: light dark;}
          html,body{margin:0;padding:0;background:transparent;}
          body{
            font-family: -apple-system, system-ui;
            font-size: \(Int(fontSize))px;
            line-height: 1.45;
            color: #111827;
            overflow-wrap: break-word;
          }
          @media (prefers-color-scheme: dark){ body{color:#e6e6e6;} }
          mjx-container svg{vertical-align:middle;}
        </style>
        <script>
          window.MathJax = {
            tex: { inlineMath: [['\\\\(','\\\\)'], ['$', '$']] },
            svg: { fontCache: 'local' }
          };
          function reportSize(){
            var c = document.getElementById('c');
            if (!c) return;
            var h = Math.ceil(c.getBoundingClientRect().height);
            if (h > 0) window.webkit.messageHandlers.size.postMessage(h);
          }
          window.addEventListener('load', function(){
            reportSize();
            var c = document.getElementById('c');
            if (window.ResizeObserver && c) {
              new ResizeObserver(reportSize).observe(c);
            }
            window.addEventListener('resize', reportSize);
          });
        </script>
        <script src="mathjax-tex-svg.js" async></script>
        </head><body><div id="c">\(escaped)</div></body></html>
        """
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var parent: MathWebViewRepresentable
        var lastText: String?

        init(_ parent: MathWebViewRepresentable) { self.parent = parent }

        func userContentController(_ controller: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            if message.name == "dbg" {
                NSLog("MathTextView dbg: %@", String(describing: message.body))
                return
            }
            guard message.name == "size", let h = message.body as? Double, h > 0 else { return }
            let newHeight = CGFloat(h)
            if abs(newHeight - parent.height) > 1 {
                DispatchQueue.main.async { self.parent.height = newHeight }
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            NSLog("MathTextView didFinish: %@", webView.url?.lastPathComponent ?? "-")
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            NSLog("MathTextView didFailProvisional: %@", error.localizedDescription)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            NSLog("MathTextView didFail: %@", error.localizedDescription)
        }
    }
}
#endif
