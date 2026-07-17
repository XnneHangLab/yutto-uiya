# yutto-uiya serve 迁移计划（feat/serve-pipeline）

目标：**废弃「yutto CLI 子进程 + Rust 抓 Logger 日志」的旧管线**，改为常驻 `yutto serve`（JSON-RPC over WebSocket）驱动真正的 parse → 可视化勾选 → download 流程。

本文件只是计划，不含实现。实现与上游 yutto 的 resolve PR（yutto 仓库本地分支 `feat/resolve-verb`：`resolve.start` / `item_listed` / `ResolvedItem`）同步进行，两边 PR 同时开发、互相验证出 serve 与前端的最佳实践。

## 前置条件

- [ ] 上游 yutto-dev/yutto#748 合并（core / runtime / server + `EpisodeData` info/data 拆分已包含）
- [ ] resolve verb PR 提交并合并（本地已就绪，含端到端参考客户端 `D:\lab\yuttos\verify_resolve_rpc.py`）

## 分支结构

- 母分支：`feat/serve-pipeline`（本分支）——各阶段分支完成后 PR 汇入这里，
  全部阶段合完后母分支整体 PR 进 `dev`。
- 阶段分支：从母分支切出，命名 `feat/serve-phase-<N>-<主题>`
  （如阶段 1 → `feat/serve-phase-1-lifecycle`）。
- 当前策略：只建本地分支，**不 push、不开 PR**——时机由用户另行决定。

## 阶段 1：server 生命周期（Rust）

设计原则：**用户不需要知道 server 的存在**。exe 打开即自动拉起 serve、关闭即随之退出；
serve 在 UI 里只是侧边栏的一个环境项（状态 + 地址），像 uv sync / 登录一样可一键重启。

- 新增 Tauri 命令 `serve_start` / `serve_stop`；**应用启动时（环境检查链之后）自动调用
  `serve_start`**，复用现有 uv 启动机制拉起
  `yutto serve --port 0 --download-root <resolve_download_dir(uiya.toml)> --allow-origin <tauri 与 dev origin>`；
  `YUTTO_SERVER_TOKEN` 由 Rust 生成并注入子进程环境，命令返回 `{url, token}` 给前端。
- 端口与多开：`--port 0` 由 OS 分配空闲端口（默认 11223 固定端口会让第二个实例绑定失败），
  server 会把实际端口打印为「yutto server 正在监听 ws://…」（stdout），Rust 解析这一行
  拿到真实地址——bootstrap 阶段唯一一次日志解析。多开采用**一对一**：每个 uiya 实例
  独占自己的 serve，无端口冲突、无发现协议、无归属歧义、exe 升级后无新旧版本混用；
  代价约 60MB 内存/实例。已知非回归：两个实例往同一目录下载同一视频仍可能文件冲突，
  与今天开两个 CLI 行为相同。
- 退出即杀（双保险）：
  - 优雅路径：Tauri 退出事件 → `serve_stop` → 现有 `kill_process`
    （Windows `taskkill /T /F` 杀整棵进程树）；
  - 崩溃兜底：Windows Job Object（kill-on-close）——uiya 崩溃或被任务管理器强杀时
    由 OS 自动回收 serve，不留孤儿进程，且无需改动 yutto 侧。
- 环境项 UI：侧边栏新增 serve 字段，状态机
  `starting / running(ws://…) / crashed(退出码) / restarting`；重启按钮复用
  uv sync / 登录 的交互模式，行为 = `serve_stop` + `serve_start`。注意重启后端口与
  token 都是新的，前端必须用 `serve_start` 返回的新 `{url, token}` 重新握手；
  有任务进行中时重启前 UI 需提示。崩溃**暂不自动重启**：红色 crashed 状态 + 重启按钮
  即恢复路径，自动重启（带退避）等有真实崩溃数据再考虑。
- server 的 stdout 继续接入现有控制台日志页（raw-log 通道保留——「Rust 抓日志」只剩
  展示 + bootstrap 地址解析两个用途，不再承担数据传输）。
