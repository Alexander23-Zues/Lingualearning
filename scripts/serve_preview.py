"""Serve a built LinguaKids browser app on this computer only."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import json


class PreviewHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/__preview_health":
            body = json.dumps({"app": self.server.app_name}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.server.app_name == 'linguakids-connected-entry' and self.path.split('?',1)[0] != '/flutter_service_worker.js':
            self.send_response(307)
            # A redirect with no fragment inherits the browser's current hash
            # route while preserving any email callback query in this path.
            self.send_header('Location', 'http://localhost:3000' + self.path)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=3000)
    parser.add_argument('--directory', default=str(root / '.preview/react-live'))
    parser.add_argument('--app-name', default='linguakids-react')
    args = parser.parse_args()
    output = Path(args.directory).resolve()
    if not (output / "index.html").is_file():
        raise SystemExit("Preview build is missing. Run scripts/open_preview.ps1 to build it.")
    handler = partial(PreviewHandler, directory=str(output))
    print(f"LinguaKids: http://127.0.0.1:{args.port}", flush=True)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    server.app_name = args.app_name
    server.serve_forever()
