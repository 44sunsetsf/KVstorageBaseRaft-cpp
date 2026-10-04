"use strict";

/* ------------------------------------------------------------------ i18n */
const I18N = {
  en: {
    brand: "Raft playground",
    h1: "Five Raft nodes. Break them any way you like.",
    lead: "A key-value store written in C++ from the consensus layer up. Kill the leader, kill every node, then check whether any data went missing.",
    runTest: "Run failover test", runningTest: "Running…", seePerf: "See the numbers",
    cluster: "Cluster", term: "term", leader: "leader", follower: "follower", candidate: "candidate", paused: "paused", down: "down",
    selectNode: "Click a node to select it", nodeSelected: "Node {n} selected",
    kill: "Kill", start: "Start", pause: "Pause", resume: "Resume", wholeCluster: "Whole cluster",
    killLeader: "Kill the leader", killAll: "Kill all", restartAll: "Restart all", reset: "Wipe data",
    pauseHint: "Pause freezes the process (SIGSTOP), like a network partition or a long GC pause. When it resumes, the old leader learns it has been replaced.",
    logs: "Replicated logs", logsHint: "Each cell is one log entry. Filled means committed. The colour is the term it was written in.",
    kvTitle: "Key-value store", key: "Key", value: "Value", events: "What just happened",
    testTitle: "Failover test", perfTitle: "What changed, in numbers",
    perfLead: "The project I started from had no working persistence and waited for the next heartbeat before replicating every write. Same machine, same 3-node setup, median of 3 runs.",
    perfNote: "Measured with a C++ client against 3 nodes with fsync on, Docker on an Apple-silicon Mac. “Same settings” snapshots on almost every write, as the original did; “tuned” uses a 1 MB snapshot threshold.",
    bench: "Run a live benchmark here", benchRunning: "Running…",
    howTitle: "What is running here",
    footA: "Everything on this page talks to real processes: five ", footB: " programs in one container, driven over their own RPC protocol.",
    leaderLabel: "Leader", termLabel: "Term", upLabel: "Nodes up", node: "node",
    noLeader: "No leader right now. An election is running.",
    noQuorum: "No majority: {up} of {size} nodes are up and {q} are needed, so the cluster refuses reads and writes.",
    unreachable: "Cannot reach the demo server.",
    nodeUp: "node {n}", stale: "stale leader", downWord: "down", crashedWord: "crashed", pausedWord: "paused",
    evEmpty: "Nothing yet. Kill something.",
    ev_leader_elected: "Node {node} became leader for term {term}.", ev_elapsed: " No leader for {ms} ms.",
    ev_leader_lost: "Node {node} is no longer reachable as leader.",
    ev_election_started: "Node {node} started an election for term {term}.",
    ev_stepped_down: "Node {node} stepped down.",
    ev_node_killed: "Node {node} was killed (SIGKILL).", ev_node_started: "Node {node} started and replays its log.",
    ev_node_paused: "Node {node} was paused.", ev_node_resumed: "Node {node} resumed.", ev_node_crashed: "Node {node} crashed (exit {code}).",
    ev_snapshot: "Node {node} compacted its log up to index {index}.",
    ev_cluster_started: "All nodes started.", ev_cluster_killed: "All nodes were killed.", ev_cluster_restarted: "All nodes restarted.", ev_cluster_reset: "Data wiped, cluster restarted from scratch.",
    kvServed: "served by node {n}", kvTries: "{n} tries", kvMs: "{ms} ms",
    kvNoKey: "(no such key)", kvFail: "No answer: the cluster has no majority.",
    kvPut: "Put", kvAppend: "Append", kvGet: "Get",
    rate: "Too many requests, wait a moment.",
    stepPrepare: "Check the cluster is healthy", stepWrite: "Write {n} keys", stepKillLeader: "Kill the leader", stepWrite2: "Write {n} more keys with one node down",
    stepRead: "Read all {n} keys back", stepKillAll: "Kill every node", stepRestart: "Restart every node", stepRead2: "Read all {n} keys again after the full restart",
    dPrepare: "5 of 5 nodes up, node {l} leads.", dWrite: "{n} writes, average {ms} ms.",
    dKillLeader: "Node {old} killed. Node {neu} was elected for term {term} after {ms} ms.", dRead: "{ok} of {n} keys correct.",
    dKillAll: "0 of {size} nodes running.", dRestart: "Back after {ms} ms. Node {l} leads term {term}.",
    verdictOk: "Passed. 0 of {n} keys lost, in {s} s.", verdictBad: "Failed: {why}",
    whyTimeout: "timed out waiting for {what}", whyWrites: "a write was refused", whyKeys: "{bad} of {n} keys were wrong or missing",
    benchOut: "{ops} writes, {clients} clients, through this web gateway: {tp} ops/s · average {avg} ms · p99 {p99} ms",
    latTitle: "Write latency, one client", latSub: "300 sequential writes, lower is better", tpTitle: "Throughput, eight clients", tpSub: "800 concurrent writes, higher is better",
    rowOrig: "Original", rowSame: "Same settings", rowTuned: "Tuned",
    chg: [
      ["Persistence that persists", "Raft state and snapshots are written atomically and fsynced, then read back on start. Before, the files were truncated on every start, so a restart lost everything."],
      ["Replicate on write", "The leader sends new entries at once and batches concurrent ones, instead of waiting for the next 25 ms heartbeat."],
      ["Apply on commit", "The state machine is woken when the commit index moves, instead of polling every 10 ms."],
      ["A safer RPC layer", "Length-prefixed frames, full reads instead of one 1 KB recv, one call per connection at a time, no SIGPIPE crashes, and timeouts."],
      ["Bugs that testing found", "Append overwrote the value, snapshots restored every value as its key, and every client process shared one id so later writes were dropped as duplicates."],
      ["Something to look at", "A Status RPC exposes term, role, commit index and the log tail. That is what this page draws."],
    ],
    how: [
      ["Consensus", "Leader election with randomised timeouts, log replication, majority commit, snapshots and log compaction."],
      ["Storage", "A skip list is the state machine. Raft state and snapshots are fsynced to disk, so nodes recover after kill -9."],
      ["Own RPC and coroutines", "Protobuf services on a small RPC framework over muduo. Timers run on a fiber library with epoll and syscall hooks."],
      ["Exactly-once writes", "Clients tag requests with a client id and a request id. A retried write is applied only once."],
      ["This page", "A small Python gateway starts the nodes, injects failures (SIGKILL, SIGSTOP) and reads each node's state over RPC."],
    ],
  },
  zh: {
    brand: "Raft 演示台",
    h1: "五个 Raft 节点，随便怎么弄坏它。",
    lead: "一个从共识层开始用 C++ 写的 KV 存储。杀掉 leader，杀掉所有节点，然后看看数据有没有丢。",
    runTest: "运行故障测试", runningTest: "运行中…", seePerf: "看性能数据",
    cluster: "集群", term: "任期", leader: "leader", follower: "follower", candidate: "候选人", paused: "已暂停", down: "已停止",
    selectNode: "点一个节点来选中它", nodeSelected: "已选中节点 {n}",
    kill: "杀掉", start: "启动", pause: "暂停", resume: "恢复", wholeCluster: "整个集群",
    killLeader: "杀掉 leader", killAll: "全部杀掉", restartAll: "全部重启", reset: "清空数据",
    pauseHint: "“暂停”会冻结进程（SIGSTOP），相当于网络分区或一次很长的 GC 停顿。恢复后，旧 leader 会发现自己已被取代。",
    logs: "复制日志", logsHint: "每个格子是一条日志。实心表示已提交，颜色代表写入时的任期。",
    kvTitle: "键值存储", key: "键", value: "值", events: "刚刚发生了什么",
    testTitle: "故障测试", perfTitle: "改了什么，数据说话",
    perfLead: "我接手的项目没有真正可用的持久化，而且每次写入都要等下一次心跳才复制。同一台机器、同样的 3 节点配置，取 3 次中位数。",
    perfNote: "测试方法：C++ 客户端，3 个节点开启 fsync，Apple 芯片 Mac 上的 Docker。“同配置”指和原项目一样几乎每次写入都做快照；“调优后”使用 1 MB 的快照阈值。",
    bench: "在这里跑一次实时压测", benchRunning: "运行中…",
    howTitle: "这里跑的是什么",
    footA: "这个页面上的一切都连着真实进程：同一个容器里的五个 ", footB: " 程序，通过它们自己的 RPC 协议驱动。",
    leaderLabel: "Leader", termLabel: "任期", upLabel: "存活节点", node: "节点",
    noLeader: "现在没有 leader，正在选举。",
    noQuorum: "没有多数派：{size} 个节点里只有 {up} 个存活，需要 {q} 个，所以集群拒绝读写。",
    unreachable: "连不上演示服务器。",
    nodeUp: "节点 {n}", stale: "过期 leader", downWord: "已停止", crashedWord: "已崩溃", pausedWord: "已暂停",
    evEmpty: "还没有事件，去杀个节点试试。",
    ev_leader_elected: "节点 {node} 当选 leader，任期 {term}。", ev_elapsed: "期间 {ms} ms 没有 leader。",
    ev_leader_lost: "节点 {node} 作为 leader 已不可达。",
    ev_election_started: "节点 {node} 发起了任期 {term} 的选举。",
    ev_stepped_down: "节点 {node} 退位了。",
    ev_node_killed: "节点 {node} 被杀掉（SIGKILL）。", ev_node_started: "节点 {node} 启动，正在重放日志。",
    ev_node_paused: "节点 {node} 被暂停。", ev_node_resumed: "节点 {node} 已恢复。", ev_node_crashed: "节点 {node} 崩溃了（退出码 {code}）。",
    ev_snapshot: "节点 {node} 把日志压缩到了下标 {index}。",
    ev_cluster_started: "所有节点已启动。", ev_cluster_killed: "所有节点都被杀掉了。", ev_cluster_restarted: "所有节点已重启。", ev_cluster_reset: "数据已清空，集群从头开始。",
    kvServed: "由节点 {n} 处理", kvTries: "试了 {n} 次", kvMs: "{ms} ms",
    kvNoKey: "（没有这个键）", kvFail: "没有响应：集群没有多数派。",
    kvPut: "Put", kvAppend: "Append", kvGet: "Get",
    rate: "请求太频繁，稍等一下。",
    stepPrepare: "确认集群状态正常", stepWrite: "写入 {n} 个键", stepKillLeader: "杀掉 leader", stepWrite2: "少一个节点的情况下再写 {n} 个键",
    stepRead: "读回全部 {n} 个键", stepKillAll: "杀掉所有节点", stepRestart: "重启所有节点", stepRead2: "完全重启后再读回全部 {n} 个键",
    dPrepare: "5 个节点都在线，节点 {l} 是 leader。", dWrite: "写入 {n} 次，平均 {ms} ms。",
    dKillLeader: "杀掉节点 {old}。{ms} ms 后节点 {neu} 当选，任期 {term}。", dRead: "{n} 个键中 {ok} 个正确。",
    dKillAll: "{size} 个节点里 0 个在运行。", dRestart: "{ms} ms 后恢复。节点 {l} 是任期 {term} 的 leader。",
    verdictOk: "通过。{n} 个键一个都没丢，用时 {s} 秒。", verdictBad: "失败：{why}",
    whyTimeout: "等待{what}超时", whyWrites: "有写入被拒绝", whyKeys: "{n} 个键里有 {bad} 个错误或丢失",
    benchOut: "{ops} 次写入，{clients} 个客户端，经过这个网页网关：{tp} ops/s · 平均 {avg} ms · p99 {p99} ms",
    latTitle: "写入延迟（单客户端）", latSub: "300 次串行写入，越低越好", tpTitle: "吞吐（8 个客户端）", tpSub: "800 次并发写入，越高越好",
    rowOrig: "原项目", rowSame: "同配置", rowTuned: "调优后",
    chg: [
      ["持久化真的落盘", "Raft 状态和快照原子写入并 fsync，启动时读回。原来每次启动都会清空文件，重启后数据全丢。"],
      ["写入后立即复制", "leader 收到命令马上发给 follower，并发的命令合并成一批，不再等下一个 25 ms 心跳。"],
      ["提交后立即应用", "commitIndex 推进时直接唤醒状态机，不再每 10 ms 轮询一次。"],
      ["更可靠的 RPC 层", "带长度前缀的报文帧，收满整个响应而不是只读一次 1 KB，同一连接同时只有一个调用，不再因 SIGPIPE 崩溃，并加了超时。"],
      ["测试发现的 bug", "Append 实际是覆盖；快照恢复后每个 value 都变成 key；所有客户端进程共用同一个 id，后启动的客户端的写入被当成重复请求丢弃。"],
      ["让内部状态可见", "新增 Status RPC，返回 term、角色、commit 下标和日志末尾。这个页面画的就是它。"],
    ],
    how: [
      ["共识", "随机超时的 leader 选举、日志复制、多数派提交、快照与日志压缩。"],
      ["存储", "跳表作为状态机。Raft 状态和快照 fsync 落盘，节点 kill -9 后可以恢复。"],
      ["自研 RPC 与协程", "基于 muduo 的 Protobuf RPC 小框架；定时器跑在带 epoll 和系统调用 hook 的协程库上。"],
      ["写入恰好执行一次", "客户端给请求带上 client id 和 request id，重试的写入只会被执行一次。"],
      ["这个页面", "一个小型 Python 网关负责启动节点、注入故障（SIGKILL、SIGSTOP），并通过 RPC 读取各节点状态。"],
    ],
  },
};

