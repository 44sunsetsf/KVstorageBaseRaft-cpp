#!/usr/bin/env bash
# 故障演示：写入数据 -> kill -9 leader -> 数据仍可读写 -> 杀掉全部节点并重启 -> 数据仍在
# 在 bin/ 已编译好的 Linux 环境中运行：./scripts/demo_failover.sh [写入条数，默认 20]
set -euo pipefail

BIN="$(cd "$(dirname "$0")/.." && pwd)/bin"
N=${1:-20}
CONF=demo.conf
LOG=$(mktemp /tmp/raft-demo.XXXX.log)
cd "$BIN"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m    %s\033[0m\n' "$*"; exit 1; }

cleanup() { pkill -9 -f "raftCoreRun -n 3" 2>/dev/null || true; }
trap cleanup EXIT

start_cluster() {
  : > "$LOG"
  ./raftCoreRun -n 3 ${RAFT_ARGS:-} -f "$CONF" >> "$LOG" 2>&1 &
  PARENT=$!
  # 节点启动时会等待互相连接，之后选出 leader
  for _ in $(seq 1 60); do
    grep -q "elect success" "$LOG" && break
    sleep 1
  done
  grep -q "elect success" "$LOG" || fail "cluster did not elect a leader"
  sleep 1
}

leader_id() { grep "elect success" "$LOG" | tail -1 | sed -E 's/.*rf\{([0-9]+)\}.*/\1/'; }
leader_term() { grep "elect success" "$LOG" | tail -1 | sed -E 's/.*current term:\{([0-9]+)\}.*/\1/'; }

check_all() {
  local bad=0
  for i in $(seq 1 "$N"); do
    v=$(./kvcli "$CONF" get "key$i" | tail -n1)  # 客户端库会往 stdout 打重连日志，只取最后一行
    [ "$v" = "value$i" ] || { bad=$((bad+1)); echo "    key$i -> '$v' (expected value$i)"; }
  done
  [ "$bad" -eq 0 ] || fail "$bad/$N keys wrong"
  ok "all $N keys read back correctly"
}

rm -f raftstatePersist*.txt snapshotPersist*.txt

step "1. start a 3-node cluster"
start_cluster
ok "leader = node $(leader_id), term $(leader_term)"

step "2. write $N keys"
for i in $(seq 1 "$N"); do ./kvcli "$CONF" put "key$i" "value$i" > /dev/null; done
ok "wrote key1..key$N"

step "3. kill -9 the leader (node $(leader_id))"
LID=$(leader_id)
mapfile -t PIDS < <(pgrep -P "$PARENT" | sort -n)
kill -9 "${PIDS[$LID]}"
ok "killed pid ${PIDS[$LID]}"
BEFORE=$(grep -c "elect success" "$LOG")
./kvcli "$CONF" put after-failover yes > /dev/null
ok "write after failover succeeded; new leader = node $(leader_id), term $(leader_term)"
check_all

step "4. kill -9 every node, then restart the cluster"
cleanup; sleep 1
start_cluster
ok "restarted; leader = node $(leader_id), term $(leader_term)"
check_all
[ "$(./kvcli "$CONF" get after-failover | tail -n1)" = "yes" ] || fail "after-failover key lost"
ok "the key written after failover survived the restart too"

printf '\n\033[1;32mPASS: no data lost across leader failure and full-cluster restart\033[0m\n'
