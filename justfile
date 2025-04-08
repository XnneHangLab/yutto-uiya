start:
  uv lock
  uv sync
  uv run streamlit run src/uiya/yutto_uiya.py

fmt:
  uv run ruff check --fix --select I .
  uv run ruff format .

lint:
  uv run pyright src/uiya
  uv run ruff check .
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