const PERF = {
  latency: [["rowOrig", 24.0], ["rowSame", 5.0], ["rowTuned", 2.0]],
  throughput: [["rowOrig", 165], ["rowSame", 196], ["rowTuned", 536]],
};

/* ------------------------------------------------------------------ helpers */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const NS = "http://www.w3.org/2000/svg";
const termColor = (t) => `var(--t${((Math.max(1, t) - 1) % 6) + 1})`;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: ignore */ } },
};
let lang = store.get("lang") || ((navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en");

function t(key, params = {}) {
  const s = (I18N[lang][key] ?? I18N.en[key] ?? key);
  return typeof s === "string" ? s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? "")) : s;
}
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg; el.setAttribute("role", "status");
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch (e) { /* non-JSON error page */ }
  data._status = res.status;
  return data;
}

// The gateway rate-limits per IP. A burst of test traffic can hit it, so the test waits and retries instead of reporting a false failure.
async function apiRetry(path, body) {
  let r;
  for (let i = 0; i < 8; i++) {
    r = await api(path, body);
    if (r._status !== 429) return r;
    await sleep(800);
  }
  return r;
}

/* ------------------------------------------------------------------ state */
const S = { snap: null, since: 0, events: [], selected: null, prevLast: {}, testRunning: false, kvHistory: [], ringBuilt: false };

