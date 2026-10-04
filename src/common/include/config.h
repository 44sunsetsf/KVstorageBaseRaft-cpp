//
// Created by swx on 23-12-23.
//

#ifndef CONFIG_H
#define CONFIG_H

#include <cstdlib>
#include <cstring>

// 调试输出开关，默认打开；设置环境变量 RAFT_DEBUG=0 可以关闭（压测、公网演示时日志量很大）
inline const bool Debug = [] {
  const char* v = std::getenv("RAFT_DEBUG");
  return !(v != nullptr && std::strcmp(v, "0") == 0);
}();

const int debugMul = 1;  // 时间单位：time.Millisecond，不同网络环境rpc速度不同，因此需要乘以一个系数
const int HeartBeatTimeout = 25 * debugMul;  // 心跳时间一般要比选举超时小一个数量级
const int ApplyInterval = 10 * debugMul;     //

const int minRandomizedElectionTime = 300 * debugMul;  // ms
const int maxRandomizedElectionTime = 500 * debugMul;  // ms

const int CONSENSUS_TIMEOUT = 500 * debugMul;  // ms

// leader 收到新命令后是否立即向 follower 复制，而不是等下一次心跳（对比测试时可关闭）
const bool REPLICATE_ON_START = true;

// 持久化时是否 fsync。关掉后重启仍能恢复，但机器断电可能丢数据，仅用于对比测试性能
const bool PERSIST_FSYNC = true;

// 协程相关设置

const int FIBER_THREAD_NUM = 1;              // 协程库中线程池大小
const bool FIBER_USE_CALLER_THREAD = false;  // 是否使用caller_thread执行调度任务

#endif  // CONFIG_H
