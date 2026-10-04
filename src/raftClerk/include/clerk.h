//
// Created by swx on 23-6-4.
//

#ifndef SKIP_LIST_ON_RAFT_CLERK_H
#define SKIP_LIST_ON_RAFT_CLERK_H
#include <arpa/inet.h>
#include <netinet/in.h>
#include <raftServerRpcUtil.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>
#include <cerrno>
#include <random>
#include <string>
#include <vector>
#include "kvServerRPC.pb.h"
#include "mprpcconfig.h"
class Clerk {
 private:
  std::vector<std::shared_ptr<raftServerRpcUtil>>
      m_servers;  //保存所有raft节点的fd //todo：全部初始化为-1，表示没有连接上
  std::string m_clientId;
  int m_requestId;
  int m_recentLeaderId;  //只是有可能是领导

  // 用于返回随机的clientId。必须用真随机：服务端按 (ClientId, RequestId) 去重，
  // 如果不同进程的 clientId 相同，后启动的客户端的写请求会被当成重复请求丢弃
  std::string Uuid() {
    std::random_device rd;
    std::string id;
    for (int i = 0; i < 4; ++i) {
      id += std::to_string(rd());
    }
    return id;
  }

  //    MakeClerk  todo
  void PutAppend(std::string key, std::string value, std::string op);

 public:
  //对外暴露的三个功能和初始化
  void Init(std::string configFileName);
  std::string Get(std::string key);

  void Put(std::string key, std::string value);
  void Append(std::string key, std::string value);

 public:
  Clerk();
};

#endif  // SKIP_LIST_ON_RAFT_CLERK_H