- 附注：设置里修改下载目录**不需要**重启 serve——阶段 4 的每个 `download.start` 都带
  `output.directory`，`--download-root` 只是缺省值。

## 阶段 2：协议客户端（TS）

- 新增 `src/services/yutto/rpc.ts`：webview 内原生 WebSocket + JSON-RPC 2.0
  （`server.authenticate` → 请求/通知分流；参考 verify_resolve_rpc.py 的 Python 实现）。
- 适配层把 `task.event` 翻译成现有 `RuntimeEvent` 形状：
  `item_listed` → `parse.item`（`VideoParseItem`）、`progress` → `download.file_progress`、
  runtime `state` → `download.started/completed/failed`。**reducers 与页面零改动**。

## 阶段 3：解析管线替换

- `parseUrl()` 改为 `resolve.start` + 订阅 `item_listed`：
  `VideoParseItem{title, url(原子URL), dir=planned_path 的父目录, cover=cover_url, ...}`。
- 删除：fork 的 `--skip-download` 调用、`_ParseContext` 正则扫日志、`ast.literal_eval`
  描述文件行、下载目录快照 diff 启发式。
- 清晰度选项改为静态清单（yutto 下载端本就自动降级），删除 label→code 映射表。

## 阶段 4：下载管线替换

- 勾选后逐条 `download.start`：
  `{source:{url: 原子URL}, resources/stream ← DownloadOptions, output:{directory: planned_path 父目录}}`。
- 队列页数据源换成 `task.list` / `task.subscribe`；产物路径来自 `ItemResult.artifacts`
  （删除 rglob 猜产物）。
- 已知设计点（与上游 resolve PR 一起定最佳实践）：批量解析的 planned_path 与单集下载
  实际文件名可能有模板差异（batch 模板 vs 单集 `{auto}` 模板）；wire 路径分隔符跟随
  server 所在 OS，客户端需归一化。

## 阶段 5：清理

- 死代码退役：`parse` / `download` 命令已随阶段 3/4 删除；本阶段清掉残余 ——
  `fetch-meta` 全链路（python cmd + Rust command + bridge，前端无调用方）、
  `_dataclass.py`（旧 CLI args 生成器，含 `--skip-download`）及其测试。
- 依赖现状（2026-07-17 核实）：**暂时无法换到上游 yutto** —— 上游 serve 只暴露
  `download.start`，`resolve.start`（解析管线的根基）还只在 fork 里（上游 PR 暂停中）。
  且 PyPI 的 `uiya-yutto==0.1.0` **不含 server 包**（发布早于 #748），当前 serve 架构
  只在 dev 环境（本地 yutto checkout 链接进 venv）可用。合入 dev / 发版前必须从
  fork dev 发布 `uiya-yutto 0.2.0`（带 serve + resolve verb）并把 pyproject 依赖升上去；
  等 resolve verb 上游化后再执行「换上游 yutto」。
- 暂留：`auth-login`（import 方式 + auth 文件互操作，等上游 `auth.*` RPC）、
  `fetch-cover`（webview 防盗链取图是前端职责）、wav 转码、`inspect-runtime` / 设置。

## 阶段 6：文档

迁移改变了不少用户可见行为，合入 dev 前把文档追平：

- `docs/guide/settings.md`：serve 状态行与一键重启入口；「保存并重新检测」会**重启
  serve 并中断进行中的解析/下载**（设置页有琥珀色提示）；「解析并发数」逐请求生效
  （上限 16，改完即用不需重启）；下载目录/ffmpeg/python 变更随保存自动重启生效。
- 下载管理指南（新页或并入快速开始）：队列串行执行（服务端单 worker，天然防风控）、
  卡片阶段行（解析中/写入附件/下载中/后处理中）与字节级实时进度条、批量共用一套
  下载选项（troubleshooting/quality-auto-downgrade 已先行覆盖画质部分）。
- 常见问题：serve 启动失败排查（对应侧边栏重启按钮）；仅音频 mp3/flac 已自动转码
  （旧版会合并失败）。
- README / 截图核对：队列卡片、设置页新增项与当前 UI 一致。
