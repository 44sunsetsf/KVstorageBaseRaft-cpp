"""Runs the Raft nodes as child processes, injects failures, and turns their Status RPCs into a live view."""
import collections
import os
import shutil
import signal
import subprocess
import threading
import time

import kvServerRPC_pb2 as kv
from raftrpc import NodeConn, RpcError

ROLES = ["follower", "candidate", "leader"]


class NodeProc:
    def __init__(self, idx, port):
        self.idx, self.port = idx, port
        self.proc = None
        self.paused = False
        self.started_at = 0.0
        self.crashed = False
        self.killed = False  # stopped on purpose (as opposed to crashing)


class Cluster:
    def __init__(self, node_bin, data_dir, size=5, base_port=7001, max_raft_state=8000, host="127.0.0.1"):
        self.node_bin, self.data_dir, self.size = node_bin, data_dir, size
        self.max_raft_state = max_raft_state
        self.host = host
        self.addrs = [(host, base_port + i) for i in range(size)]
        self.nodes = [NodeProc(i, base_port + i) for i in range(size)]
        self._lock = threading.RLock()
        self._events = collections.deque(maxlen=300)
        self._event_id = 0
        self._status = [None] * size            # last Status reply per node (dict) or None
        self._poll_conns = [NodeConn(h, p, timeout=0.3) for h, p in self.addrs]
        self._prev = {}                         # previous observed (role, term, snapshot) per node
        self._leader = -1
        self._leader_term = 0
        self._leader_lost_at = None
        self._all_down_since = None
        self._stop = threading.Event()
        self._poller = threading.Thread(target=self._poll_loop, daemon=True)

    # ------------------------------------------------------------------ lifecycle
    def start(self):
        self.start_all(quiet=True)
        self._poller.start()

    def stop(self):
        self._stop.set()
        self.kill_all(quiet=True)

    def _event(self, kind, node=None, **params):
        with self._lock:
            self._event_id += 1
            self._events.append({"id": self._event_id, "ts": time.time(), "kind": kind, "node": node, "params": params})

    # ------------------------------------------------------------------ process control
    def _spawn(self, n):
        d = os.path.join(self.data_dir, str(n.idx))
        os.makedirs(d, exist_ok=True)
        cluster = ",".join("%s:%d" % a for a in self.addrs)
        env = dict(os.environ, RAFT_DEBUG="0")
        log = open(os.path.join(d, "node.log"), "wb")
        n.proc = subprocess.Popen([self.node_bin, "-i", str(n.idx), "-c", cluster, "-m", str(self.max_raft_state), "-d", d],
                                  stdout=log, stderr=subprocess.STDOUT, env=env)
        log.close()
        n.paused, n.crashed, n.killed, n.started_at = False, False, False, time.time()

    def _alive(self, n):
        return n.proc is not None and n.proc.poll() is None

    def start_node(self, i, quiet=False):
        with self._lock:
            n = self.nodes[i]
            if self._alive(n):
                return False
            self._spawn(n)
            if not quiet:
                self._event("node_started", i)
            return True

    def kill_node(self, i, quiet=False):
        with self._lock:
            n = self.nodes[i]
            if not self._alive(n):
                return False
            n.killed = True
            n.proc.kill()
            n.proc.wait()
            n.paused = False
            self._status[i] = None
            if not quiet:
                self._event("node_killed", i)
            return True

    def pause_node(self, i):
        with self._lock:
            n = self.nodes[i]
            if not self._alive(n) or n.paused:
                return False
            os.kill(n.proc.pid, signal.SIGSTOP)
            n.paused = True
            self._event("node_paused", i)
            return True

    def resume_node(self, i):
        with self._lock:
            n = self.nodes[i]
            if not self._alive(n) or not n.paused:
                return False
            os.kill(n.proc.pid, signal.SIGCONT)
            n.paused = False
            self._event("node_resumed", i)
            return True

    def start_all(self, quiet=False):
        for i in range(self.size):
            self.start_node(i, quiet=quiet)
        if not quiet:
            self._event("cluster_started")

    def kill_all(self, quiet=False):
        for i in range(self.size):
            self.kill_node(i, quiet=True)
        if not quiet:
            self._event("cluster_killed")

    def restart_all(self):
        self.kill_all(quiet=True)
        self._event("cluster_killed")
        time.sleep(0.3)
        self.start_all(quiet=True)
        self._event("cluster_restarted")

    def reset(self):
        self.kill_all(quiet=True)
        shutil.rmtree(self.data_dir, ignore_errors=True)
        os.makedirs(self.data_dir, exist_ok=True)
        self.start_all(quiet=True)
        self._event("cluster_reset")

    def kill_leader(self):
        with self._lock:
            leader = self._leader
        if leader < 0:
            return -1
        self.kill_node(leader)
        return leader

    def act(self, action, node=None):
        """Dispatch a chaos action coming from the HTTP API. Returns a dict describing what happened."""
        if action in ("kill", "start", "pause", "resume"):
            if node is None or not (0 <= node < self.size):
                return {"ok": False, "err": "bad node"}
            fn = {"kill": self.kill_node, "start": self.start_node, "pause": self.pause_node,
                  "resume": self.resume_node}[action]
            return {"ok": bool(fn(node)), "node": node}
        if action == "kill_leader":
            l = self.kill_leader()
            return {"ok": l >= 0, "node": l}
        if action == "kill_all":
            self.kill_all()
        elif action == "start_all":
            self.start_all()
        elif action == "restart_all":
            self.restart_all()
        elif action == "reset":
            self.reset()
        else:
            return {"ok": False, "err": "unknown action"}
        return {"ok": True}

    # ------------------------------------------------------------------ observation
    def _poll_once(self):
        now = time.time()
        for i, n in enumerate(self.nodes):
            if n.proc is not None and n.proc.poll() is not None and not n.crashed and not n.killed:
                n.crashed = True
                self._status[i] = None
                self._event("node_crashed", i, code=n.proc.returncode)
            if not self._alive(n) or n.paused:
                self._status[i] = None
                continue
            try:
                r = self._poll_conns[i].call("Status", kv.StatusArgs(), kv.StatusReply())
            except RpcError:
                self._status[i] = None
                continue
            self._status[i] = {
                "role": ROLES[r.Role] if 0 <= r.Role < 3 else "follower", "term": r.Term, "votedFor": r.VotedFor,
                "commitIndex": r.CommitIndex, "lastApplied": r.LastApplied, "lastLogIndex": r.LastLogIndex,
                "snapshotIndex": r.SnapshotIndex, "kvCount": r.KvCount, "raftStateBytes": r.RaftStateBytes,
                "tail": [{"i": e.Index, "t": e.Term, "s": e.Summary.decode(errors="replace")} for e in r.Tail],
            }
        self._derive(now)

    def _derive(self, now):
        with self._lock:
            max_term = max([s["term"] for s in self._status if s] or [0])
            leaders = [(s["term"], i) for i, s in enumerate(self._status) if s and s["role"] == "leader"]
            leader = max(leaders)[1] if leaders else -1
            leader_term = max(leaders)[0] if leaders else 0
            # a leader is only believed if it is not behind the highest term anyone has seen
            if leader >= 0 and leader_term < max_term:
                leader = -1
            for i, s in enumerate(self._status):
                prev = self._prev.get(i)
                if s is None:
                    continue
                if prev:
                    if s["role"] == "candidate" and prev["role"] != "candidate":
                        self._event("election_started", i, term=s["term"])
                    if prev["role"] == "leader" and s["role"] != "leader":
                        self._event("stepped_down", i, term=s["term"])
                    if s["snapshotIndex"] > prev["snapshotIndex"]:
                        self._event("snapshot", i, index=s["snapshotIndex"])
                self._prev[i] = {"role": s["role"], "term": s["term"], "snapshotIndex": s["snapshotIndex"]}
            if leader != self._leader or (leader >= 0 and leader_term != self._leader_term):
                if leader >= 0:
                    elapsed = None
                    if self._leader_lost_at is not None:
                        elapsed = int((now - self._leader_lost_at) * 1000)
                    self._event("leader_elected", leader, term=leader_term, elapsedMs=elapsed)
                    self._leader_lost_at = None
                else:
                    if self._leader >= 0 and self._leader_lost_at is None:
                        self._leader_lost_at = now
                        self._event("leader_lost", self._leader)
                self._leader, self._leader_term = leader, leader_term
            # an already-running cluster that never had a leader still needs a timestamp
            if leader < 0 and self._leader_lost_at is None:
                self._leader_lost_at = now
            # unattended public demo: bring everything back if it has been fully down for a while
            up = sum(1 for n in self.nodes if self._alive(n))
            if up == 0:
                self._all_down_since = self._all_down_since or now
                if now - self._all_down_since > 90:
                    self._all_down_since = None
                    threading.Thread(target=self.restart_all, daemon=True).start()
            else:
                self._all_down_since = None

    def _poll_loop(self):
        while not self._stop.is_set():
            t0 = time.time()
            try:
                self._poll_once()
            except Exception as e:  # keep observing no matter what
                print("poll error:", e, flush=True)
            time.sleep(max(0.0, 0.1 - (time.time() - t0)))

    def snapshot(self, since=0):
        with self._lock:
            nodes = []
            for i, n in enumerate(self.nodes):
                s = self._status[i]
                if not self._alive(n):
                    proc = "crashed" if n.crashed else "stopped"
                elif n.paused:
                    proc = "paused"
                else:
                    proc = "running"
                stale = bool(s and s["role"] == "leader" and i != self._leader)
                nodes.append({"id": i, "port": n.port, "proc": proc, "reachable": s is not None,
                              "stale": stale, "uptimeMs": int((time.time() - n.started_at) * 1000) if proc == "running" else 0,
                              "status": s})
            reachable = sum(1 for x in nodes if x["reachable"])
            return {
                "size": self.size, "quorum": self.size // 2 + 1, "reachable": reachable,
                "leader": self._leader, "term": self._leader_term,
                "nodes": nodes,
                "events": [e for e in self._events if e["id"] > since],
                "lastEvent": self._event_id,
                "serverTime": time.time(),
            }

    def kv_count(self):
        with self._lock:
            if self._leader >= 0 and self._status[self._leader]:
                return self._status[self._leader]["kvCount"]
        return 0
