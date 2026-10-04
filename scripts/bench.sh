#!/usr/bin/env bash
# 写入性能基准：./scripts/bench.sh [客户端数 每客户端写入数]...  默认测 1x300 与 8x100
# 在 bin/ 已编译好的 Linux 环境中运行；会清空 raftstatePersist*/snapshotPersist* 后启动 3 节点集群。
set -euo pipefail
BIN="$(cd "$(dirname "$0")/.." && pwd)/bin"
cd "$BIN"
LOG=$(mktemp /tmp/raft-bench.XXXX.log)
trap 'pkill -9 -f "raftCoreRun -n 3" 2>/dev/null || true' EXIT
rm -f raftstatePersist*.txt snapshotPersist*.txt
./raftCoreRun -n 3 ${RAFT_ARGS:-} -f bench.conf > "$LOG" 2>&1 &
for _ in $(seq 1 60); do grep -q "elect success" "$LOG" && break; sleep 1; done
grep -q "elect success" "$LOG" || { echo "no leader"; exit 1; }
sleep 1
if [ $# -eq 0 ]; then set -- 1 300 8 100; fi
while [ $# -ge 2 ]; do
  ./kvbench bench.conf "$1" "$2" | grep '^BENCH'
  shift 2
done
