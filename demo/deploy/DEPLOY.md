# 公网部署（与 GoEuroOps、Vparser 共用一台小服务器）

演示服务器只有 2 vCPU / 1.6 GiB，三个站点共用，HTTPS 由 GoEuroOps 的 Caddy 统一提供。
Raft 演示是一个容器：5 个 `raftNode` 进程 + Python 网关 + 网页。实测常驻内存约 30 MB、空闲 CPU 约 5%，
`docker-compose.prod.yml` 给它 128 MB（不占 swap）和半个核的上限。

| 地址 | 内容 |
|---|---|
| `https://raft.<SITE_ADDRESS>` | 演示页面（公开；滥用由网关限流和数据量上限兜底） |

## 前提

GoEuroOps 已按它的 `deploy/DEPLOY.md` 部署好（提供 Caddy 和 `goeuroops_default` 网络）。

## 日常更新

在自己电脑的仓库根目录运行（先提交并推送）：

```bash
demo/deploy/deploy.sh             # 构建、部署、从公网跑端到端测试
demo/deploy/deploy.sh rollback    # 换回上一次部署前的镜像
```

脚本在本机构建 linux/amd64 镜像（服务器上不构建），用 `docker save | ssh docker load` 传过去，
旧的 `:latest` 记为 `:prev`。第一次部署还会克隆仓库到 `~/raftkv`、把 `raft.caddy.example` 装成
`~/goeuroops/deploy/sites/raft.caddy` 并 reload Caddy。容器健康后，脚本对公网地址运行 `demo/tests/e2e.py`：
写入数据、杀 leader、杀掉全部节点并重启、核对数据，任何一步失败都会自动回滚。

## 注意

- 演示的数据放在命名卷 `raft-data` 里，重新部署不会丢；页面上的“Wipe data”会清空它。
- 网关在全部节点停止超过 90 秒后会自动把它们重启，所以访客把集群杀光也不会一直坏着。
- 在 Mac 上构建 amd64 镜像要走模拟，第一次要几分钟；之后有层缓存，只改网页或网关时很快。
