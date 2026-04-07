# Console Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder console page with a real console skeleton, share launcher state between Home and Console, and prepare the data flow for future stdout/stderr wiring without launching a real process yet.

**Architecture:** Keep all launcher and console state in `AppShell`, move launch/log helpers into a focused launcher service, and render a dedicated `ConsolePage` that consumes real shared state instead of local mock page state. The Home page only toggles the shared launcher state and appends system logs such as `运行: 未配置命令` or `已停止`; later Tauri stdout/stderr can flow into the same log list without restructuring the UI.

**Tech Stack:** React 18, TypeScript, Vitest, React Testing Library, CSS variables, Tauri shell placeholder integration later

---

## File Structure

### New Files

- Create: `src/services/launcher/launcher.ts`
- Create: `src/services/launcher/launcher.test.ts`
- Create: `src/pages/ConsolePage/ConsolePage.tsx`
- Create: `src/pages/ConsolePage/ConsolePage.test.tsx`
- Create: `src/styles/console.css`

### Modified Files

- Modify: `src/app/routes.tsx`
- Modify: `src/layouts/AppShell/AppShell.tsx`
- Modify: `src/layouts/AppShell/AppShell.test.tsx`
- Modify: `src/pages/HomePage/HomePage.tsx`
- Modify: `src/pages/HomePage/HomePage.test.tsx`
- Modify: `src/components/home/NoticePanel/NoticePanel.tsx`
- Modify: `src/data/home.ts`
- Modify: `src/styles/home.css`
- Modify: `src/styles/tokens.css`

### Responsibilities

- `src/services/launcher/launcher.ts`
  Shared launcher types and pure helpers: launch state, log entry shape, visible command label, launch toggle log generation, export formatting.
- `src/pages/ConsolePage/ConsolePage.tsx`
  Real console skeleton page with toolbar, log list, empty state, footer stats, copy/export/clear controls.
- `src/styles/console.css`
  Dedicated console layout and dark log panel styling that stays readable in both themes.
- `src/layouts/AppShell/AppShell.tsx`
  Single source of truth for `launchState`, `configuredCommand`, `logs`, `autoScroll`, and `wrapLines`.
- `src/app/routes.tsx`
  Route `home` and `console` from shared shell state instead of isolated local page state.

## Task 1: Add Shared Launcher Helpers

**Files:**
- Create: `src/services/launcher/launcher.ts`
- Create: `src/services/launcher/launcher.test.ts`
- Modify: `src/data/home.ts`

- [ ] **Step 1: Write the failing launcher helper tests**

```ts
import {
  buildLaunchToggleResult,
  formatConsoleExport,
  getVisibleCommand,
  launchButtonLabels,
  toggleLaunchState,
} from './launcher';

describe('launcher helpers', () => {
  it('toggles launch state between idle and running', () => {
    expect(toggleLaunchState('idle')).toBe('running');
    expect(toggleLaunchState('running')).toBe('idle');
  });

  it('falls back to 未配置命令 when no command is configured', () => {
    expect(getVisibleCommand(null)).toBe('未配置命令');
    expect(getVisibleCommand('')).toBe('未配置命令');
    expect(getVisibleCommand('uv run app.py')).toBe('uv run app.py');
  });

  it('creates launch transition logs for start and stop', () => {
    const startResult = buildLaunchToggleResult('idle', null);
    const stopResult = buildLaunchToggleResult('running', null);

    expect(startResult.nextState).toBe('running');
    expect(startResult.log.kind).toBe('system');
    expect(startResult.log.text).toBe('运行: 未配置命令');

    expect(stopResult.nextState).toBe('idle');
    expect(stopResult.log.text).toBe('已停止');
  });

  it('formats logs for export', () => {
    const output = formatConsoleExport([
      {
        id: 'log-1',
        time: '2026-04-04 15:00:00',
        kind: 'system',
        text: '运行: 未配置命令',
      },
    ]);

    expect(output).toContain('[system]');
    expect(output).toContain('运行: 未配置命令');
  });

  it('keeps launch button labels stable', () => {
    expect(launchButtonLabels.idle).toBe('▶ 一键启动');
    expect(launchButtonLabels.running).toBe('✈ 运行中');
  });
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `npm run test -- --run src/services/launcher/launcher.test.ts`

Expected: FAIL because `src/services/launcher/launcher.ts` does not exist yet.

- [ ] **Step 3: Implement the shared launcher helper module**

```ts
export type LaunchState = 'idle' | 'running';
export type ConsoleLogKind = 'system' | 'stdout' | 'stderr';

