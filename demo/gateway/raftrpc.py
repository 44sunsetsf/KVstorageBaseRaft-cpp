"""Client for the project's home-grown Protobuf RPC protocol (see src/rpc).

Frame (both directions are length-prefixed):
  request : uint32_be(len) + varint32(header_len) + RpcHeader + args
  response: uint32_be(len) + reply message
"""
import socket
import struct
import threading

import kvServerRPC_pb2 as kv
import rpcheader_pb2 as hdr

SERVICE = b"kvServerRpc"


class RpcError(Exception):
    pass


def _varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def _recv_exact(sock, n):
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("peer closed the connection")
        buf += chunk
    return bytes(buf)


class NodeConn:
    """One TCP connection to one node. Calls are serialised (the protocol has no request ids)."""

    def __init__(self, host, port, timeout=1.0):
        self.host, self.port, self.timeout = host, port, timeout
        self._sock = None
        self._lock = threading.Lock()

    def _close(self):
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None

    def _connect(self, timeout):
        s = socket.create_connection((self.host, self.port), timeout=timeout)
        s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self._sock = s

    @staticmethod
    def _frame(method, request):
        args = request.SerializeToString()
        header = hdr.RpcHeader(service_name=SERVICE, method_name=method.encode(), args_size=len(args)).SerializeToString()
        payload = _varint(len(header)) + header + args
        return struct.pack(">I", len(payload)) + payload

    def call(self, method, request, reply, timeout=None):
        timeout = timeout or self.timeout
        frame = self._frame(method, request)
        with self._lock:
            for attempt in (0, 1):
                try:
                    if self._sock is None:
                        self._connect(timeout)
                    self._sock.settimeout(timeout)
                    self._sock.sendall(frame)
                    (n,) = struct.unpack(">I", _recv_exact(self._sock, 4))
                    reply.ParseFromString(_recv_exact(self._sock, n))
                    return reply
                except (OSError, ConnectionError) as e:
                    self._close()
                    # a stale pooled connection fails on the first send; reconnect once
                    if attempt == 1 or isinstance(e, socket.timeout):
                        raise RpcError("%s:%d %s: %s" % (self.host, self.port, method, e))
        raise RpcError("unreachable")

    def close(self):
        with self._lock:
            self._close()
