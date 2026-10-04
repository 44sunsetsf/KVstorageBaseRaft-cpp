<p align="right"><a href="https://github.com/44sunsetsf/KVstorageBaseRaft-cpp"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/images/lang-zh-dark.svg"><img alt="EN | 中文 — 切换到英文" src="docs/images/lang-zh-light.svg" width="112"></picture></a></p>

<div align="center">
  <h2>KVstorageBaseRaft-cpp</h2>
  <p>
    <img src="https://img.shields.io/badge/C%2B%2B-20-00599C?style=flat-square" alt="C++20">
    <img src="https://img.shields.io/badge/CMake-3.22%2B-064F8C?style=flat-square" alt="CMake 3.22+">
    <img src="https://img.shields.io/badge/Protobuf-RPC-244C5A?style=flat-square" alt="Protobuf RPC">
    <img src="https://img.shields.io/badge/muduo-network-5E6AD2?style=flat-square" alt="muduo">
    <img src="https://img.shields.io/badge/Boost-Serialization-F7901E?style=flat-square" alt="Boost.Serialization">
    <img src="https://img.shields.io/badge/Platform-Linux-FCC624?style=flat-square" alt="Linux">
    <a href="https://github.com/44sunsetsf/KVstorageBaseRaft-cpp/actions/workflows/ci.yml"><img src="https://github.com/44sunsetsf/KVstorageBaseRaft-cpp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  </p>
  <p>基于 <strong>Raft 共识算法的分布式 KV 存储</strong>，用 C++ 从零实现：共识层、Protobuf RPC 框架、协程库和跳表存储引擎。</p>
</div>

## 它能做什么

启动多个节点，它们组成一个集群，对外表现得像一台单机 KV 数据库。客户端可以 `Put`、`Append`、`Get`；每次写入都经过 Raft 日志，在所有节点上按相同顺序执行，因此**只要多数节点存活**，集群就能继续提供正确的数据。Leader 宕机后，剩余节点会重新选出 Leader，客户端会自己找到它。被杀掉的节点重启后会从磁盘恢复状态。

## 在线体验

**在线演示：** https://raft.yunfanteo.world ——五个真实的节点，可以杀掉、暂停、重启，还有一键故障测试。

![演示页面：五个节点，其中一个被杀掉，以及每个节点的复制日志](docs/images/playground.jpg)

页面画的是节点通过自己的 `Status` RPC 上报的内容：角色、任期、commit 下标和日志末尾。格子是日志条目，提交后变成实心，颜色代表写入时的任期。“运行故障测试”会写入数据、杀掉 leader、再写入、杀掉所有节点、重启，最后检查有没有键丢失；在线演示上一般约 400 ms 就能选出新 leader。

自己运行（只需要 Docker）：

```bash
docker compose -f demo/docker-compose.yml up --build   # 然后打开 http://localhost:8000
python3 demo/tests/e2e.py http://localhost:8000        # 同样的故障流程，作为测试运行
```

## 架构

```
  Clerk（客户端）──Put / Append / Get（RPC）──►  KvServer ×N
  · 缓存最近一次的 Leader                          │  按 (ClientId, RequestId) 去重
  · ErrWrongLeader / 超时后换节点重试              │  按日志下标等待通道，直到该操作被 apply
                                                  ▼
                                          Raft 节点 ◄──RequestVote / AppendEntries / InstallSnapshot──► 其他节点
                                          │  选举 · 日志复制 · 提交 · 快照
                                          │  心跳与选举定时器跑在协程 IOManager 上
                                          ▼
                       applyChan ──► 状态机：SkipList<string, string>
                                          │
                                          ▼
                       Persister：raftstatePersist{i}.txt · snapshotPersist{i}.txt（原子写入，fsync）
```

| 层 | 目录 | 职责 |
|---|---|---|
| 客户端 | `src/raftClerk` | `Clerk` 提供 `Put / Append / Get`；生成随机客户端 id 和递增请求号，轮询节点直到找到 Leader |
| 服务层 | `src/raftCore/kvServer.*` | 对外提供 KV 和 `Status` RPC，把请求写成 Raft 日志，把已提交日志 apply 到跳表，制作与安装快照 |
| 共识层 | `src/raftCore/raft.*` | Leader 选举、日志复制、推进 commitIndex、日志压缩与快照传输 |
| RPC | `src/rpc`、`src/raftRpcPro` | 基于 Protobuf Service 的自研 RPC：服务端用 muduo，客户端是普通 TCP 通道 |
| 协程 | `src/fiber` | 基于 `ucontext` 的协程、epoll `IOManager`、定时器和系统调用 hook |
| 存储 | `src/skipList` | 模板化跳表作为状态机，支持 dump/load 用于快照 |

