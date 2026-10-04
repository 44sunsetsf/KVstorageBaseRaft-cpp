// 单个 Raft KV 节点：raftNode -i <id> -c <ip:port,ip:port,...> [-m <maxRaftState>] [-d <dataDir>]
// -c 是整个集群（含自己）的地址，按节点编号排列；本节点监听 -c 里第 id 项。
// 节点启动不需要等其他节点，随时可以 kill 掉再重新启动，重启后从 dataDir 里的持久化文件恢复。
#include <unistd.h>
#include <cstdio>
#include <cstdlib>
#include <sstream>
#include <string>
#include <utility>
#include <vector>
#include "kvServer.h"

static void usage() {
  std::fprintf(stderr, "usage: raftNode -i <id> -c <ip:port,ip:port,...> [-m <maxRaftState>] [-d <dataDir>]\n");
}

int main(int argc, char **argv) {
  int id = -1;
  int maxRaftState = 1 << 20;
  std::string cluster;
  std::string dataDir = ".";
  int c;
  while ((c = getopt(argc, argv, "i:c:m:d:")) != -1) {
    switch (c) {
      case 'i':
        id = std::atoi(optarg);
        break;
      case 'c':
        cluster = optarg;
        break;
      case 'm':
        maxRaftState = std::atoi(optarg);
        break;
      case 'd':
        dataDir = optarg;
        break;
      default:
        usage();
        return 2;
    }
  }
  std::vector<std::pair<std::string, short> > peers;
  std::stringstream ss(cluster);
  std::string item;
  while (std::getline(ss, item, ',')) {
    auto colon = item.rfind(':');
    if (colon == std::string::npos) {
      usage();
      return 2;
    }
    peers.emplace_back(item.substr(0, colon), static_cast<short>(std::atoi(item.substr(colon + 1).c_str())));
  }
  if (id < 0 || id >= static_cast<int>(peers.size())) {
    usage();
    return 2;
  }
  if (chdir(dataDir.c_str()) != 0) {  // 持久化文件写在当前目录
    std::perror("chdir");
    return 1;
  }
  KvServer server(id, maxRaftState, peers, peers[id].second, peers[id].first);  // 一直阻塞在 apply 循环
  return 0;
}
