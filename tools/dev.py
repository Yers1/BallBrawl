# Local dev server: like `python -m http.server`, but tells the browser never to reuse stale files.
# Usage (from the project folder): python tools/dev.py [port]
import functools, http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
print(f'BallBrawl on http://localhost:{port}')
http.server.ThreadingHTTPServer(('', port), functools.partial(NoCache, directory=root)).serve_forever()
