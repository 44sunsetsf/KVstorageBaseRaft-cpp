<p align="right"><a href="README.zh-CN.md"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/lang-dark.svg"><img alt="EN | 中文 — switch to Chinese" src="docs/images/lang-light.svg" width="112"></picture></a></p>

<div align="center">
  <h2>KVstorageBaseRaft-cpp</h2>
  <p>
    <img src="https://img.shields.io/badge/C%2B%2B-20-00599C?style=flat-square" alt="C++20">
    <img src="https://img.shields.io/badge/CMake-3.22%2B-064F8C?style=flat-square" alt="CMake 3.22+">
    <img src="https://img.shields.io/badge/Protobuf-RPC-244C5A?style=flat-square" alt="Protobuf RPC">
    <img src="https://img.shields.io/badge/muduo-network-5E6AD2?style=flat-square" alt="muduo">
    <img src="https://img.shields.io/badge/Boost-Serialization-F7901E?style=flat-square" alt="Boost.Serialization">
    <img src="https://img.shields.io/badge/Platform-Linux-FCC624?style=flat-square" alt="Linux">
  </p>
  <p>A <strong>distributed key-value store built on Raft</strong>, written in C++ from the ground up: consensus, a Protobuf RPC framework, a coroutine library and a skip-list storage engine.</p>
</div>

## What it does

Start several nodes and they form one cluster that behaves like a single key-value database. Clients `Put`, `Append` and `Get` against it; every write goes through the Raft log and is applied in the same order on every node, so the cluster keeps serving correct data **as long as a majority of nodes are alive**. When the leader goes down, the remaining nodes elect a new one and the client finds it on its own.

