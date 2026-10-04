"""HTTP gateway for the Raft playground: serves the web UI, a small JSON API, and runs the cluster."""
import json
import mimetypes
import os
import statistics
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from cluster import Cluster
from kvclient import KVClient

WEB_DIR = os.environ.get("WEB_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web"))
NODE_BIN = os.environ.get("RAFT_NODE_BIN", "/usr/local/bin/raftNode")
DATA_DIR = os.environ.get("DATA_DIR", "/data")
SIZE = int(os.environ.get("CLUSTER_SIZE", "5"))
PORT = int(os.environ.get("PORT", "8000"))
MAX_KEYS = int(os.environ.get("MAX_KEYS", "300"))
MAX_KEY_LEN, MAX_VALUE_LEN = 32, 64

cluster = Cluster(NODE_BIN, DATA_DIR, size=SIZE, max_raft_state=int(os.environ.get("MAX_RAFT_STATE", "8000")))
client = KVClient(cluster.addrs, pool_size=8)
_bench_lock = threading.Lock()


class RateLimiter:
    """Sliding window per (bucket, ip); the demo is public, so keep abusive loops cheap to reject."""

    def __init__(self):
        self._hits = {}
        self._lock = threading.Lock()

    def allow(self, bucket, ip, limit, window):
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault((bucket, ip), [])
            while q and now - q[0] > window:
                q.pop(0)
            if len(q) >= limit:
                return False
            q.append(now)
            if len(self._hits) > 5000:  # forget idle clients
                self._hits = {k: v for k, v in self._hits.items() if v and now - v[-1] < window}
            return True


limiter = RateLimiter()


def run_bench(ops, clients):
    """Concurrent Puts over a fixed 50-key space (so the database does not grow), measured through this gateway."""
    ops, clients = max(10, min(ops, 400)), max(1, min(clients, 8))
    per = ops // clients
    lat, errors = [], [0]
    lock = threading.Lock()

    def worker(c):
        mine = []
        for i in range(per):
            r = client.execute("put", "bench-%d" % ((c * per + i) % 50), "x", timeout=3.0)
            if r.ok:
                mine.append(r.latency_ms)
            else:
                with lock:
                    errors[0] += 1
        with lock:
            lat.extend(mine)

    t0 = time.monotonic()
    ts = [threading.Thread(target=worker, args=(c,)) for c in range(clients)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    secs = time.monotonic() - t0
    lat.sort()
    pct = lambda p: lat[min(len(lat) - 1, int(p * len(lat)))] if lat else 0
    return {"ops": len(lat), "errors": errors[0], "clients": clients, "seconds": round(secs, 3),
            "opsPerSec": round(len(lat) / secs, 1) if secs else 0,
            "avgMs": round(statistics.fmean(lat), 2) if lat else 0, "p50Ms": round(pct(0.5), 2),
            "p99Ms": round(pct(0.99), 2)}


class Handler(BaseHTTPRequestHandler):
    server_version = "raft-playground"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # keep container logs small
        pass

    # ---- helpers
    def _ip(self):
        fwd = self.headers.get("X-Forwarded-For")
        return fwd.split(",")[0].strip() if fwd else self.client_address[0]

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 4096:
            return None
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return None

    def _limited(self, bucket, limit, window):
        if limiter.allow(bucket, self._ip(), limit, window):
            return False
        self._json(429, {"ok": False, "err": "rate limited, slow down a little"})
        return True

    # ---- routes
    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/api/state":
            if self._limited("state", 100, 10):
                return
            since = int(parse_qs(u.query).get("since", ["0"])[0] or 0)
            return self._json(200, cluster.snapshot(since))
        if u.path == "/api/healthz":
            snap = cluster.snapshot()
            return self._json(200, {"ok": True, "reachable": snap["reachable"], "leader": snap["leader"]})
        if u.path == "/api/kv":
            if self._limited("kv", 150, 10):
                return
            key = parse_qs(u.query).get("key", [""])[0]
            if not key or len(key) > MAX_KEY_LEN:
                return self._json(400, {"ok": False, "err": "bad key"})
            return self._json(200, client.execute("get", key).to_dict())
        return self._static(u.path)

    def do_POST(self):
        u = urlparse(self.path)
        data = self._body()
        if data is None:
            return self._json(400, {"ok": False, "err": "bad json"})
        if u.path == "/api/kv":
            if self._limited("kv", 150, 10):
                return
            op, key, value = data.get("op", ""), str(data.get("key", "")), str(data.get("value", ""))
            if op not in ("put", "append", "get") or not key or len(key) > MAX_KEY_LEN or len(value) > MAX_VALUE_LEN:
                return self._json(400, {"ok": False, "err": "bad request (key <= %d, value <= %d chars)" % (MAX_KEY_LEN, MAX_VALUE_LEN)})
            if op != "get" and cluster.kv_count() >= MAX_KEYS:
                return self._json(507, {"ok": False, "err": "demo database is full (%d keys); press Reset" % MAX_KEYS})
            return self._json(200, client.execute(op, key, value).to_dict())
        if u.path == "/api/chaos":
            if self._limited("chaos", 12, 10):
                return
            node = data.get("node")
            return self._json(200, cluster.act(str(data.get("action", "")), node if isinstance(node, int) else None))
        if u.path == "/api/bench":
            if self._limited("bench", 2, 30):
                return
            if not _bench_lock.acquire(blocking=False):
                return self._json(409, {"ok": False, "err": "a benchmark is already running"})
            try:
                return self._json(200, dict(run_bench(int(data.get("ops", 200)), int(data.get("clients", 4))), ok=True))
            finally:
                _bench_lock.release()
        return self._json(404, {"ok": False, "err": "not found"})

    def _static(self, path):
        path = "/index.html" if path in ("/", "") else path
        full = os.path.normpath(os.path.join(WEB_DIR, path.lstrip("/")))
        if not full.startswith(os.path.normpath(WEB_DIR)) or not os.path.isfile(full):
            return self._json(404, {"ok": False, "err": "not found"})
        with open(full, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", (mimetypes.guess_type(full)[0] or "application/octet-stream") + ("; charset=utf-8" if full.endswith((".html", ".js", ".css", ".svg")) else ""))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)


def main():
    cluster.start()
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    srv.daemon_threads = True
    print("raft playground on :%d (%d nodes)" % (PORT, SIZE), flush=True)
    try:
        srv.serve_forever()
    finally:
        cluster.stop()


if __name__ == "__main__":
    main()
