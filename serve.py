#!/usr/bin/env python3
"""개발 서버: site/ 를 캐시 없이 서빙한다. python3 serve.py [포트] (기본 5533)"""
import functools, http.server, sys
from pathlib import Path

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5533
handler = functools.partial(NoCache, directory=str(Path(__file__).parent / "site"))
http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
