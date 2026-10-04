#!/usr/bin/env python3
"""End-to-end test against a running playground (the same flow as the "Run failover test" button).

    python3 demo/tests/e2e.py [http://localhost:8000]

Writes keys, kills the leader, writes more, kills every node, restarts them, and checks that every key
is still there. Uses only the standard library so CI needs no setup.
"""
import json
import sys
import time
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")


def call(path, body=None, retries=8):
    for _ in range(retries):
        req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:  # per-IP rate limit; wait and retry
                time.sleep(0.8)
                continue
            return {"ok": False, "err": "HTTP %d" % e.code}
    return {"ok": False, "err": "rate limited"}


def state():
    return call("/api/state")


def wait_for(pred, what, timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = state()
        if pred(s):
            return s, time.time() - t0
        time.sleep(0.1)
    raise SystemExit("FAIL: timed out waiting for " + what)


def step(msg):
    print("==> " + msg, flush=True)


def check(cond, msg):
    if not cond:
        raise SystemExit("FAIL: " + msg)
    print("    ok: " + msg, flush=True)


healthy = lambda s: s.get("leader", -1) >= 0 and s.get("reachable") == s.get("size")

step("start from a healthy cluster")
s = state()
for n in s["nodes"]:
    if n["proc"] == "paused":
        call("/api/chaos", {"action": "resume", "node": n["id"]})
if not healthy(s):
    call("/api/chaos", {"action": "start_all"})
s, _ = wait_for(healthy, "a healthy cluster")
check(True, "%d nodes up, node %d leads term %d" % (s["reachable"], s["leader"], s["term"]))

tag = "e2e-%d" % int(time.time())
keys = {}


def put(i):
    k, v = "%s-%d" % (tag, i), "value-%d" % i
    r = call("/api/kv", {"op": "put", "key": k, "value": v})
    check(r.get("ok"), "put %s" % k) if i in (1, 10) else None
    if not r.get("ok"):
        raise SystemExit("FAIL: put %s -> %s" % (k, r))
    keys[k] = v


def read_all(label):
    bad = []
    for k, v in keys.items():
        r = call("/api/kv?key=" + k)
        if not (r.get("ok") and r.get("value") == v):
            bad.append((k, r))
    check(not bad, "%s: %d of %d keys correct%s" % (label, len(keys) - len(bad), len(keys), (" bad=%s" % bad[:3]) if bad else ""))


step("write 10 keys")
for i in range(1, 11):
    put(i)

step("append is a real append")
call("/api/kv", {"op": "put", "key": tag + "-ap", "value": "ab"})
call("/api/kv", {"op": "append", "key": tag + "-ap", "value": "cd"})
r = call("/api/kv?key=" + tag + "-ap")
check(r.get("value") == "abcd", "put ab + append cd reads back %r" % r.get("value"))

step("kill the leader")
old = state()["leader"]
t0 = time.time()
call("/api/chaos", {"action": "kill_leader"})
s, _ = wait_for(lambda s: s["leader"] >= 0 and s["leader"] != old, "a new leader")
check(True, "node %d replaced node %d in %d ms (term %d)" % (s["leader"], old, (time.time() - t0) * 1000, s["term"]))

step("write 5 more keys with one node down")
for i in range(11, 16):
    put(i)
read_all("after leader failure")

step("kill every node")
call("/api/chaos", {"action": "kill_all"})
wait_for(lambda s: s["reachable"] == 0, "all nodes to stop")
check(True, "0 nodes running")

step("restart every node")
t0 = time.time()
call("/api/chaos", {"action": "start_all"})
s, _ = wait_for(healthy, "the cluster to come back")
check(True, "back after %d ms, node %d leads term %d" % ((time.time() - t0) * 1000, s["leader"], s["term"]))
read_all("after full restart")

step("a paused (stale) leader steps down when it resumes")
old = state()["leader"]
call("/api/chaos", {"action": "pause", "node": old})
s, _ = wait_for(lambda s: s["leader"] >= 0 and s["leader"] != old, "a new leader while the old one is frozen")
call("/api/chaos", {"action": "resume", "node": old})
s, _ = wait_for(lambda s: s["leader"] != old and s["nodes"][old]["status"] and s["nodes"][old]["status"]["role"] == "follower",
                "the old leader to step down")
check(True, "node %d stepped down; node %d leads term %d" % (old, s["leader"], s["term"]))
read_all("after pause/resume")

print("PASS", flush=True)
