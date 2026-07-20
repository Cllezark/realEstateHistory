#!/usr/bin/env python3
"""Simple HTTP server for the frontend dist directory."""
import http.server
import socketserver
import os
import sys

os.chdir('frontend/dist')
port = int(os.environ.get('PORT', 8000))

handler = http.server.SimpleHTTPRequestHandler
httpd = socketserver.TCPServer(('', port), handler)
print("Serving at http://localhost:" + str(port) + "/")
httpd.serve_forever()
