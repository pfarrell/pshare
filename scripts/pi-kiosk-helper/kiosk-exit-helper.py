#!/usr/bin/env python3
"""Localhost-only helper that lets Jukebox Mode's Settings tab exit the kiosk.

POST /exit-kiosk kills Chromium and starts the regular Pi desktop (wallpaper +
taskbar), which the user's labwc autostart deliberately doesn't launch.
Started from ~/.config/labwc/autostart so it inherits the Wayland session env.
"""
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8737
ALLOWED_ORIGINS = {'http://172.16.1.10', 'https://patf.com', 'http://localhost:5173'}


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')

    def _reply(self, code):
        self.send_response(code)
        self._cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_OPTIONS(self):
        self._reply(204)

    def do_POST(self):
        if self.path != '/exit-kiosk' or self.headers.get('Origin') not in ALLOWED_ORIGINS:
            self._reply(403)
            return
        self._reply(204)
        self.wfile.flush()
        # -x: exact process name, so this helper (python3) is never matched.
        subprocess.run(['pkill', '-x', 'chromium'])
        subprocess.Popen(['/usr/bin/lwrespawn', '/usr/bin/pcmanfm-pi'], start_new_session=True)
        subprocess.Popen(['/usr/bin/lwrespawn', '/usr/bin/wf-panel-pi'], start_new_session=True)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    HTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
