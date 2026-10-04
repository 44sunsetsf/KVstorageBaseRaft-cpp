// 命令行客户端：kvcli <conf> put <key> <value> | append <key> <value> | get <key>
#include <cstdio>
#include <cstring>
#include <string>
#include "clerk.h"

int main(int argc, char **argv) {
  if (argc < 4) {
    std::fprintf(stderr, "usage: %s <conf> put|append <key> <value> | get <key>\n", argv[0]);
    return 2;
  }
  Clerk client;
  client.Init(argv[1]);
  const std::string cmd = argv[2];
  if (cmd == "get" && argc == 4) {
    std::printf("%s\n", client.Get(argv[3]).c_str());
  } else if (cmd == "put" && argc == 5) {
    client.Put(argv[3], argv[4]);
    std::printf("OK\n");
  } else if (cmd == "append" && argc == 5) {
    client.Append(argv[3], argv[4]);
    std::printf("OK\n");
  } else {
    std::fprintf(stderr, "bad command\n");
    return 2;
  }
  return 0;
}
