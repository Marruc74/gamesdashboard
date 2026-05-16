#!/usr/bin/env python3
"""Local dev server for the games dashboard.

Serves static files and synthesizes /games/manifest.json on every request by
scanning the games/ directory. Drop a folder in games/ and reload — it appears.
"""
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
GAMES_DIR = os.path.join(ROOT, 'games')


def list_games():
    if not os.path.isdir(GAMES_DIR):
        return []
    return sorted(
        name for name in os.listdir(GAMES_DIR)
        if os.path.isdir(os.path.join(GAMES_DIR, name))
        and os.path.isfile(os.path.join(GAMES_DIR, name, 'game.json'))
    )


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?', 1)[0].rstrip('/') == '/games/manifest.json':
            body = json.dumps(list_games()).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--generate':
        out = os.path.join(GAMES_DIR, 'manifest.json')
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(list_games(), f)
            f.write('\n')
        print(f'Wrote {out}')
        sys.exit(0)

    port = int(os.environ.get('PORT', '8000'))
    os.chdir(ROOT)
    with ThreadingHTTPServer(('127.0.0.1', port), Handler) as httpd:
        print(f'Serving http://127.0.0.1:{port}  (Ctrl+C to stop)')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
