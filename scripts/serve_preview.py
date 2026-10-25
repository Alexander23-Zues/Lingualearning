"""Serve the built Flutter preview on this computer only."""
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
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--directory', default=str(root / 'apps' / 'linguakids_app' / 'build' / 'web_preview'))
    parser.add_argument('--app-name', default='linguakids-preview')
    args = parser.parse_args()
    output = Path(args.directory).resolve()
    if not (output / "index.html").is_file():
        raise SystemExit("Preview build is missing. Run scripts/open_preview.ps1 to build it.")
    handler = partial(PreviewHandler, directory=str(output))
    print(f"LinguaKids: http://127.0.0.1:{args.port}", flush=True)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    server.app_name = args.app_name
    server.serve_forever()
