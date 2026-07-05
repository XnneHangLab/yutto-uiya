# AGENTS.md

yutto-uiya is a Tauri 2 desktop client for the yutto Bilibili video downloader. Frontend is React + TypeScript, backend is Rust, and the download engine runs via Python subprocess calling yutto.

## Project Structure

```
yutto-uiya/
├── src/                          # React frontend (TypeScript)
│   ├── app/                      #   Routing (routes.tsx)
│   ├── components/               #   UI components (grouped by feature)
│   ├── layouts/AppShell/         #   Main layout, central state management
│   ├── pages/                    #   Page components (Settings, Download, Console, etc.)
│   ├── services/
│   │   ├── runtime/bridge.ts     #   Tauri invoke wrappers (all frontend↔Rust IPC lives here)
│   │   ├── runtime/runtime.ts    #   TypeScript type definitions (RuntimeInspection, etc.)
│   │   └── ...
│   └── styles/                   #   Global CSS
├── src-tauri/                    # Rust backend (Tauri 2)
│   ├── src/lib.rs                #   Tauri entry point, command registration
│   └── src/runtime/
│       ├── commands.rs           #   Tauri commands (#[tauri::command])
│       ├── process.rs            #   Python subprocess calls, file picker dialogs
│       ├── state.rs              #   RuntimeState global state, config read/write
│       └── models.rs             #   Serialization structs
├── python/uiya/                  # Python module (called by Rust via subprocess)
│   ├── cli.py                    #   CLI entry (inspect-runtime, download, parse, save-settings subcommands)
│   └── utils/config.py           #   Config loading/writing, path resolution
├── config/                       # Runtime config (under workspace_root/config/)
│   ├── runtime.json              #   Rust-side fast load (driver, pythonPath, downloadDir)
│   ├── uiya.toml                 #   Python-side full config (download_dir, ffmpeg_path, no_proxy, etc.)
│   └── hotkey.json               #   Global shortcut
└── tests/                        # Python tests (pytest)
```

## Three-Layer Architecture

```
Frontend (React/TS)  ←→  Backend (Rust/Tauri)  ←→  Python subprocess (uiya.cli)
     invoke()               Command                subprocess + stdout JSON
```

- Frontend calls Rust commands via `invoke()` in `bridge.ts`
- Rust spawns Python subprocesses via `build_python_command_for_driver()`
- Python returns results as JSON envelopes (`{kind, payload}`) on stdout
- Rust pushes events to the frontend via `app.emit("runtime:event", ...)`

Typical change path for adding a new setting:
1. `state.rs` — add field, getter/setter, persist read/write
2. `commands.rs` — expose Tauri command
3. `process.rs` — pass to Python subprocess
4. `cli.py` — Python-side handling
5. `bridge.ts` — frontend invoke wrapper
6. `runtime.ts` — TypeScript types
7. `SettingsPage.tsx` — UI
8. `AppShell.tsx` — state management
9. `routes.tsx` — prop threading
10. `lib.rs` — register new command

## Dev Commands

```bash
npm run tauri dev      # Start dev environment (Vite + Tauri)
npm run build          # Build frontend
npx tsc --noEmit       # TypeScript type check
cargo check            # Rust compile check (run in src-tauri/)
cargo test             # Rust tests
npm run test           # Frontend tests (vitest)
pytest                 # Python tests
```

## Commit Convention (Gitmoji)

Format: `:gitmoji: type: description`

| gitmoji | type | usage |
|---------|------|-------|
| :sparkles: `:sparkles:` | feat | New feature |
| :bug: `:bug:` | fix | Bug fix |
| :recycle: `:recycle:` | refactor | Refactor |
| :pencil2: `:pencil2:` | fix | Text/naming correction |
| :construction_worker: `:construction_worker:` | ci | CI/CD |
| :memo: `:memo:` | docs | Documentation |
| :art: `:art:` | style | Code format/structure |
| :zap: `:zap:` | perf | Performance |
| :white_check_mark: `:white_check_mark:` | test | Tests |
| :fire: `:fire:` | chore | Remove code/files |
| :wrench: `:wrench:` | chore | Config files |

Example: `:sparkles: feat: add download resource selectors and audio quality option`

## Key Conventions

- Language: UI text in Chinese, code/comments in English
- Branching: `tauri-dev` is the main branch; create feature branches from it; always pull latest before branching
- Python: 3.11+, uv for deps, pyright strict, ruff lint
- Rust: Tauri 2, no unsafe, tests at module bottom `#[cfg(test)] mod tests`
- Frontend: React 18, no state library, state centralized in `AppShell.tsx`
- Config persistence: Rust writes `runtime.json` (fast startup load), Python writes `uiya.toml` (full config)