export interface ConsoleLogEntry {
  id: string;
  time: string;
  kind: ConsoleLogKind;
  text: string;
}

export const UNCONFIGURED_COMMAND_LABEL = '未配置命令';

export const launchButtonLabels: Record<LaunchState, string> = {
  idle: '▶ 一键启动',
  running: '✈ 运行中',
};

export function toggleLaunchState(current: LaunchState): LaunchState {
  return current === 'idle' ? 'running' : 'idle';
}

export function getVisibleCommand(command: string | null): string {
  const value = command?.trim();
  return value ? value : UNCONFIGURED_COMMAND_LABEL;
}

function createTimestamp() {
  const date = new Date();
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function createConsoleLog(
  kind: ConsoleLogKind,
  text: string,
): ConsoleLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    time: createTimestamp(),
    kind,
    text,
  };
}

export function buildLaunchToggleResult(
  current: LaunchState,
  configuredCommand: string | null,
) {
  const nextState = toggleLaunchState(current);
  const logText =
    nextState === 'running'
      ? `运行: ${getVisibleCommand(configuredCommand)}`
      : '已停止';

  return {
    nextState,
    log: createConsoleLog('system', logText),
  };
}

export function formatConsoleExport(logs: ConsoleLogEntry[]) {
  return logs
    .map((entry) => `[${entry.time}] [${entry.kind}] ${entry.text}`)
    .join('\n');
}
```

- [ ] **Step 4: Move Home-only exports out of `src/data/home.ts`**

Keep `src/data/home.ts` focused on static page copy and folders only. Remove these exports from it:

```ts
export type LaunchButtonState = 'idle' | 'running';
export const launchButtonLabels = ...
export function toggleLaunchButtonState(...) ...
```

- [ ] **Step 5: Run the helper tests to verify they pass**

Run: `npm run test -- --run src/services/launcher/launcher.test.ts`

Expected: PASS with all helper tests green.

- [ ] **Step 6: Commit**

```bash
git add src/services/launcher/launcher.ts src/services/launcher/launcher.test.ts src/data/home.ts
git commit -m "feat: add launcher console state helpers"
```

## Task 2: Lift Launcher State Into AppShell

**Files:**
- Modify: `src/layouts/AppShell/AppShell.tsx`
- Modify: `src/layouts/AppShell/AppShell.test.tsx`
- Modify: `src/pages/HomePage/HomePage.tsx`
- Modify: `src/pages/HomePage/HomePage.test.tsx`
- Modify: `src/components/home/NoticePanel/NoticePanel.tsx`
- Modify: `src/app/routes.tsx`

- [ ] **Step 1: Extend `AppShell` tests with console-aware state persistence**

Add this test to `src/layouts/AppShell/AppShell.test.tsx`:

```tsx
it('keeps launch state across page switches and lets running toggle back to idle', async () => {
  const user = userEvent.setup();
  render(<App />);

  const launchButton = screen.getByRole('button', { name: /^▶ 一键启动$/ });
  expect(launchButton).toHaveAttribute('data-state', 'idle');

  await user.click(launchButton);

  expect(screen.getByRole('button', { name: /^✈ 运行中$/ })).toHaveAttribute(
    'data-state',
    'running',
  );

  await user.click(screen.getByRole('button', { name: '控制台' }));
  expect(screen.getByText('运行: 未配置命令')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '一键启动' }));
  expect(screen.getByRole('button', { name: /^✈ 运行中$/ })).toHaveAttribute(
    'data-state',
    'running',
  );

  await user.click(screen.getByRole('button', { name: /^✈ 运行中$/ }));
  expect(screen.getByRole('button', { name: /^▶ 一键启动$/ })).toHaveAttribute(
    'data-state',
    'idle',
  );
});
```

- [ ] **Step 2: Run the AppShell test file to verify the new test fails**

Run: `npm run test -- --run src/layouts/AppShell/AppShell.test.tsx`

Expected: FAIL because `console` still renders a placeholder page and launch state is not yet shared correctly with console.

- [ ] **Step 3: Refactor `HomePage` into a controlled page**

Update `src/pages/HomePage/HomePage.tsx` to receive shell-owned state instead of owning `useState` locally:

```tsx
import { FolderGrid } from '../../components/home/FolderGrid/FolderGrid';
import { HeroBanner } from '../../components/home/HeroBanner/HeroBanner';
import { NoticePanel } from '../../components/home/NoticePanel/NoticePanel';
import { folders, notices, versionMeta } from '../../data/home';
import type { LaunchState } from '../../services/launcher/launcher';
import { launchButtonLabels } from '../../services/launcher/launcher';
import '../../styles/home.css';