function applyLang() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $("#lang").textContent = lang === "zh" ? "English" : "中文";
  $("#sel-title").textContent = S.selected === null ? t("selectNode") : t("nodeSelected", { n: S.selected });
  renderCharts(); renderLists();
  if (S.snap) { renderAll(); renderEvents(true); }
  renderKvLog();
}

/* ------------------------------------------------------------------ static content */
function renderCharts() {
  const bars = (el, titleKey, subKey, rows, unit, fmt) => {
    const max = Math.max(...rows.map((r) => r[1]));
    el.innerHTML = `<h3>${esc(t(titleKey))}</h3><p class="sub">${esc(t(subKey))}</p>` + rows.map((r, i) =>
      `<div class="bar${i === rows.length - 1 ? " best" : ""}"><span class="lab">${esc(t(r[0]))}</span><span class="track"><span class="fill" style="width:${(r[1] / max) * 100}%"></span></span><span class="val">${fmt(r[1])} ${unit}</span></div>`).join("");
  };
  bars($("#chart-latency"), "latTitle", "latSub", PERF.latency, "ms", (v) => v.toFixed(1));
  bars($("#chart-throughput"), "tpTitle", "tpSub", PERF.throughput, "ops/s", (v) => Math.round(v));
}
function renderLists() {
  $("#changes").innerHTML = t("chg").map(([a, b]) => `<li><b>${esc(a)}</b><span>${esc(b)}</span></li>`).join("");
  $("#how-list").innerHTML = t("how").map(([a, b]) => `<li><b>${esc(a)}</b><span>${esc(b)}</span></li>`).join("");
}

