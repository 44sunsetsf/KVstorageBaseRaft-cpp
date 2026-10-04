// 写入基准测试：kvbench <conf> <clients> <ops-per-client>
// 每个客户端线程各自持有一个 Clerk，串行发起 Put，统计吞吐与延迟分位数。
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <thread>
#include <vector>
#include "clerk.h"

int main(int argc, char **argv) {
  if (argc != 4) {
    std::fprintf(stderr, "usage: %s <conf> <clients> <ops-per-client>\n", argv[0]);
    return 2;
  }
  const std::string conf = argv[1];
  const int clients = std::atoi(argv[2]);
  const int ops = std::atoi(argv[3]);
  using Clock = std::chrono::steady_clock;

  std::vector<std::vector<double>> lat(clients);
  std::vector<std::thread> threads;
  auto t0 = Clock::now();
  for (int c = 0; c < clients; ++c) {
    threads.emplace_back([&, c]() {
      Clerk clerk;
      clerk.Init(conf);
      clerk.Put("warmup" + std::to_string(c), "x");  // 先把到 leader 的连接建好
      lat[c].reserve(ops);
      for (int i = 0; i < ops; ++i) {
        auto s = Clock::now();
        clerk.Put("bench-" + std::to_string(c) + "-" + std::to_string(i), "v");
        lat[c].push_back(std::chrono::duration<double, std::milli>(Clock::now() - s).count());
      }
    });
  }
  for (auto &t : threads) t.join();
  double total = std::chrono::duration<double>(Clock::now() - t0).count();

  std::vector<double> all;
  for (auto &v : lat) all.insert(all.end(), v.begin(), v.end());
  std::sort(all.begin(), all.end());
  auto pct = [&](double p) { return all[std::min(all.size() - 1, static_cast<size_t>(p * all.size()))]; };
  double sum = 0;
  for (double x : all) sum += x;
  std::printf("BENCH clients=%d ops=%zu ops/s=%.1f avg=%.2fms p50=%.2fms p99=%.2fms max=%.2fms\n", clients, all.size(),
              all.size() / total, sum / all.size(), pct(0.50), pct(0.99), all.back());
  return 0;
}
