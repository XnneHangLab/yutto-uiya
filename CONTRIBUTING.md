# 🤝 贡献指南

感谢你对 **绘心 yutto-uiya** 的关注！欢迎任何形式的贡献~

你可以提出功能需求，或者反馈 Bug 到 [Issue](https://github.com/XnneHangLab/yutto-uiya/issues)。如果你无法访问 GitHub，也可以加入 [QQ 群](https://github.com/XnneHangLab/yutto-uiya/blob/dev/assets/imgs/qq_group.png) 来反馈。下面我们会讲解如何直接进行代码贡献。

## 📋 开始之前

- 🐛 **Bug 修复** — 直接提交 PR 即可
- ✨ **新功能** — 请先开一个 Feature Request issue 讨论，避免做无用功
- 📝 **文档改进** — 随时欢迎！

## 🛠️ 开发环境搭建

### 📋 前置依赖

| 工具 | 用途 |
|---|---|
| [Node.js](https://nodejs.org/) | 前端构建 |
| [Rust](https://www.rust-lang.org/tools/install) | Tauri 后端 |
| [uv](https://docs.astral.sh/uv/getting-started/installation/) | Python 包管理 |
| [FFmpeg](https://ffmpeg.org/) | 音视频合并 |
| [just](https://github.com/casey/just) | 任务运行器（推荐） |

### 🚀 启动开发

```bash
# 安装依赖
npm install
uv sync

# 启动开发模式
just dev
# 或
npm run tauri dev
```

## 📐 代码规范

提交前请确保通过 lint 和格式检查：

```bash
# 一键格式化
just fmt

# 一键检查
just lint
```

各语言工具：

| 语言 | 格式化 | Lint |
|---|---|---|
| 🐍 Python | ruff format | ruff + pyright |
| 🦀 Rust | cargo fmt | clippy |
| 🟦 TypeScript | biome | biome + tsc |

## 📝 提交规范

使用 [gitmoji](https://gitmoji.dev/) + 语义化前缀：

```
:emoji: type: 简短描述

示例：
:sparkles: feat: add audio format selector
:bug: fix: hide console window on Windows
:pencil: docs: update FFmpeg troubleshooting guide
```

常用类型：

| Emoji | 类型 | 说明 |
|---|---|---|
| ✨ `:sparkles:` | feat | 新功能 |
| 🐛 `:bug:` | fix | Bug 修复 |
| 📝 `:pencil:` | docs | 文档修改 |
| ♻️ `:recycle:` | refactor | 代码重构 |
| ⚡ `:zap:` | perf | 性能优化 |
| 🔖 `:bookmark:` | release | 发布版本 |

## 🔀 分支与 PR

1. 从 `dev` 分支创建你的功能分支
2. 开发完成后提交 PR 到 `dev`
3. PR 模板会自动加载，请按模板填写

```bash
git checkout dev
git pull origin dev
git checkout -b feat/your-feature
```

## 📚 文档开发

文档使用 VitePress 构建，位于 `docs/` 目录：

```bash
# 启动文档开发服务器
just docs-dev

# 构建文档
just docs-build
```

## 🧪 运行测试

```bash
# 全部测试
just test

# 仅 Python 测试
just test-py

# 仅 Rust 测试
just test-rs
```

## 📁 项目结构

```
yutto-uiya/
├── src/              # React 前端 (TypeScript)
├── src-tauri/        # Tauri 后端 (Rust)
├── python/           # Python 下载核心 (uiya)
├── docs/             # VitePress 文档站
├── tests/            # Python 测试
├── assets/           # 静态资源
└── justfile          # 任务定义
```

---

再次感谢你的贡献！有任何问题欢迎在 issue 中讨论 💬