/* ------------------------------------------------------------------ ring */
const CX = 260, CY = 218, R = 150, NR = 34;
function nodePos(i, n) { const a = (-90 + (360 / n) * i) * Math.PI / 180; return [CX + R * Math.cos(a), CY + R * Math.sin(a)]; }
function svg(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}
function buildRing(n) {
  const g = $("#nodes"); g.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const [x, y] = nodePos(i, n);
    const grp = svg("g", { class: "node follower", "data-id": i, transform: `translate(${x} ${y})`, tabindex: 0, role: "button", "aria-label": `node ${i}` }, g);
    svg("circle", { class: "halo", r: NR + 9 }, grp);
    svg("circle", { class: "flash", r: NR }, grp);
    svg("circle", { class: "body", r: NR }, grp);
    const id = svg("text", { class: "nid", y: 1 }, grp); id.textContent = i;
    const above = y < CY - 40;
    svg("text", { class: "role", y: above ? -NR - 20 : NR + 18 }, grp);
    svg("text", { class: "tag", y: above ? -NR - 6 : NR + 32 }, grp);
    grp.addEventListener("click", () => selectNode(i));
    grp.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectNode(i); } });
  }
  S.ringBuilt = true;
}
function selectNode(i) {
  S.selected = S.selected === i ? null : i;
  $("#sel-title").textContent = S.selected === null ? t("selectNode") : t("nodeSelected", { n: S.selected });
  renderRing(); renderButtons();
}
function roleWord(n) {
  if (n.proc === "stopped") return t("downWord");
  if (n.proc === "crashed") return t("crashedWord");
  if (n.proc === "paused") return t("pausedWord");
  if (!n.status) return "…";
  if (n.stale) return t("stale");
  return t(n.status.role);
}
function renderRing() {
  const s = S.snap; if (!s) return;
  if (!S.ringBuilt || $$("#nodes .node").length !== s.size) buildRing(s.size);
  $$("#nodes .node").forEach((el, i) => {
    const n = s.nodes[i], st = n.status;
    let cls = "node";
    if (n.proc === "stopped" || n.proc === "crashed") cls += " down";
    else if (n.proc === "paused") cls += " paused";
    else if (st) cls += n.stale ? " leader stale" : " " + st.role;
    else cls += " follower";
    if (S.selected === i) cls += " selected";
    if (el.classList.contains("flashing")) cls += " flashing";
    el.setAttribute("class", cls);
    $(".role", el).textContent = roleWord(n);
    $(".tag", el).textContent = st ? `t${st.term} · #${st.lastLogIndex}` : "";
    // a follower whose log just grew gets a ring pulse: that is replication arriving
    const last = st ? st.lastLogIndex : null, prev = S.prevLast[i];
    if (st && prev !== undefined && prev !== null && last > prev && st.role !== "leader") {
      el.classList.remove("flashing"); void el.getBoundingClientRect(); el.classList.add("flashing");
      setTimeout(() => el.classList.remove("flashing"), 750);
    }
    S.prevLast[i] = last;
  });
  // spokes: leader -> followers, only while there is a leader
  const sp = $("#spokes"); sp.innerHTML = "";
  if (s.leader >= 0) {
    const [lx, ly] = nodePos(s.leader, s.size);
    s.nodes.forEach((n, i) => {
      if (i === s.leader || n.proc !== "running" || !n.reachable) return;
      const [x, y] = nodePos(i, s.size);
      svg("line", { class: "spoke", x1: lx, y1: ly, x2: x, y2: y }, sp);
    });
  }
  $("#center-term").textContent = s.leader >= 0 ? s.term : (s.term || "–");
  $("#center-sub").textContent = s.leader >= 0 ? `${t("node")} ${s.leader}` : "";
}
function renderButtons() {
  const s = S.snap;
  const n = s && S.selected !== null ? s.nodes[S.selected] : null;
  const can = { kill: n && (n.proc === "running" || n.proc === "paused"), start: n && (n.proc === "stopped" || n.proc === "crashed"), pause: n && n.proc === "running", resume: n && n.proc === "paused" };
  $$("[data-needs-node]").forEach((b) => { b.disabled = S.testRunning || !can[b.dataset.act]; });
  $$(".actions [data-act]:not([data-needs-node])").forEach((b) => { b.disabled = S.testRunning; });
}
function renderStatus() {
  const s = S.snap, el = $("#status-line");
  if (!s) return;
  const q = s.quorum;
  let html = `<span class="pill">${esc(t("leaderLabel"))} <b>${s.leader >= 0 ? s.leader : "–"}</b></span><span class="pill">${esc(t("termLabel"))} <b>${s.term || "–"}</b></span><span class="pill">${esc(t("upLabel"))} <b>${s.reachable}/${s.size}</b></span>`;
  if (s.reachable < q) html = `<span class="bad">${esc(t("noQuorum", { up: s.reachable, size: s.size, q }))}</span>`;
  else if (s.leader < 0) html += `<span>${esc(t("noLeader"))}</span>`;
  el.innerHTML = html;
}

