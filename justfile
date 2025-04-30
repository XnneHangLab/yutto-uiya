start:
  uv lock
  uv sync
  uv run streamlit run src/uiya/yutto_uiya.py

dev:
    # 删除所有构建产物和缓存 / 二次操作防止缓存问题恢复代码
    rm -rf packages/*/dist
    rm -rf packages/*/__pycache__
    rm -rf packages/*/*.egg-info
    uv build packages/yutto
    uv build packages/wexpect-uv
    uv lock --no-cache --upgrade
    uv run streamlit run src/uiya/yutto_uiya.py

statrt:


test-parse:
    rm -rf packages/yutto/dist
    uv build packages/yutto
    uv lock
    uv sync --no-cache
    uv run test

fmt:
  uv run ruff check --fix --select I .
  uv run ruff format .

lint:
  uv run pyright src/uiya
  uv run ruff check .

fmt-docs:
  prettier --ignore-path .prettierignore --write '**/*.md'

test:
  uv run pytest tests

# CI specific
ci-install:
  uv sync --all-extras --dev

ci-fmt-check:
  uv run ruff format --check --diff .

ci-lint:
  just lint

ci-test:
  just test