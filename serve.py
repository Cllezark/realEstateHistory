#!/usr/bin/env python3
"""HTTP server for the frontend dist directory with gzip compression."""
import gzip
import http.server
import io
import os
import socketserver

os.chdir('frontend/dist')
port = int(os.environ.get('PORT', 8000))

COMPRESSIBLE = {
    'application/json', 'application/javascript', 'text/html',
    'text/css', 'text/plain', 'image/svg+xml',
}


class GzipHandler(http.server.SimpleHTTPRequestHandler):
    def send_response_with_gzip(self, path):
        try:
            with open(path, 'rb') as f:
                data = f.read()
        except OSError:
            self.send_error(404)
            return

        ctype = self.guess_type(path)
        base_ctype = ctype.split(';')[0].strip()
        accept = self.headers.get('Accept-Encoding', '')

        if 'gzip' in accept and base_ctype in COMPRESSIBLE:
            buf = io.BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='wb') as gz:
                gz.write(data)
            body = buf.getvalue()
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Vary', 'Accept-Encoding')
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    def do_GET(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            super().do_GET()
            return
        if os.path.isfile(path):
            self.send_response_with_gzip(path)
        else:
            self.send_error(404)

    def log_message(self, fmt, *args):
        pass  # suppress per-request noise


httpd = socketserver.TCPServer(('', port), GzipHandler)
print(f'Serving at http://localhost:{port}/')
httpd.serve_forever()