/* ------------------------------------------------------------------ tapes */
function renderTapes() {
  const s = S.snap; if (!s) return;
  const host = $("#tapes");
  if (host.children.length !== s.size) host.innerHTML = s.nodes.map(() => `<div class="tape"><div class="tape-label"></div><div class="cells"></div></div>`).join("");
  s.nodes.forEach((n, i) => {
    const row = host.children[i], st = n.status;
    row.className = "tape" + (st ? "" : " off");
    const role = n.proc === "running" && st ? (n.stale ? t("stale") : t(st.role)) : roleWord(n);
    $(".tape-label", row).innerHTML = `<b>n${i}</b><span class="${st && st.role === "leader" && !n.stale ? "r-leader" : ""}">${esc(role)}</span>`;
    const cells = $(".cells", row);
    if (!st) { cells.innerHTML = `<span class="empty">–</span>`; return; }
    let html = "";
    if (st.snapshotIndex > 0) html += `<span class="cell snap" title="snapshot @${st.snapshotIndex}">◆ ${st.snapshotIndex}</span>`;
    else if (!st.tail.length) html += `<span class="empty">${esc(lang === "zh" ? "空" : "empty")}</span>`;
    for (const e of st.tail) {
      const done = e.i <= st.commitIndex;
      html += `<span class="cell${done ? " done" : ""}" style="--tc:${termColor(e.t)}" title="#${e.i} · term ${e.t}${e.s ? " · " + esc(e.s) : ""}${done ? "" : (lang === "zh" ? " · 尚未确认提交" : " · not yet known to be committed")}">${e.i}</span>`;
    }
    cells.innerHTML = html;
  });
}

