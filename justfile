# ── 开发环境 ──────────────────────────────────────────────────────────────────

# 安装 Python 依赖
sync:
    uv sync

# 运行 Python 测试
test-py:
    uv run pytest tests/ -q

# 运行 Rust 测试
test-rs:
    cargo test --manifest-path src-tauri/Cargo.toml

# 运行所有测试
test: test-py test-rs

# ── Tauri 开发 ────────────────────────────────────────────────────────────────

# 安装 npm 依赖
npm-install:
    npm install

# 启动 Tauri 开发模式（需先 npm-install + sync）
dev:
    npm run tauri dev

# 构建 Tauri 应用
build:
    npm run tauri build

# ── Python 工具 ───────────────────────────────────────────────────────────────

# 检查 uiya 环境（输出版本和 ffmpeg 状态）
inspect:
    uv run --no-sync python -m uiya.cli inspect-runtime | python -m json.tool

# 代码格式化
fmt:
    uv run ruff format python/
    uv run ruff check --fix python/