> This repository started from [youngyangyang04/KVstorageBaseRaft-cpp](https://github.com/youngyangyang04/KVstorageBaseRaft-cpp). I keep it here to study the implementation and iterate on it — see [Roadmap](#roadmap).

## Architecture

```
  Clerk (client) ──Put / Append / Get (RPC)──►  KvServer ×N
  · caches the last known leader                  │  dedup by (ClientId, RequestId)
  · retries on ErrWrongLeader / timeout           │  waits on a per-index channel until the op is applied
                                                  ▼
                                          Raft node ◄──RequestVote / AppendEntries / InstallSnapshot──► peers
                                          │  election · log replication · commit · snapshots
                                          │  heartbeat & election tickers run on the fiber IOManager
                                          ▼
                       applyChan ──► state machine: SkipList<string, string>
                                          │
                                          ▼
                       Persister: raftstatePersist{i}.txt · snapshotPersist{i}.txt
```

| Layer | Directory | Role |
|---|---|---|
| Client | `src/raftClerk` | `Clerk` with `Put / Append / Get`; generates a client UUID and an increasing request id, rotates through nodes until it hits the leader |
| Service | `src/raftCore/kvServer.*` | Exposes the KV RPC service, turns requests into Raft log entries, applies committed entries to the skip list, makes and installs snapshots |
| Consensus | `src/raftCore/raft.*` | Leader election, log replication, commit index advancement, log compaction and snapshot transfer |
| RPC | `src/rpc`, `src/raftRpcPro` | Home-grown RPC on top of Protobuf services: muduo server side, plain TCP client channel |
| Coroutines | `src/fiber` | `ucontext` fibers, an epoll-based `IOManager`, timers and syscall hooks |
| Storage | `src/skipList` | Templated skip list used as the state machine, with dump/load for snapshots |

## Core design

**Raft consensus**
- Randomised election timeout (300–500 ms) and a 25 ms heartbeat; candidates vote with the up-to-date check from the paper (last log term, then last log index).
- `AppendEntries` carries an `UpdateNextIndex` hint so a lagging follower can tell the leader how far back to jump instead of stepping one entry at a time.
- The leader only advances `commitIndex` for entries from its current term once a majority has matched them.
- Persistent state (`currentTerm`, `votedFor`, the log and the snapshot boundary) is serialised with Boost.Serialization and written before replying.

**Log compaction and snapshots**
- When the Raft state grows past `maxraftstate`, `KvServer` dumps the skip list plus the dedup table into a snapshot and Raft drops the log up to that index.
- Followers that fall behind the leader's snapshot receive it through `InstallSnapshot`.

**Client semantics**
- Every request carries `(ClientId, RequestId)`; `KvServer` remembers the last applied id per client, so a retried write is never applied twice.
- `Get` goes through the log too, so reads see every write committed before them.
- A request waits on a channel keyed by its log index, with a 500 ms consensus timeout; on timeout or leadership loss the client retries elsewhere.

**RPC framework**
- Wire format: `varint32(header length) + RpcHeader{service, method, args_size} + args`, all encoded with Protobuf.
- `RpcProvider` registers any `google::protobuf::Service` and dispatches on service and method name; it runs on muduo with 4 I/O threads.
- `MprpcChannel` implements `RpcChannel`, so callers use the generated Protobuf stubs as if they were local calls.

**Fiber library**
- Stackful coroutines on `ucontext`, an N:M scheduler and an epoll `IOManager` with a timer heap.
- Hooks on `sleep`, `read`, `write`, `connect` and friends turn blocking calls into yields; Raft's tickers run as fibers.

## Quick start

Requirements: Linux, GCC with C++20, CMake ≥ 3.22, [muduo](https://github.com/chenshuo/muduo), Boost (serialization), Protobuf. The code relies on epoll, `ucontext` and libstdc++ internals, so it does not build on macOS; use a Linux machine, VM or container.

```bash
# Ubuntu 22.04
sudo apt install -y build-essential cmake libboost-dev libboost-serialization-dev \
                    protobuf-compiler libprotobuf-dev
# muduo has no apt package: build and install it from source

mkdir cmake-build-debug && cd cmake-build-debug
cmake .. && make -j"$(nproc)"
```

Binaries end up in `bin/`. Start a three-node cluster, then run the client from another terminal:

```bash
cd bin
./raftCoreRun -n 3 -f test.conf   # forks 3 nodes on random ports and writes their addresses to test.conf
./callerMain                      # reads test.conf, runs 500 Put/Get rounds against the cluster
```

Nodes sleep a few seconds on start-up so every peer's RPC server is listening before they connect. Persisted state is written to `raftstatePersist{i}.txt` and `snapshotPersist{i}.txt` in the working directory; delete them to start from a clean slate.

Smaller examples:

| Binary | What it shows |
|---|---|
| `provider` / `consumer` | The RPC framework on its own (`example/rpcExample`, see [rpc_example.md](example/rpcExample/rpc_example.md)) |
| `test_scheduler`, `test_iomanager`, `test_hook`, `test_server` | The fiber library (`example/fiberExample`) |

## Repository layout

```text
KVstorageBaseRaft-cpp
├── src/
│   ├── raftCore/      # Raft node, KvServer, Persister
│   ├── raftClerk/     # client
│   ├── raftRpcPro/    # .proto files for Raft and KV RPCs
│   ├── rpc/           # RPC framework (provider, channel, controller)
│   ├── fiber/         # coroutine library (scheduler, IOManager, hooks, timers)
│   ├── skipList/      # skip-list state machine
│   └── common/        # config constants, utilities
├── example/           # raftCoreExample · rpcExample · fiberExample
├── test/              # small experiments (defer, formatting)
├── docs/              # notes and images
└── bin/test.conf      # sample node configuration
```

Run `make format` to apply `.clang-format` to the sources.

## Roadmap

Directions I plan to work on:

- **Correctness**: tests for elections, partitions and restarts, modelled on the MIT 6.824 test suite; fix the remaining `todo`s around snapshot and shared-pointer handling.
- **Reads**: ReadIndex or leader leases so `Get` no longer has to go through the log.
- **Performance**: batched and pipelined `AppendEntries`, connection reuse and a framed receive loop in the RPC client (it currently reads a single 1 KB buffer), and replacing per-RPC `std::thread` with the fiber scheduler.
- **Persistence**: atomic writes with fsync, and a pluggable storage engine.
- **Cluster features**: membership changes and sharding.

## Credits

Original project by [youngyangyang04](https://github.com/youngyangyang04) and contributors ([upstream](https://github.com/youngyangyang04/KVstorageBaseRaft-cpp)). The upstream repository does not publish a license.