/* ------------------------------------------------------------------ events */
function fmtTime(ts) { const d = new Date(ts * 1000); return d.toTimeString().slice(0, 8); }
function eventHtml(e) {
  const p = Object.assign({ node: e.node }, e.params || {});
  let text = t("ev_" + e.kind, p), cls = "";
  if (e.kind === "leader_elected") {
    cls = "k-leader";
    if (p.elapsedMs !== null && p.elapsedMs !== undefined && p.elapsedMs > 0) text += `<span class="ms">${t("ev_elapsed", { ms: p.elapsedMs }).replace(/^ /, " ")}</span>`;
    else text = esc(text);
  } else { text = esc(text); }
  if (["node_killed", "node_crashed", "cluster_killed", "leader_lost"].includes(e.kind)) cls = "k-bad";
  return `<li><time>${fmtTime(e.ts)}</time><span class="${cls}">${text}</span></li>`;
}
function renderEvents(force) {
  const ul = $("#event-list");
  if (!S.events.length) { ul.innerHTML = `<li class="event-empty">${esc(t("evEmpty"))}</li>`; return; }
  ul.innerHTML = S.events.slice().reverse().slice(0, 60).map(eventHtml).join("");
}

function renderAll() { renderRing(); renderStatus(); renderTapes(); renderButtons(); }

/* ------------------------------------------------------------------ polling */
let pollMs = 450, pollTimer = null;
async function poll() {
  try {
    const r = await fetch(`/api/state?since=${S.since}`, { cache: "no-store" });
    if (r.status === 429) { /* briefly rate limited: just skip this tick */ }
    else if (r.ok) {
      const snap = await r.json();
      S.snap = snap; S.since = snap.lastEvent;
      if (snap.events.length) { S.events.push(...snap.events); S.events = S.events.slice(-120); renderEvents(); }
      renderAll();
    }
  } catch (e) {
    $("#status-line").innerHTML = `<span class="bad">${esc(t("unreachable"))}</span>`;
  }
  pollTimer = setTimeout(poll, pollMs);
}

