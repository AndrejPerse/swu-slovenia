"""Serve the site from this folder, to preview changes before they go live.

Works on this PC and on phones in the same Wi-Fi. Start it with preview.cmd (double-click)
or: python tools/preview.py
"""
import argparse
import http.server
import socket
import webbrowser
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Always send fresh files, so every reload shows the latest edits."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


def lan_address():
    # Connecting a UDP socket sends nothing; it only reveals which local address would be used.
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return None
    finally:
        sock.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0", help="0.0.0.0 = reachable from phones in the same Wi-Fi")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    handler = partial(NoCacheHandler, directory=str(ROOT))
    for port in range(8080, 8100):
        try:
            server = http.server.ThreadingHTTPServer((args.host, port), handler)
            break
        except OSError:
            continue
    else:
        raise SystemExit("No free port between 8080 and 8099.")

    print("SWU League preview is running.\n")
    print(f"  On this PC:                    http://localhost:{port}")
    ip = lan_address()
    if ip and args.host == "0.0.0.0":
        print(f"  On your phone (same Wi-Fi):    http://{ip}:{port}")
    print("\nClose this window to stop the preview.", flush=True)
    if not args.no_browser:
        webbrowser.open(f"http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
