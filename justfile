start:
  uv lock
  uv sync
  uv run streamlit run src/uiya/yutto_uiya.py

dev:
    rm -rf packages/yutto/dist
    rm -rf packages/wexpect-uv/dist
    uv build packages/yutto
    uv build packages/wexpect-uv
    uv lock
    uv sync --no-cache
    uv run streamlit run src/uiya/yutto_uiya.py

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
  uv run pytest

# CI specific
ci-install:
  uv sync --all-extras --dev

ci-fmt-check:
  uv run ruff format --check --diff .

ci-lint:
  just lint

ci-test:
  just test