/* ------------------------------------------------------------------ chaos + kv */
async function chaos(action, node) {
  const r = await api("/api/chaos", { action, node });
  if (r._status === 429) toast(t("rate"));
  return r;
}
function renderKvLog() {
  $("#kv-log").innerHTML = S.kvHistory.map((h) => `<li><span class="cmd">${esc(h.cmd)}</span><span class="res${h.bad ? " bad" : ""}">${esc(h.res)}</span><span class="meta">${esc(h.meta)}</span></li>`).join("");
}
async function doKv(op) {
  const key = $("#kv-key").value.trim(), value = $("#kv-value").value;
  if (!key) { $("#kv-key").focus(); return; }
  const r = await api("/api/kv", { op, key, value });
  const opName = t(op === "put" ? "kvPut" : op === "append" ? "kvAppend" : "kvGet");
  const cmd = op === "get" ? `${opName} ${key}` : `${opName} ${key} ${op === "append" ? "+=" : "="} "${value}"`;
  let entry;
  if (r._status === 429) { toast(t("rate")); return; }
  if (r.ok) {
    const meta = [t("kvServed", { n: r.leader }), t("kvMs", { ms: r.latencyMs })];
    if (r.attempts > 1) meta.push(t("kvTries", { n: r.attempts }));
    entry = { cmd, res: op === "get" ? (r.err === "ErrNoKey" ? t("kvNoKey") : `"${r.value}"`) : "OK", meta: meta.join(" · ") };
  } else {
    entry = { cmd, res: r.err === "NoQuorum" ? t("kvFail") : (r.err || "error"), meta: "", bad: true };
  }
  S.kvHistory.unshift(entry); S.kvHistory = S.kvHistory.slice(0, 7);
  renderKvLog();
}

/* ------------------------------------------------------------------ failover test */
const sec = (ms) => (ms / 1000).toFixed(1);
async function waitFor(pred, timeoutMs) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    if (S.snap && pred(S.snap)) return performance.now() - t0;
    await sleep(40);
  }
  return null;
}
function stepRow(list, key, params) {
  const li = document.createElement("li");
  li.className = "wait";
  li.innerHTML = `<span class="st-icon"></span><div><div class="st-title">${esc(t(key, params))}</div><div class="st-detail"></div></div>`;
  list.appendChild(li);
  return {
    run() { li.className = "run"; li.scrollIntoView({ block: "nearest", behavior: "smooth" }); },
    ok(detail) { li.className = "ok"; $(".st-icon", li).textContent = "✓"; $(".st-detail", li).innerHTML = detail; },
    fail(detail) { li.className = "fail"; $(".st-icon", li).textContent = "✕"; $(".st-detail", li).innerHTML = detail; },
  };
}
const bold = (x) => `<b>${esc(x)}</b>`;

