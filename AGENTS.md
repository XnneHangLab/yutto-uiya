# AGENTS.md

yutto-uiya 是基于 Tauri 2 的 Bilibili 视频下载器桌面客户端，前端 React + TypeScript，后端 Rust，下载核心通过 Python 子进程调用 yutto。

## 项目结构

```
yutto-uiya/
├── src/                          # React 前端 (TypeScript)
│   ├── app/                      #   路由 (routes.tsx)
│   ├── components/               #   UI 组件 (按功能分目录)
│   ├── layouts/AppShell/         #   主布局，全局状态管理中心
│   ├── pages/                    #   页面组件 (Settings, Download, Console 等)
│   ├── services/
│   │   ├── runtime/bridge.ts     #   Tauri invoke 封装 (前端↔Rust 的全部 IPC 在这里)
│   │   ├── runtime/runtime.ts    #   TypeScript 类型定义 (RuntimeInspection 等)
│   │   └── ...
│   └── styles/                   #   全局 CSS
├── src-tauri/                    # Rust 后端 (Tauri 2)
│   ├── src/lib.rs                #   Tauri 入口，命令注册
│   └── src/runtime/
│       ├── commands.rs           #   Tauri 命令 (#[tauri::command])
│       ├── process.rs            #   Python 子进程调用、文件选择对话框
│       ├── state.rs              #   RuntimeState 全局状态、配置读写
│       └── models.rs             #   序列化结构体
├── python/uiya/                  # Python 模块 (被 Rust 通过子进程调用)
│   ├── cli.py                    #   CLI 入口 (inspect-runtime, download, parse, save-settings 等子命令)
│   └── utils/config.py           #   配置加载/写入、路径解析
├── config/                       # 运行时配置 (workspace_root/config/)
│   ├── runtime.json              #   Rust 侧快速加载 (driver, pythonPath, downloadDir)
│   ├── uiya.toml                 #   Python 侧完整配置 (download_dir, ffmpeg_path, no_proxy 等)
│   └── hotkey.json               #   全局快捷键
└── tests/                        # Python 测试 (pytest)
```

## 三层架构与数据流

```
前端 (React/TS)  ←→  后端 (Rust/Tauri)  ←→  Python 子进程 (uiya.cli)
   invoke()              Command              subprocess + stdout JSON
```

- 前端通过 `bridge.ts` 中的 `invoke()` 调用 Rust 命令
- Rust 通过 `build_python_command_for_driver()` 启动 Python 子进程
- Python 通过 stdout 输出 JSON envelope (`{kind, payload}`) 回传结果
- Rust 通过 `app.emit("runtime:event", ...)` 向前端推送事件

新增一个设置项的典型改动路径：
1. `state.rs` — 加字段、getter/setter、持久化读写
2. `commands.rs` — 暴露 Tauri 命令
3. `process.rs` — 传参给 Python 子进程
4. `cli.py` — Python 侧处理
5. `bridge.ts` — 前端 invoke 封装
6. `runtime.ts` — TypeScript 类型
7. `SettingsPage.tsx` — UI
8. `AppShell.tsx` — 状态管理
9. `routes.tsx` — prop 传递
10. `lib.rs` — 注册新命令

## 开发命令

```bash
npm run tauri dev      # 启动开发环境 (Vite + Tauri)
npm run build          # 构建前端
npx tsc --noEmit       # TypeScript 类型检查
cargo check            # Rust 编译检查 (在 src-tauri/ 下)
cargo test             # Rust 测试
npm run test           # 前端测试 (vitest)
pytest                 # Python 测试
```

## Commit 规范 (Gitmoji)

格式：`:gitmoji: type: description`

| gitmoji | type | 用途 |
|---------|------|------|
| :sparkles: `:sparkles:` | feat | 新功能 |
| :bug: `:bug:` | fix | Bug 修复 |
| :recycle: `:recycle:` | refactor | 重构 |
| :pencil2: `:pencil2:` | fix | 文本/命名修正 |
| :construction_worker: `:construction_worker:` | ci | CI/CD |
| :memo: `:memo:` | docs | 文档 |
| :art: `:art:` | style | 代码格式/结构 |
| :zap: `:zap:` | perf | 性能优化 |
| :white_check_mark: `:white_check_mark:` | test | 测试 |
| :fire: `:fire:` | chore | 删除代码/文件 |
| :wrench: `:wrench:` | chore | 配置文件 |

示例：`:sparkles: feat: add download resource selectors and audio quality option`

## 关键约定

- 语言：UI 文本用中文，代码/注释用英文
- 分支：`tauri-dev` 为主分支，功能分支从 `tauri-dev` 切出，切之前先 pull 最新
- Python：3.11+，uv 管理依赖，pyright strict 类型检查，ruff lint
- Rust：Tauri 2，无 unsafe，测试在各模块底部 `#[cfg(test)] mod tests`
- 前端：React 18，无状态管理库，状态集中在 `AppShell.tsx`
- 配置持久化：Rust 侧写 `runtime.json`（启动快速加载），Python 侧写 `uiya.toml`（完整配置）
