#!/usr/bin/env bash
# 把当前已推送的 main 部署到公网服务器。在自己电脑的仓库根目录运行：
#
#   demo/deploy/deploy.sh             构建并部署（演示相关文件没有变化时什么也不做）
#   demo/deploy/deploy.sh rollback    换回上一次部署前的镜像
#
# 做法（服务器只有 1.6 GiB 内存，不能在上面构建）：
#   1. 检查本地没有未提交、未推送的改动，服务器 git pull 到同一个提交（只用来取 compose 和 Caddy 配置）
#   2. 在本机构建 linux/amd64 镜像，通过 ssh 传到服务器，旧的 :latest 记为 :prev 供回滚
#   3. 第一次部署时安装 Caddy 站点配置（raft.<域名>）并 reload
#   4. 重建容器，等健康检查通过，再从公网跑一遍端到端测试（杀 leader、杀全部节点、重启、核对数据）
#   5. 任何一步失败都自动回滚到 :prev
set -euo pipefail

HOST="${DEPLOY_HOST:-admin@47.84.60.190}"
SMOKE_URL="${DEPLOY_SMOKE_URL:-https://raft.yunfanteo.world}"
REPO_URL="https://github.com/44sunsetsf/KVstorageBaseRaft-cpp.git"
REMOTE_DIR="raftkv"
IMAGE="raft-playground"
CONTAINER="raft-playground"
CADDY_SITES="goeuroops/deploy/sites"
DC="docker compose -f demo/deploy/docker-compose.prod.yml"

cd "$(dirname "$0")/../.."
say() { printf '\n▶ %s\n' "$*"; }
die() { printf '\n✗ %s\n' "$*" >&2; exit 1; }
remote() { ssh -o ConnectTimeout=15 "$HOST" "cd ~/$REMOTE_DIR && $*"; }

wait_healthy() {
  for _ in $(seq 1 40); do
    [ "$(ssh "$HOST" "docker inspect -f '{{.State.Health.Status}}' $CONTAINER" 2>/dev/null)" = healthy ] && return 0
    sleep 3
  done
  return 1
}

smoke() {
  # 新子域名第一次访问时 Caddy 要先签发 HTTPS 证书，头几秒可能连不上，所以重试一会儿
  code=000
  for _ in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$SMOKE_URL/api/healthz") || true
    [ "$code" = 200 ] && break
    sleep 3
  done
  [ "$code" = 200 ] || { echo "  $SMOKE_URL/api/healthz 返回 $code"; return 1; }
  python3 demo/tests/e2e.py "$SMOKE_URL"
}

rollback() {
  say "回滚到上一次部署前的镜像"
  remote "docker image inspect $IMAGE:prev >/dev/null 2>&1 && docker tag $IMAGE:prev $IMAGE:latest" || echo "  没有 :prev 镜像"
  remote "$DC up -d --no-build --force-recreate" >/dev/null 2>&1 || true
}

if [ "${1:-}" = rollback ]; then
  rollback
  wait_healthy && smoke && say "已回滚，站点正常" && exit 0
  die "回滚后站点仍不正常，请登录服务器查看：docker logs --tail 50 $CONTAINER"
fi

# ── 1. 本地和服务器对齐到同一个提交 ──────────────────────────────────────────────
[ -z "$(git status --porcelain)" ] || die "有未提交的改动，先提交"
git fetch -q origin
commit=$(git rev-parse HEAD)
[ "$commit" = "$(git rev-parse origin/main)" ] || die "本地 main 和 origin/main 不一致，先 git push"

ssh -o ConnectTimeout=15 "$HOST" "[ -d ~/$REMOTE_DIR/.git ] || git clone -q $REPO_URL ~/$REMOTE_DIR"
[ -z "$(remote 'git status --porcelain --untracked-files=no')" ] || die "服务器上的仓库有直接改过的文件，先确认：ssh $HOST 'cd ~/$REMOTE_DIR && git diff'"
deployed=$(remote "cat .deployed 2>/dev/null || true")
remote "git pull -q --ff-only"
[ "$(remote 'git rev-parse HEAD')" = "$commit" ] || die "服务器 git pull 后不是 ${commit:0:7}"

if [ -n "$deployed" ] && git cat-file -e "$deployed^{commit}" 2>/dev/null; then
  if ! git diff --name-only "$deployed" "$commit" | grep -qE '^(src/|example/|demo/|CMakeLists\.txt|\.dockerignore)'; then
    remote "echo $commit > .deployed"
    say "自上次部署（${deployed:0:7}）以来演示相关文件没有变化，无需重建"
    exit 0
  fi
fi
say "部署 ${commit:0:7}（上次：${deployed:0:7}）"

# ── 2. 本机构建 amd64 镜像并传到服务器 ──────────────────────────────────────────
say "本机构建 linux/amd64 镜像（第一次要几分钟，之后有缓存）"
docker buildx build --platform linux/amd64 -f demo/Dockerfile -t "$IMAGE:new" --load .
say "传到服务器"
docker save "$IMAGE:new" | gzip | ssh "$HOST" 'gunzip | docker load' >/dev/null
has_old=1
remote "docker image inspect $IMAGE:latest >/dev/null 2>&1" || has_old=0
remote "docker tag $IMAGE:latest $IMAGE:prev 2>/dev/null || true; docker tag $IMAGE:new $IMAGE:latest && docker rmi $IMAGE:new >/dev/null"

# ── 3. 第一次部署：安装 Caddy 站点配置 ──────────────────────────────────────────
if ! ssh "$HOST" "test -f ~/$CADDY_SITES/raft.caddy"; then
  say "安装 Caddy 站点配置 raft.caddy"
  ssh "$HOST" "cp ~/$REMOTE_DIR/demo/deploy/raft.caddy.example ~/$CADDY_SITES/raft.caddy"
fi

# ── 4. 重建容器、检查 ───────────────────────────────────────────────────────────
say "重建容器"
started=ok
remote "$DC up -d --no-build" >/dev/null 2>&1 || started=failed
if [ "$started" = ok ]; then
  ssh "$HOST" "docker exec goeuroops-caddy-1 caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && docker exec goeuroops-caddy-1 caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1" || started=failed
fi

if [ "$started" = ok ] && wait_healthy && smoke; then
  remote "echo $commit > .deployed; docker image prune -f >/dev/null"
  say "部署完成：${commit:0:7} 已上线，$SMOKE_URL 正常。回滚用 demo/deploy/deploy.sh rollback"
else
  [ "$has_old" = 1 ] || die "第一次部署没有通过检查，没有旧版本可以回滚，容器保持运行。日志：ssh $HOST 'docker logs --tail 80 $CONTAINER'"
  echo "✗ 新版本没有通过检查，自动回滚" >&2
  rollback
  wait_healthy && smoke && die "已回滚到旧版本，站点正常。新版本的日志：ssh $HOST 'docker logs --tail 80 $CONTAINER'"
  die "回滚后站点仍不正常，请立即登录服务器检查"
fi
