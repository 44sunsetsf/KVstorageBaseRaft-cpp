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
  </p>
  <p>基于 <strong>Raft 共识算法的分布式 KV 存储</strong>，用 C++ 从零实现：共识层、Protobuf RPC 框架、协程库和跳表存储引擎。</p>
</div>

## 它能做什么

启动多个节点，它们组成一个集群，对外表现得像一台单机 KV 数据库。客户端可以 `Put`、`Append`、`Get`；每次写入都经过 Raft 日志，在所有节点上按相同顺序执行，因此**只要多数节点存活**，集群就能继续提供正确的数据。Leader 宕机后，剩余节点会重新选出 Leader，客户端会自己找到它。

> 本仓库基于 [youngyangyang04/KVstorageBaseRaft-cpp](https://github.com/youngyangyang04/KVstorageBaseRaft-cpp)，我在这里学习它的实现并持续迭代优化，计划见[后续迭代](#后续迭代)。

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
                       Persister：raftstatePersist{i}.txt · snapshotPersist{i}.txt
```

| 层 | 目录 | 职责 |
|---|---|---|
| 客户端 | `src/raftClerk` | `Clerk` 提供 `Put / Append / Get`；生成客户端 UUID 和递增请求号，轮询节点直到找到 Leader |
| 服务层 | `src/raftCore/kvServer.*` | 对外提供 KV RPC，把请求写成 Raft 日志，把已提交日志 apply 到跳表，制作与安装快照 |
| 共识层 | `src/raftCore/raft.*` | Leader 选举、日志复制、推进 commitIndex、日志压缩与快照传输 |
| RPC | `src/rpc`、`src/raftRpcPro` | 基于 Protobuf Service 的自研 RPC：服务端用 muduo，客户端是普通 TCP 通道 |
| 协程 | `src/fiber` | 基于 `ucontext` 的协程、epoll `IOManager`、定时器和系统调用 hook |
| 存储 | `src/skipList` | 模板化跳表作为状态机，支持 dump/load 用于快照 |

## 核心设计

**Raft 共识**
- 随机选举超时（300–500 ms）+ 25 ms 心跳；投票时按论文做“日志是否更新”的检查（先比最后一条日志的任期，再比下标）。
- `AppendEntries` 的回复带 `UpdateNextIndex`，落后的 Follower 可以告诉 Leader 直接回退到哪里，不必一条一条往回试。
- Leader 只在当前任期的日志被多数节点匹配后才推进 `commitIndex`。
- 持久化状态（`currentTerm`、`votedFor`、日志、快照边界）用 Boost.Serialization 序列化，在回复前落盘。

**日志压缩与快照**
- Raft 状态超过 `maxraftstate` 后，`KvServer` 把跳表和去重表打成快照，Raft 丢弃该下标之前的日志。
- 落后于 Leader 快照的 Follower 通过 `InstallSnapshot` 直接接收快照。

**客户端语义**
- 每个请求都带 `(ClientId, RequestId)`；`KvServer` 记录每个客户端最后执行的请求号，重试的写请求不会被执行两次。
- `Get` 同样走日志，所以读能看到它之前提交的所有写。
- 请求在以日志下标为 key 的通道上等待，共识超时 500 ms；超时或失去 Leader 身份时客户端换节点重试。

**RPC 框架**
- 报文格式：`varint32(header 长度) + RpcHeader{service, method, args_size} + args`，全部用 Protobuf 编码。
- `RpcProvider` 注册任意 `google::protobuf::Service`，按服务名和方法名分发；底层是 muduo，4 个 I/O 线程。
- `MprpcChannel` 实现了 `RpcChannel`，调用方直接使用 Protobuf 生成的 Stub，像调用本地函数一样。

**协程库**
- 基于 `ucontext` 的有栈协程、N:M 调度器、带定时器堆的 epoll `IOManager`。
- hook 了 `sleep`、`read`、`write`、`connect` 等系统调用，把阻塞变成让出；Raft 的定时器以协程方式运行。

## 快速开始

依赖：Linux、支持 C++20 的 GCC、CMake ≥ 3.22、[muduo](https://github.com/chenshuo/muduo)、Boost（serialization）、Protobuf。代码用到了 epoll、`ucontext` 和 libstdc++ 内部类型，无法在 macOS 上编译，请使用 Linux 机器、虚拟机或容器。

```bash
# Ubuntu 22.04
sudo apt install -y build-essential cmake libboost-dev libboost-serialization-dev \
                    protobuf-compiler libprotobuf-dev
# muduo 没有 apt 包，需要从源码编译安装

mkdir cmake-build-debug && cd cmake-build-debug
cmake .. && make -j"$(nproc)"
```

可执行文件生成在 `bin/`。先启动一个三节点集群，再在另一个终端运行客户端：

```bash
cd bin
./raftCoreRun -n 3 -f test.conf   # fork 出 3 个节点，随机端口，地址写入 test.conf
./callerMain                      # 读取 test.conf，对集群做 500 轮 Put/Get
```

节点启动后会先睡几秒，确保所有节点的 RPC 服务都在监听后再互相连接。持久化文件 `raftstatePersist{i}.txt` 和 `snapshotPersist{i}.txt` 写在当前目录，删掉即可从空状态重新开始。

更小的示例：

| 可执行文件 | 演示内容 |
|---|---|
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
├── example/           # raftCoreExample · rpcExample · fiberExample
├── test/              # 小实验（defer、格式化）
├── docs/              # 文档与图片
└── bin/test.conf      # 节点配置示例
```

运行 `make format` 可按 `.clang-format` 格式化源码。

## 后续迭代

计划推进的方向：

- **正确性**：参考 MIT 6.824 的测试补上选举、网络分区、节点重启的测试；处理快照与 shared_ptr 相关的遗留 `todo`。
- **读优化**：用 ReadIndex 或 Leader Lease，让 `Get` 不必再走日志。
- **性能**：`AppendEntries` 批量与流水线发送；RPC 客户端复用连接并按帧循环接收（目前只读一次 1 KB 缓冲区）；用协程调度替代每次 RPC 新开 `std::thread`。
- **持久化**：原子写入 + fsync，存储引擎可插拔。
- **集群能力**：成员变更与分片。

## 致谢

原项目作者为 [youngyangyang04](https://github.com/youngyangyang04) 及各位贡献者（[上游仓库](https://github.com/youngyangyang04/KVstorageBaseRaft-cpp)）。上游仓库未声明开源许可证。