interface HomePageProps {
  launchState: LaunchState;
  onToggleLaunchState: () => void;
}

export function HomePage({
  launchState,
  onToggleLaunchState,
}: HomePageProps) {
  return (
    <div className="home-page">
      <HeroBanner />
      <div className="main-grid">
        <div>
          <h2 className="section-title">文件夹</h2>
          <FolderGrid items={folders} />
          <div className="meta">
            {versionMeta.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>

        <NoticePanel
          notices={notices}
          buttonLabel={launchButtonLabels[launchState]}
          launchState={launchState}
          onLaunch={onToggleLaunchState}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Make `NoticePanel` a pure presentational component**

```tsx
import type { LaunchState } from '../../../services/launcher/launcher';

interface NoticePanelProps {
  notices: string[];
  buttonLabel: string;
  launchState: LaunchState;
  onLaunch: () => void;
}

export function NoticePanel({
  notices,
  buttonLabel,
  launchState,
  onLaunch,
}: NoticePanelProps) {
  return (
    <aside className="notice">
      <h2>公告</h2>
      {notices.map((notice) => (
        <p key={notice}>{notice}</p>
      ))}

      <button
        type="button"
        className="run-btn"
        data-state={launchState}
        onClick={onLaunch}
      >
        {buttonLabel}
      </button>
    </aside>
  );
}
```

- [ ] **Step 5: Lift shared launcher state into `AppShell`**

```tsx
import { useEffect, useState } from 'react';
import {
  buildLaunchToggleResult,
  type ConsoleLogEntry,
  type LaunchState,
} from '../../services/launcher/launcher';

export function AppShell() {
  const [activePage, setActivePage] = useState<PageId>('home');
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme() ?? 'night');
  const [launchState, setLaunchState] = useState<LaunchState>('idle');
  const [configuredCommand] = useState<string | null>(null);
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [wrapLines, setWrapLines] = useState(true);

  useEffect(() => {
    writeStoredTheme(theme);
  }, [theme]);

  function handleToggleLaunchState() {
    setLaunchState((currentState) => {
      const result = buildLaunchToggleResult(currentState, configuredCommand);
      setLogs((currentLogs) => [...currentLogs, result.log]);
      return result.nextState;
    });
  }

  return (
    <div className="launcher-root" data-theme={theme}>
      <div className="app-shell">
        <Sidebar
          items={navItems}
          activePage={activePage}
          onSelect={setActivePage}
          theme={theme}
          onToggleTheme={() => setTheme((current) => toggleThemeMode(current))}
        />

        <main className="content-shell">
          <Topbar title="UI 复刻预览" />
          <section className="page-shell">
            {renderPage(activePage, {
              launchState,
              configuredCommand,
              logs,
              autoScroll,
              wrapLines,
              onToggleLaunchState: handleToggleLaunchState,
              onSetAutoScroll: setAutoScroll,
              onSetWrapLines: setWrapLines,
              onClearLogs: () => setLogs([]),
              onCopyLog: () => undefined,
              onExportLogs: () => undefined,
            })}
          </section>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Expand `renderPage()` to pass shared page options**

```tsx
interface RenderPageOptions {
  launchState: LaunchState;
  configuredCommand: string | null;
  logs: ConsoleLogEntry[];
  autoScroll: boolean;
  wrapLines: boolean;
  onToggleLaunchState: () => void;
  onSetAutoScroll: (next: boolean) => void;
  onSetWrapLines: (next: boolean) => void;
  onClearLogs: () => void;
  onCopyLog: (text: string) => void;
  onExportLogs: () => void;
}

export function renderPage(pageId: PageId, options: RenderPageOptions): ReactElement {
  switch (pageId) {
    case 'home':
      return (
        <HomePage
          launchState={options.launchState}
          onToggleLaunchState={options.onToggleLaunchState}
        />
      );
    // console task fills in the real page
  }
}
```

- [ ] **Step 7: Update the Home page tests to use a controlled harness**

Use a local test harness instead of rendering `HomePage` with missing props:

```tsx
function HomePageHarness() {
  const [launchState, setLaunchState] = useState<LaunchState>('idle');

  return (
    <HomePage
      launchState={launchState}
      onToggleLaunchState={() =>
        setLaunchState((currentState) => toggleLaunchState(currentState))
      }
    />
  );
}
```

- [ ] **Step 8: Re-run the Home and AppShell tests**

Run: `npm run test -- --run src/pages/HomePage/HomePage.test.tsx src/layouts/AppShell/AppShell.test.tsx`

Expected: Home page tests PASS, AppShell console-specific assertion still FAIL until ConsolePage exists.

- [ ] **Step 9: Commit**

```bash
git add src/layouts/AppShell/AppShell.tsx src/layouts/AppShell/AppShell.test.tsx src/pages/HomePage/HomePage.tsx src/pages/HomePage/HomePage.test.tsx src/components/home/NoticePanel/NoticePanel.tsx src/app/routes.tsx src/data/home.ts
git commit -m "feat: share launcher state across shell pages"
```

## Task 3: Build the Console Skeleton Page

**Files:**
- Create: `src/pages/ConsolePage/ConsolePage.tsx`
- Create: `src/pages/ConsolePage/ConsolePage.test.tsx`
- Create: `src/styles/console.css`
- Modify: `src/app/routes.tsx`
- Modify: `src/styles/tokens.css`

- [ ] **Step 1: Write failing ConsolePage tests**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsolePage } from './ConsolePage';

describe('ConsolePage', () => {
  it('renders the empty console state when no logs exist', () => {
    render(
      <ConsolePage
        launchState="idle"
        configuredCommand={null}
        logs={[]}
        autoScroll={true}
        wrapLines={true}
        onSetAutoScroll={() => undefined}
        onSetWrapLines={() => undefined}
        onClearLogs={() => undefined}
        onCopyLog={() => undefined}
        onExportLogs={() => undefined}
      />,
    );

    expect(screen.getByText('尚未启动任务')).toBeInTheDocument();
    expect(
      screen.getByText('点击首页一键启动后，这里会显示运行信息'),
    ).toBeInTheDocument();
    expect(screen.getByText('未配置命令')).toBeInTheDocument();
  });

  it('renders logs and triggers row/tool actions', async () => {
    const user = userEvent.setup();
    const onCopyLog = vi.fn();
    const onClearLogs = vi.fn();
    const onExportLogs = vi.fn();

    render(
      <ConsolePage
        launchState="running"
        configuredCommand={null}
        logs={[
          {
            id: 'log-1',
            time: '2026-04-04 15:00:00',
            kind: 'system',
            text: '运行: 未配置命令',
          },
        ]}
        autoScroll={true}
        wrapLines={true}
        onSetAutoScroll={() => undefined}
        onSetWrapLines={() => undefined}
        onClearLogs={onClearLogs}
        onCopyLog={onCopyLog}
        onExportLogs={onExportLogs}
      />,
    );

    expect(screen.getByText('运行: 未配置命令')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '复制日志 1' }));
    expect(onCopyLog).toHaveBeenCalledWith('运行: 未配置命令');

    await user.click(screen.getByRole('button', { name: '清空日志' }));
    expect(onClearLogs).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '导出日志' }));
    expect(onExportLogs).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the ConsolePage tests to verify they fail**

Run: `npm run test -- --run src/pages/ConsolePage/ConsolePage.test.tsx`

Expected: FAIL because `ConsolePage.tsx` does not exist yet.

- [ ] **Step 3: Implement the ConsolePage component**

```tsx
import type { ConsoleLogEntry, LaunchState } from '../../services/launcher/launcher';
import { getVisibleCommand } from '../../services/launcher/launcher';
import '../../styles/console.css';

interface ConsolePageProps {
  launchState: LaunchState;
  configuredCommand: string | null;
  logs: ConsoleLogEntry[];
  autoScroll: boolean;
  wrapLines: boolean;
  onSetAutoScroll: (next: boolean) => void;
  onSetWrapLines: (next: boolean) => void;
  onClearLogs: () => void;
  onCopyLog: (text: string) => void;
  onExportLogs: () => void;
}

export function ConsolePage({
  launchState,
  configuredCommand,
  logs,
  autoScroll,
  wrapLines,
  onSetAutoScroll,
  onSetWrapLines,
  onClearLogs,
  onCopyLog,
  onExportLogs,
}: ConsolePageProps) {
  const visibleCommand = getVisibleCommand(configuredCommand);
  const lastLog = logs.at(-1);

  return (
    <div className="console-page">
      <header className="console-toolbar">
        <div className="console-toolbar__status">
          <span className={`console-status console-status--${launchState}`}>
            {launchState === 'running' ? '运行中' : '空闲'}
          </span>
          <span className="console-command">{visibleCommand}</span>
        </div>

        <div className="console-toolbar__actions">
          <button type="button" onClick={onClearLogs}>清空日志</button>
          <button type="button" onClick={onExportLogs}>导出日志</button>
          <button
            type="button"
            aria-pressed={autoScroll}
            onClick={() => onSetAutoScroll(!autoScroll)}
          >
            自动滚动
          </button>
          <button
            type="button"
            aria-pressed={wrapLines}
            onClick={() => onSetWrapLines(!wrapLines)}
          >
            换行
          </button>
        </div>
      </header>

      <section className={`console-log-panel${wrapLines ? ' is-wrap' : ''}`}>
        {logs.length === 0 ? (
          <div className="console-empty">
            <h2>尚未启动任务</h2>
            <p>点击首页一键启动后，这里会显示运行信息</p>
          </div>
        ) : (
          <div className="console-log-list">
            {logs.map((entry, index) => (
              <article key={entry.id} className={`console-log console-log--${entry.kind}`}>
                <div className="console-log__meta">
                  <span>{entry.time}</span>
                  <span>{entry.kind}</span>
                </div>
                <pre className="console-log__text">{entry.text}</pre>
                <button
                  type="button"
                  className="console-log__copy"
                  aria-label={`复制日志 ${index + 1}`}
                  onClick={() => onCopyLog(entry.text)}
                >
                  复制
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="console-footer">
        <span>日志条数 {logs.length}</span>
        <span>最后更新时间 {lastLog ? lastLog.time : '暂无'}</span>
        <span>{autoScroll ? '自动滚动开启' : '自动滚动关闭'}</span>
      </footer>
    </div>
  );
}
```

- [ ] **Step 4: Add dedicated console styling**

Create `src/styles/console.css` with these required layers:

```css
.console-page {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 14px;
}

.console-toolbar,
.console-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.console-log-panel {
  min-height: 0;
  overflow: auto;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: #0f141a;
  color: #e7eef8;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.console-log-panel.is-wrap .console-log__text {
  white-space: pre-wrap;
  word-break: break-word;
}

.console-log__copy {
  opacity: 0.24;
  transition: opacity 0.18s ease;
}

.console-log:hover .console-log__copy,
.console-log:focus-within .console-log__copy {
  opacity: 0.78;
}
```

- [ ] **Step 5: Add console tokens for light/dark shell harmony**

Add these to `src/styles/tokens.css`:

```css
--console-panel-bg: #0f141a;
--console-panel-border: rgba(255, 255, 255, 0.08);
--console-panel-text: #e7eef8;
--console-panel-muted: #8ea2b8;
--console-system: #72b8ff;
--console-stdout: #e7eef8;
--console-stderr: #ff9b9b;
```

Mirror the same values in day mode too. The console log area should stay dark in both themes.

- [ ] **Step 6: Wire the `console` route to the real ConsolePage**

```tsx
case 'console':
  return (
    <ConsolePage
      launchState={options.launchState}
      configuredCommand={options.configuredCommand}
      logs={options.logs}
      autoScroll={options.autoScroll}
      wrapLines={options.wrapLines}
      onSetAutoScroll={options.onSetAutoScroll}
      onSetWrapLines={options.onSetWrapLines}
      onClearLogs={options.onClearLogs}
      onCopyLog={options.onCopyLog}
      onExportLogs={options.onExportLogs}
    />
  );
```

- [ ] **Step 7: Re-run the ConsolePage and AppShell tests**

Run: `npm run test -- --run src/pages/ConsolePage/ConsolePage.test.tsx src/layouts/AppShell/AppShell.test.tsx`

Expected: PASS and confirm console route now renders shared launch logs.

- [ ] **Step 8: Commit**

```bash
git add src/pages/ConsolePage/ConsolePage.tsx src/pages/ConsolePage/ConsolePage.test.tsx src/styles/console.css src/app/routes.tsx src/styles/tokens.css
git commit -m "feat: add console page skeleton"
```

## Task 4: Hook Home Actions to Real Console Controls

**Files:**
- Modify: `src/layouts/AppShell/AppShell.tsx`
- Modify: `src/layouts/AppShell/AppShell.test.tsx`
- Modify: `src/styles/home.css`

- [ ] **Step 1: Add failing AppShell assertions for control actions**

Add these checks to the AppShell console test:

```tsx
await user.click(screen.getByRole('button', { name: '清空日志' }));
expect(screen.getByText('尚未启动任务')).toBeInTheDocument();
```

- [ ] **Step 2: Run the AppShell tests to verify they fail**

Run: `npm run test -- --run src/layouts/AppShell/AppShell.test.tsx`

Expected: FAIL because `onClearLogs` is still a no-op.

- [ ] **Step 3: Implement the real console action handlers in AppShell**

```tsx
import { formatConsoleExport } from '../../services/launcher/launcher';

function handleCopyLog(text: string) {
  void navigator.clipboard?.writeText(text);
}

function handleExportLogs() {
  const output = formatConsoleExport(logs);
  const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = 'huixin-console.log';
  anchor.click();
  URL.revokeObjectURL(url);
}
```

Also replace the temporary no-op callbacks in `renderPage(...)`.

- [ ] **Step 4: Add the missing clear handler**

```tsx
onClearLogs: () => setLogs([]),
```

- [ ] **Step 5: Re-run the AppShell tests**

Run: `npm run test -- --run src/layouts/AppShell/AppShell.test.tsx`

Expected: PASS with clear action covered.

- [ ] **Step 6: Commit**

```bash
git add src/layouts/AppShell/AppShell.tsx src/layouts/AppShell/AppShell.test.tsx src/styles/home.css
git commit -m "feat: wire console toolbar actions"
```

## Task 5: Final Verification

**Files:**
- Verify: `src/services/launcher/launcher.ts`
- Verify: `src/pages/ConsolePage/ConsolePage.tsx`
- Verify: `src/layouts/AppShell/AppShell.tsx`
- Verify: `src/app/routes.tsx`
- Verify: `src/styles/console.css`

- [ ] **Step 1: Run the focused frontend tests**

Run: `npm run test -- --run src/services/launcher/launcher.test.ts src/pages/ConsolePage/ConsolePage.test.tsx src/pages/HomePage/HomePage.test.tsx src/layouts/AppShell/AppShell.test.tsx`

Expected: PASS with launcher helpers, home button state, and console skeleton all green.

- [ ] **Step 2: Run the full frontend test suite**

Run: `npm run test -- --run`

Expected: PASS with all existing test files green.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: PASS with Vite production build succeeding.

- [ ] **Step 4: Confirm clean worktree**

Run: `git status --short`

Expected: clean worktree.

## Self-Review

- Spec coverage:
  - Shared shell state: Task 2
  - Real console skeleton page: Task 3
  - No fake stdout/stderr content: preserved, only system logs are generated
  - `未配置命令` fallback: Task 1
  - Copy/export/clear/autoscroll/wrap controls: Tasks 3 and 4
  - Leave stdout/stderr wiring path ready: Task 1 log types + Task 3 shared data contract
- Placeholder scan:
  - No `TODO`/`TBD` placeholders remain in the plan tasks
- Type consistency:
  - `LaunchState`, `ConsoleLogEntry`, and route option names are consistent across tasks