async function runFailover() {
  if (S.testRunning) return;
  S.testRunning = true; renderButtons();
  const btn = $("#run-test"); btn.disabled = true; btn.textContent = t("runningTest");
  const box = $("#test"); box.hidden = false;
  const list = $("#test-steps"); list.innerHTML = "";
  const summary = $("#test-summary"); summary.textContent = "";
  box.scrollIntoView({ behavior: "smooth", block: "start" });
  pollMs = 200;
  const T0 = performance.now();
  const N1 = 10, N2 = 5, N = N1 + N2;
  const id = Math.random().toString(36).slice(2, 6);
  const keys = [];
  const rows = [
    stepRow(list, "stepPrepare"), stepRow(list, "stepWrite", { n: N1 }), stepRow(list, "stepKillLeader"),
    stepRow(list, "stepWrite2", { n: N2 }), stepRow(list, "stepRead", { n: N }), stepRow(list, "stepKillAll"),
    stepRow(list, "stepRestart"), stepRow(list, "stepRead2", { n: N }),
  ];
  const fail = (row, why) => { row.fail(esc(why)); summary.innerHTML = `<span class="verdict-bad">${esc(t("verdictBad", { why }))}</span>`; };
  const writeKeys = async (from, count) => {
    let total = 0;
    for (let i = from; i < from + count; i++) {
      const k = `ft-${id}-${i}`, v = `value-${i}`;
      const r = await apiRetry("/api/kv", { op: "put", key: k, value: v });
      if (!r.ok) return null;
      keys.push([k, v]); total += r.latencyMs;
    }
    return total / count;
  };
  const readAll = async () => {
    let ok = 0;
    for (const [k, v] of keys) {
      const r = await apiRetry(`/api/kv?key=${encodeURIComponent(k)}`);
      if (r.ok && r.value === v) ok++;
    }
    return ok;
  };
  const healthy = (s) => s.leader >= 0 && s.reachable === s.size;
  try {
    // 0. make sure we start from a healthy cluster
    let r = rows[0]; r.run();
    if (!(S.snap && healthy(S.snap))) {
      for (const n of S.snap ? S.snap.nodes : []) if (n.proc === "paused") await chaos("resume", n.id);
      await chaos("start_all");
      if ((await waitFor(healthy, 12000)) === null) return fail(r, t("whyTimeout", { what: t("leaderLabel") }));
    }
    r.ok(t("dPrepare", { l: S.snap.leader }));

    // 1. write
    r = rows[1]; r.run();
    let avg = await writeKeys(1, N1);
    if (avg === null) return fail(r, t("whyWrites"));
    r.ok(t("dWrite", { n: N1, ms: avg.toFixed(1) }));

    // 2. kill the leader and time the election
    r = rows[2]; r.run();
    const oldLeader = S.snap.leader, evBefore = S.since, tKill = performance.now();
    await chaos("kill_leader");
    const gap = await waitFor((s) => s.leader >= 0 && s.leader !== oldLeader, 10000);
    if (gap === null) return fail(r, t("whyTimeout", { what: t("leaderLabel") }));
    const ev = S.events.find((e) => e.id > evBefore && e.kind === "leader_elected" && e.params && e.params.elapsedMs);
    r.ok(t("dKillLeader", { old: oldLeader, neu: S.snap.leader, term: S.snap.term, ms: ev ? ev.params.elapsedMs : Math.round(performance.now() - tKill) }).replace(/(\d+) ms/, "<span class=\"ms\">$1 ms</span>"));

    // 3. write with 4 of 5 nodes
    r = rows[3]; r.run();
    avg = await writeKeys(N1 + 1, N2);
    if (avg === null) return fail(r, t("whyWrites"));
    r.ok(t("dWrite", { n: N2, ms: avg.toFixed(1) }));

    // 4. read back
    r = rows[4]; r.run();
    let ok = await readAll();
    if (ok !== N) return fail(r, t("whyKeys", { bad: N - ok, n: N }));
    r.ok(t("dRead", { ok, n: N }));

    // 5. kill everything
    r = rows[5]; r.run();
    await chaos("kill_all");
    if ((await waitFor((s) => s.reachable === 0, 6000)) === null) return fail(r, t("whyTimeout", { what: t("upLabel") }));
    r.ok(t("dKillAll", { size: S.snap.size }));

    // 6. restart everything
    r = rows[6]; r.run();
    const tRestart = performance.now();
    await chaos("start_all");
    if ((await waitFor(healthy, 15000)) === null) return fail(r, t("whyTimeout", { what: t("leaderLabel") }));
    r.ok(t("dRestart", { ms: Math.round(performance.now() - tRestart), l: S.snap.leader, term: S.snap.term }).replace(/(\d+) ms/, "<span class=\"ms\">$1 ms</span>"));

    // 7. read back again: this only passes if state survived on disk
    r = rows[7]; r.run();
    ok = await readAll();
    if (ok !== N) return fail(r, t("whyKeys", { bad: N - ok, n: N }));
    r.ok(t("dRead", { ok, n: N }));
    summary.innerHTML = `<span class="verdict-ok">${esc(t("verdictOk", { n: N, s: sec(performance.now() - T0) }))}</span>`;
  } finally {
    S.testRunning = false; pollMs = 450;
    btn.disabled = false; btn.textContent = t("runTest"); renderButtons();
  }
}

/* ------------------------------------------------------------------ benchmark */
async function runBench() {
  const b = $("#bench"), out = $("#bench-out");
  b.disabled = true; b.textContent = t("benchRunning"); out.textContent = "";
  const r = await api("/api/bench", { ops: 200, clients: 4 });
  b.disabled = false; b.textContent = t("bench");
  if (r._status === 429) { out.textContent = t("rate"); return; }
  if (!r.ok) { out.textContent = r.err || "error"; return; }
  out.textContent = t("benchOut", { ops: r.ops, clients: r.clients, tp: r.opsPerSec, avg: r.avgMs, p99: r.p99Ms });
}

/* ------------------------------------------------------------------ wiring */
$("#lang").addEventListener("click", () => { lang = lang === "zh" ? "en" : "zh"; store.set("lang", lang); applyLang(); });
$("#run-test").addEventListener("click", runFailover);
$("#bench").addEventListener("click", runBench);
$$(".actions [data-act]").forEach((b) => b.addEventListener("click", async () => {
  const act = b.dataset.act;
  await chaos(act, b.hasAttribute("data-needs-node") ? S.selected : undefined);
}));
$("#kv-form").addEventListener("submit", (e) => { e.preventDefault(); doKv("put"); });
$$("[data-op]").forEach((b) => { if (b.type === "button") b.addEventListener("click", () => doKv(b.dataset.op)); });

applyLang();
poll();