## 核心设计

**Raft 共识**
- 随机选举超时（300–500 ms）+ 25 ms 心跳；投票时按论文做“日志是否更新”的检查（先比最后一条日志的任期，再比下标）。
- `AppendEntries` 的回复带 `UpdateNextIndex`，落后的 Follower 可以告诉 Leader 直接回退到哪里，不必一条一条往回试。
- Leader 只在当前任期的日志被多数节点匹配后才推进 `commitIndex`。
- 新命令到达会唤醒复制线程，立即发送 `AppendEntries`；一轮复制期间到达的命令在下一轮合并成一批发出。`commitIndex` 推进时立刻唤醒 applier。

**持久化**
- `currentTerm`、`votedFor`、日志和快照边界用 Boost.Serialization 序列化，在回复任何人**之前**落盘。
- 每次写入都是“写临时文件 → `fsync` → rename 覆盖旧文件（再同步目录）”，崩溃后磁盘上要么是旧状态要么是新状态。快照先于日志截断写入。
- 节点被 `kill -9` 后重启，会读回自己的状态，再向 Leader 追赶。

**日志压缩与快照**
- Raft 状态超过 `maxraftstate` 后，`KvServer` 把跳表和去重表打成快照，Raft 丢弃该下标之前的日志。
- 落后于 Leader 快照的 Follower 通过 `InstallSnapshot` 直接接收快照。

**客户端语义**
- 每个请求都带 `(ClientId, RequestId)`；`KvServer` 记录每个客户端最后执行的请求号，重试的写请求不会被执行两次。
- `Get` 同样走日志，所以读能看到它之前提交的所有写。
- 请求在以日志下标为 key 的通道上等待，共识超时 500 ms；超时或失去 Leader 身份时客户端换节点重试。

**RPC 框架**
- 报文格式：请求为 `uint32(长度) + varint32(header 长度) + RpcHeader{service, method, args_size} + args`，响应为 `uint32(长度) + 消息`，全部用 Protobuf 编码。服务端从 TCP 字节流里按长度切帧，因此半包和粘包都能正确处理。
- `RpcProvider` 注册任意 `google::protobuf::Service`，按服务名和方法名分发；底层是 muduo，4 个 I/O 线程。
- `MprpcChannel` 实现了 `RpcChannel`，调用方直接使用 Protobuf 生成的 Stub，像调用本地函数一样。同一连接同时只允许一个调用在途，忽略 `SIGPIPE`（`MSG_NOSIGNAL`），带接收超时，对端断开后自动重连。

**协程库**
- 基于 `ucontext` 的有栈协程、N:M 调度器、带定时器堆的 epoll `IOManager`。
- hook 了 `sleep`、`read`、`write`、`connect` 等系统调用，把阻塞变成让出；Raft 的定时器以协程方式运行。

## 性能

我接手的项目没有真正可用的持久化，而且每次写入都要等下一次心跳才复制。同一台机器、同样的 3 节点配置，`scripts/bench.sh` 跑 3 次取中位数：

| | 原项目 | 同配置 | 调优后 |
|---|---|---|---|
| 写入延迟，1 个客户端（平均） | 24.0 ms | 5.0 ms | 2.0 ms |
| 每秒写入，1 个客户端 | 41 | 198 | 501 |
| 每秒写入，8 个客户端 | 165 | 196 | 536 |

测试方法：`kvbench`（C++ 客户端，串行 `Put`），3 个节点开启 `fsync`，Apple 芯片 Mac 上的 Docker，默认 Debug 构建。“同配置”是新代码配上原项目写死的 500 字节 `maxraftstate`（几乎每次写入都做快照）；“调优后”使用新的默认值 1 MB。原项目没有任何落盘，所以它的数字里不含磁盘同步。

改了什么，以及为什么体现在这些数字上：

- **写入后立即复制，提交后立即应用。** 以前 Leader 收到新日志要等最多 25 ms 的下一次心跳才发出去，applier 还要每 10 ms 轮询一次。现在都改成事件驱动。
- **更可靠的 RPC 层。** 带长度前缀的报文帧、收满整个响应、同一连接同时只有一个调用、超时。以前对端关闭连接会让进程被 `SIGPIPE` 杀掉，两个请求并在一个 TCP 报文里时，客户端会永远等下去。
- **测试中发现并修复的 bug：** 每次启动都会清空状态文件，重启后数据全丢；快照恢复后每个 value 都变成 key；`Append` 实际是覆盖；所有客户端进程共用同一个 id，第二个客户端的写入被当成重复请求丢弃；还有 leader 空转占满 100% CPU，原因是把 25 毫秒写成了 25 微秒。

