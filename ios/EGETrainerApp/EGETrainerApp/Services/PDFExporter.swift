import Foundation
import SwiftUI
#if os(iOS)
import WebKit
import UIKit

/// PDF-экспорт листа задач — iOS-эквивалент печати сайта (print_btn.js):
/// заголовок, нумерованные условия с формулами (MathJax) и рисунками,
/// опционально ответы. Рендер: HTML -> WKWebView -> UIPrintPageRenderer (A4).
@MainActor
final class PDFExporter: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    private var webView: WKWebView?
    private var continuation: CheckedContinuation<Void, Error>?

    /// Генерирует PDF и возвращает URL временного файла.
    func makePDF(title: String?, questions: [RunQuestion], withAnswers: Bool) async throws -> URL {
        let html = Self.html(title: title, questions: questions, withAnswers: withAnswers)

        let controller = WKUserContentController()
        controller.add(self, name: "ready")
        let config = WKWebViewConfiguration()
        config.userContentController = controller
        // A4: 595x842pt
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 595, height: 842), configuration: config)
        webView.navigationDelegate = self
        self.webView = webView

        // mathjax из той же рабочей директории, что MathTextView
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("MathTextView", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let mj = dir.appendingPathComponent("mathjax-tex-svg.js")
        if !FileManager.default.fileExists(atPath: mj.path),
           let src = Bundle.main.url(forResource: "mathjax-tex-svg", withExtension: "js") {
            try? FileManager.default.copyItem(at: src, to: mj)
        }
        let fileURL = dir.appendingPathComponent("print-\(abs(html.hashValue)).html")
        try html.write(to: fileURL, atomically: true, encoding: .utf8)
        webView.loadFileURL(fileURL, allowingReadAccessTo: dir)

        // ждём typeset + загрузку картинок (сообщение «ready»), максимум 20 с
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            continuation = cont
            DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
                self?.continuation?.resume(returning: ())
                self?.continuation = nil
            }
        }

        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(webView.viewPrintFormatter(), startingAtPageAt: 0)
        let page = CGRect(x: 0, y: 0, width: 595.2, height: 841.8) // A4 в pt
        let printable = page.insetBy(dx: 36, dy: 36)
        renderer.setValue(page, forKey: "paperRect")
        renderer.setValue(printable, forKey: "printableRect")

        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, page, nil)
        for i in 0..<max(1, renderer.numberOfPages) {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: i, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()

        self.webView = nil

        let name = (title?.isEmpty == false ? title! : "Задачи")
            .replacingOccurrences(of: "/", with: "-")
        let out = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(name).pdf")
        try (data as Data).write(to: out)
        return out
    }

    nonisolated func userContentController(_ controller: WKUserContentController,
                                           didReceive message: WKScriptMessage) {
        guard message.name == "ready" else { return }
        Task { @MainActor in
            continuation?.resume(returning: ())
            continuation = nil
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                             withError error: Error) {
        Task { @MainActor in
            continuation?.resume(throwing: error)
            continuation = nil
        }
    }

    // MARK: - HTML листа (как print-вёрстка сайта: контент без интерактива)

    private static func html(title: String?, questions: [RunQuestion], withAnswers: Bool) -> String {
        func esc(_ s: String) -> String {
            var r = s
            for (raw, ent) in [("&", "&amp;"), ("<", "&lt;"), (">", "&gt;")] {
                r = r.replacingOccurrences(of: raw, with: ent)
            }
            return r
        }
        var body = ""
        if let title, !title.isEmpty {
            body += "<h1>\(esc(title))</h1>"
        }
        for (idx, q) in questions.enumerated() {
            body += "<div class=\"task\"><div class=\"num\">\(idx + 1)</div><div class=\"stem\">\(esc(q.stem))"
            if let fig = q.figure?.img, !fig.isEmpty {
                let src = fig.hasPrefix("http")
                    ? fig
                    : SupabaseConfig.contentBaseURL.appendingPathComponent(fig).absoluteString
                body += "<div class=\"fig\"><img src=\"\(src)\"></div>"
            }
            if withAnswers {
                let answer = Fmt.answer(text: q.spec.text, value: q.spec.value)
                body += "<div class=\"ans\">Ответ: \(esc(answer))</div>"
            }
            body += "</div></div>"
        }
        return """
        <!doctype html><html><head>
        <meta charset="utf-8">
        <style>
          body{font-family:-apple-system,system-ui;font-size:13px;color:#111;margin:0;}
          h1{font-size:18px;margin:0 0 14px;}
          .task{display:flex;gap:10px;margin-bottom:14px;page-break-inside:avoid;}
          .num{font-weight:700;min-width:22px;}
          .fig img{max-width:300px;max-height:200px;display:block;margin-top:6px;}
          .ans{margin-top:6px;font-weight:600;color:#047857;}
          mjx-container svg{vertical-align:middle;}
        </style>
        <script>
          window.MathJax = {
            tex: { inlineMath: [['\\\\(','\\\\)'], ['$', '$']] },
            svg: { fontCache: 'local' },
            startup: {
              pageReady: function () {
                return MathJax.startup.defaultPageReady().then(function () {
                  if (document.readyState === 'complete') {
                    window.webkit.messageHandlers.ready.postMessage(1);
                  } else {
                    window.addEventListener('load', function(){
                      window.webkit.messageHandlers.ready.postMessage(1);
                    });
                  }
                });
              }
            }
          };
        </script>
        <script src="mathjax-tex-svg.js" async></script>
        </head><body>\(body)</body></html>
        """
    }
}

/// Кнопка «PDF» с диалогом параметров (заголовок, с ответами) и share sheet —
/// паритет диалога печати print_btn.js.
struct PDFExportButton: View {
    let questions: [RunQuestion]
    var defaultTitle: String = ""
    var answersDefault = false

    @State private var showOptions = false
    @State private var title = ""
    @State private var withAnswers = false
    @State private var isGenerating = false
    @State private var fileURL: URL?
    @State private var exportError: String?

    var body: some View {
        Button {
            title = defaultTitle
            withAnswers = answersDefault
            showOptions = true
        } label: {
            Image(systemName: "square.and.arrow.down.on.square")
        }
        .disabled(questions.isEmpty)
        .sheet(isPresented: $showOptions) {
            NavigationStack {
                Form {
                    Section("Параметры PDF") {
                        TextField("Заголовок (необязательно)", text: $title)
                        Toggle("С ответами", isOn: $withAnswers)
                    }
                    if let exportError {
                        Text(exportError).foregroundStyle(Theme.danger)
                    }
                    Section {
                        if let fileURL {
                            ShareLink(item: fileURL) {
                                Label("Поделиться PDF", systemImage: "square.and.arrow.up")
                            }
                        } else {
                            Button {
                                Task { await generate() }
                            } label: {
                                if isGenerating {
                                    HStack { ProgressView(); Text("Готовим PDF...") }
                                } else {
                                    Text("Создать PDF")
                                }
                            }
                            .disabled(isGenerating)
                        }
                    }
                }
                .navigationTitle("Экспорт в PDF")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Закрыть") {
                            showOptions = false
                            fileURL = nil
                        }
                    }
                }
            }
            .presentationDetents([.medium])
        }
    }

    private func generate() async {
        isGenerating = true
        exportError = nil
        defer { isGenerating = false }
        do {
            fileURL = try await PDFExporter().makePDF(
                title: title, questions: questions, withAnswers: withAnswers
            )
        } catch {
            exportError = "Не удалось создать PDF: \(error.localizedDescription)"
        }
    }
}
#endif
