"""Clerk logic (leader discovery + retry) for the gateway.

The servers deduplicate by (ClientId, RequestId) and only remember the *last* request id per client,
so one client id must never have two requests in flight. The gateway therefore keeps a small pool of
sessions and hands each HTTP request an exclusive one.
"""
import queue
import random
import time

import kvServerRPC_pb2 as kv
from raftrpc import NodeConn, RpcError


class Session:
    def __init__(self, nodes):
        self.client_id = "gw-%016x" % random.getrandbits(64)
        self.request_id = 0
        self.leader = 0
        self.conns = [NodeConn(h, p, timeout=1.5) for h, p in nodes]


class KVResult:
    def __init__(self, ok, value="", err="", leader=-1, attempts=0, latency_ms=0.0):
        self.ok, self.value, self.err = ok, value, err
        self.leader, self.attempts, self.latency_ms = leader, attempts, latency_ms

    def to_dict(self):
        return {"ok": self.ok, "value": self.value, "err": self.err, "leader": self.leader,
                "attempts": self.attempts, "latencyMs": round(self.latency_ms, 2)}


class KVClient:
    def __init__(self, nodes, pool_size=8):
        self.nodes = nodes
        self._pool = queue.Queue()
        for _ in range(pool_size):
            self._pool.put(Session(nodes))

    def execute(self, op, key, value="", timeout=4.0):
        """op: 'put' | 'append' | 'get'. Returns KVResult; ok=False means no quorum / no leader within timeout."""
        s = self._pool.get()
        t0 = time.monotonic()
        try:
            s.request_id += 1
            attempts = 0
            idx = s.leader
            n = len(self.nodes)
            tried_since_progress = 0
            while time.monotonic() - t0 < timeout:
                attempts += 1
                try:
                    if op == "get":
                        reply = s.conns[idx].call("Get", kv.GetArgs(Key=key.encode(), ClientId=s.client_id.encode(),
                                                                     RequestId=s.request_id), kv.GetReply())
                    else:
                        reply = s.conns[idx].call("PutAppend", kv.PutAppendArgs(
                            Key=key.encode(), Value=value.encode(), Op=("Put" if op == "put" else "Append").encode(),
                            ClientId=s.client_id.encode(), RequestId=s.request_id), kv.PutAppendReply())
                    err = reply.Err.decode()
                except RpcError:
                    err = "ErrUnreachable"
                if err in ("OK", "ErrNoKey"):
                    s.leader = idx
                    val = reply.Value.decode(errors="replace") if op == "get" and err == "OK" else ""
                    return KVResult(True, val, err, idx, attempts, (time.monotonic() - t0) * 1000)
                idx = (idx + 1) % n
                tried_since_progress += 1
                if tried_since_progress >= n:  # a full lap without a leader: wait for an election instead of spinning
                    time.sleep(0.05)
                    tried_since_progress = 0
            return KVResult(False, err="NoQuorum", attempts=attempts, latency_ms=(time.monotonic() - t0) * 1000)
        finally:
            self._pool.put(s)
