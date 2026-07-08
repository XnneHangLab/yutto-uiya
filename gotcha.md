# Gotchas

Things that are easy to get wrong. Read this before contributing.

## PR must follow the template

When creating a PR, use the template in `.github/PULL_REQUEST_TEMPLATE.md`. The PR body must include:

- **动机** — why this change is needed
- **解决方案** — what you did (if the PR is large)
- **类型** — check the matching type checkboxes

Do NOT write a freeform PR body. Use `gh pr create` with a body that matches the template structure.

## Branching: always branch from `dev`

`dev` is the main branch. Always pull latest before creating a feature branch:

```bash
git checkout dev
git pull origin dev
git checkout -b feat/your-feature
```

## UI text in Chinese, code in English

- All user-facing text (labels, messages, docs) is in Chinese
- Code, comments, variable names, and commit messages are in English
- Commit format: `:gitmoji: type: english description`

## Config lives in two places

- `config/runtime.json` — Rust-side fast load (written by Rust)
- `config/uiya.toml` — Python-side full config (written by Python)

Don't mix them up. A new setting typically needs changes in both.

## GitHub org is `XnneHangLab`, not `MrXnneHang`

The repo URL is `https://github.com/XnneHangLab/yutto-uiya`. Links to `MrXnneHang/yutto-uiya` are stale.