## 快速开始

依赖：Linux、支持 C++20 的 GCC、CMake ≥ 3.22、[muduo](https://github.com/chenshuo/muduo)、Boost（serialization）、Protobuf。代码用到了 epoll、`ucontext` 和 libstdc++ 内部类型，无法在 macOS 上编译，请使用 Linux 机器、虚拟机或容器（`demo/Dockerfile` 里有一份可用的构建方法）。

```bash
# Ubuntu 22.04
sudo apt install -y build-essential cmake libboost-dev libboost-serialization-dev \
                    protobuf-compiler libprotobuf-dev
# muduo 没有 apt 包，需要从源码编译安装

mkdir cmake-build-debug && cd cmake-build-debug
cmake .. && make -j"$(nproc)"          # 想要优化构建就加 -DCMAKE_BUILD_TYPE=Release
```

可执行文件生成在 `bin/`。先启动一个三节点集群，再在另一个终端操作它：

```bash
cd bin
./raftCoreRun -n 3 -f test.conf        # fork 出 3 个节点，随机端口，地址写入 test.conf
./kvcli test.conf put city Gothenburg  # 还有：append <key> <value>、get <key>
./kvcli test.conf get city
./callerMain                           # 500 轮 Put/Get
```

`raftCoreRun` 用 `-m <字节数>` 设置快照阈值。状态保存在当前目录的 `raftstatePersist{i}.txt` 和 `snapshotPersist{i}.txt` 里，下次启动会读回；想从头开始就删掉这些文件。设置 `RAFT_DEBUG=0` 可以关闭调试输出。

节点也可以一个一个单独启动，在线演示就是这样做的。它们不会互相等待，所以任何一个都可以随时被杀掉再启动：

```bash
C=127.0.0.1:7001,127.0.0.1:7002,127.0.0.1:7003
./raftNode -i 0 -c $C -d /tmp/n0 &     # -i 节点编号，-c 整个集群的地址，-d 数据目录
./raftNode -i 1 -c $C -d /tmp/n1 &
./raftNode -i 2 -c $C -d /tmp/n2 &
```

工具与脚本：

| | 作用 |
|---|---|
| `scripts/demo_failover.sh` | 杀掉 leader，再杀掉所有节点并重启，检查数据是否还在 |
| `scripts/bench.sh` | 对一个全新的 3 节点集群做写入压测（`kvbench`） |
| `demo/tests/e2e.py` | 对运行中的演示页面做同样的故障流程测试，CI 每次 push 都会运行 |
| `provider` / `consumer` | 单独使用 RPC 框架（`example/rpcExample`，见 [rpc_example.md](example/rpcExample/rpc_example.md)） |
| `test_scheduler`、`test_iomanager`、`test_hook`、`test_server` | 协程库（`example/fiberExample`） |

## 目录结构

```text
KVstorageBaseRaft-cpp
├── src/
│   ├── raftCore/      # Raft 节点、KvServer、Persister
│   ├── raftClerk/     # 客户端
│   ├── raftRpcPro/    # Raft 与 KV RPC 的 .proto
│   ├── rpc/           # RPC 框架（provider、channel、controller）
│   ├── fiber/         # 协程库（调度器、IOManager、hook、定时器）
│   ├── skipList/      # 跳表状态机
│   └── common/        # 配置常量、工具函数
├── example/           # raftCoreExample（raftCoreRun、raftNode、kvcli、kvbench）· rpcExample · fiberExample
├── demo/              # 演示页面：Python 网关、Web 界面、Dockerfile、部署脚本、e2e 测试
├── scripts/           # 故障演示与压测脚本
├── test/              # 小实验（defer、格式化）
└── docs/              # 文档与图片
```

运行 `make format` 可按 `.clang-format` 格式化源码。

## 后续迭代

计划推进的方向：

- **正确性**：参考 MIT 6.824 的测试补上网络分区、消息丢失的测试，再加一个对录制历史做线性一致性检查的工具。
- **选举**：加入 pre-vote，让凑不够多数派的节点不再不断推高任期（演示页面里能看到：杀掉三个节点，任期会一直涨）。
- **读优化**：用 ReadIndex 或 Leader Lease，让 `Get` 不必再走日志。
- **复制**：在 RPC 层加请求号，让每个 follower 可以同时有多个 `AppendEntries` 在途；用协程调度替代每次 RPC 新开 `std::thread`。
- **集群能力**：成员变更与分片。
