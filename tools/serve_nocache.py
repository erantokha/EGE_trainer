#!/usr/bin/env python3
"""
Локальный статический сервер с Cache-Control: no-store.

Зачем: проект без сборки деплоится на GitHub Pages, и в каждую страницу зашит
inline cache-check — он сравнивает meta[app-build] с /version.json и при
расхождении делает location.reload() (механизм доставки обновлений ученикам).

При локальной разработке `python3 -m http.server` НЕ шлёт Cache-Control, поэтому
браузер эвристически кэширует HTML. После `bump_build` закэшированная страница
становится «старой» → cache-check видит новый version.json → перезагружает
страницу → визуальное «мигание»/перерисовка. Этот сервер отдаёт всё с
no-store, поэтому браузер ничего не кэширует: meta всегда совпадает с
version.json, cache-check не срабатывает, мигания нет. Прод-механизм не трогаем.

Запуск:  python3 tools/serve_nocache.py [port=8000]
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass  # тише в фоне


class Server(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == '__main__':
    with Server(('', PORT), NoCacheHandler) as httpd:
        print(f'no-cache dev server → http://localhost:{PORT}  (Cache-Control: no-store)')
        httpd.serve_forever()
