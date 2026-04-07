# Tauri React Launcher UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri + React desktop launcher that closely recreates the provided HTML, includes the full left navigation, fully implements Home and Settings, and leaves placeholder shells for the remaining pages.

**Architecture:** Scaffold a Vite React TypeScript frontend and a Tauri v2 shell, keep design tokens in shared CSS, split the UI into shell/page/section layers, and isolate desktop window actions behind a small service module. Keep phase-one page content static in data modules so later launcher logic can replace static content without rewriting the page tree.

**Tech Stack:** React 18, TypeScript, Vite 5, Tauri 2, Vitest, React Testing Library, CSS, static data modules

---

## File Structure

### Root Tooling

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`

### Frontend App

- Create: `src/main.tsx`
- Create: `src/vite-env.d.ts`
- Create: `src/app/App.tsx`
- Create: `src/app/providers.tsx`
- Create: `src/app/routes.tsx`
- Create: `src/data/nav.ts`
- Create: `src/data/home.ts`
- Create: `src/data/settings.ts`
- Create: `src/layouts/AppShell/AppShell.tsx`
- Create: `src/pages/PlaceholderPage/PlaceholderPage.tsx`
- Create: `src/pages/HomePage/HomePage.tsx`
- Create: `src/pages/SettingsPage/SettingsPage.tsx`
- Create: `src/components/navigation/Sidebar/Sidebar.tsx`
- Create: `src/components/navigation/NavItem/NavItem.tsx`
- Create: `src/components/window/Topbar/Topbar.tsx`
- Create: `src/components/window/WindowControls/WindowControls.tsx`
- Create: `src/components/home/HeroBanner/HeroBanner.tsx`
- Create: `src/components/home/FolderGrid/FolderGrid.tsx`
- Create: `src/components/home/FolderCard/FolderCard.tsx`
- Create: `src/components/home/NoticePanel/NoticePanel.tsx`
- Create: `src/components/settings/SettingsTabs/SettingsTabs.tsx`
- Create: `src/components/settings/SettingCard/SettingCard.tsx`
- Create: `src/components/settings/SettingRow/SettingRow.tsx`
- Create: `src/components/settings/ToggleSwitch/ToggleSwitch.tsx`
- Create: `src/services/desktop/window.ts`

### Styles

- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src/styles/shell.css`
- Create: `src/styles/home.css`
- Create: `src/styles/settings.css`

### Tests

- Create: `src/test/setup.ts`
- Create: `src/app/App.test.tsx`
- Create: `src/layouts/AppShell/AppShell.test.tsx`
- Create: `src/pages/HomePage/HomePage.test.tsx`
- Create: `src/pages/SettingsPage/SettingsPage.test.tsx`
- Create: `src/components/window/WindowControls/WindowControls.test.tsx`
- Create: `src/components/window/Topbar/Topbar.test.tsx`

### Tauri Shell

- Create via `tauri init`: `src-tauri/Cargo.toml`
- Create via `tauri init`: `src-tauri/build.rs`
- Create via `tauri init`: `src-tauri/src/main.rs`
- Create via `tauri init`: `src-tauri/src/lib.rs`
- Create via `tauri init`: `src-tauri/tauri.conf.json`
- Create via `tauri init`: `src-tauri/capabilities/default.json`
- Create via `tauri init`: `src-tauri/icons/*`

## Task 1: Bootstrap React, Vite, TypeScript, and the Test Harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/vite-env.d.ts`
- Create: `src/app/App.tsx`
- Create: `src/app/providers.tsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src/test/setup.ts`
- Test: `src/app/App.test.tsx`

- [ ] **Step 1: Write the toolchain files and a failing smoke test**

```json
{
  "name": "xnne-hang-lab-launcher-template",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4"
  }
}
```

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  server: {
    host: host || false,
    port: 5173,
    strictPort: true,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
  },
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
```

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0"
    />
    <title>XnneHangLab Launcher Template</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```ts
import '@testing-library/jest-dom/vitest';
```

```tsx
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the launcher preview title', () => {
    render(<App />);

    expect(screen.getByText('UI 复刻预览')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: install completes and `node_modules/` is created without unresolved peer dependency errors.

- [ ] **Step 3: Run the smoke test to confirm it fails**

Run: `npm run test -- --run src/app/App.test.tsx`

Expected: FAIL with a module resolution error because `src/app/App.tsx` does not exist yet.

- [ ] **Step 4: Write the minimal app implementation to make the smoke test pass**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './styles/tokens.css';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

```ts
/// <reference types="vite/client" />
```

```tsx
import type { PropsWithChildren } from 'react';

export function Providers({ children }: PropsWithChildren) {
  return children;
}
```

```tsx
import { Providers } from './providers';

function App() {
  return (
    <Providers>
      <div className="app-bootstrap">
        <div className="app-bootstrap__title">UI 复刻预览</div>
      </div>
    </Providers>
  );
}

export default App;
```

```css
:root {
  --bg: #15181d;
  --panel: #1c2128;
  --panel-2: #20262e;
  --panel-3: #262d37;
  --line: rgba(255, 255, 255, 0.06);
  --text: #edf2f8;
  --muted: #9aa7b8;
  --accent: #3fa3ff;
  --accent-2: #2b7dff;
  --success: #36a3ff;
  --shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
  --radius: 18px;
  --sidebar-w: 84px;
}
```

```css
* {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  min-width: 320px;
  background: linear-gradient(180deg, #0f1216 0%, #14181d 100%);
  color: var(--text);
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

.app-bootstrap {
  min-height: 100%;
  display: grid;
  place-items: center;
}

.app-bootstrap__title {
  font-size: 24px;
  color: var(--text);
}
```

- [ ] **Step 5: Run the smoke test to confirm it passes**

Run: `npm run test -- --run src/app/App.test.tsx`

Expected: PASS with one passing test.

- [ ] **Step 6: Commit the bootstrap**

```bash
git add package.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html src/main.tsx src/vite-env.d.ts src/app/App.tsx src/app/App.test.tsx src/app/providers.tsx src/styles/tokens.css src/styles/global.css src/test/setup.ts
git commit -m "chore: bootstrap react launcher app"
```

## Task 2: Initialize the Tauri Desktop Shell

**Files:**
- Create via command: `src-tauri/Cargo.toml`
- Create via command: `src-tauri/build.rs`
- Create via command: `src-tauri/src/main.rs`
- Create via command: `src-tauri/src/lib.rs`
- Create via command: `src-tauri/icons/*`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Verify the Tauri shell is missing**

Run: `npm run tauri info`

Expected: FAIL because `src-tauri/tauri.conf.json` does not exist yet.

- [ ] **Step 2: Generate the base Tauri shell**

Run: `npm run tauri init -- --ci`

Expected: `src-tauri/` is created with Cargo files, config, capability file, and default icons.

- [ ] **Step 3: Patch the Tauri config for the launcher window**

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/config.schema.json",
  "productName": "XnneHangLab Launcher Template",
  "version": "0.1.0",
  "identifier": "com.xnnehanglab.launchertemplate",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "XnneHangLab Launcher Template",
        "width": 1440,
        "height": 900,
        "minWidth": 1100,
        "minHeight": 760,
        "decorations": false,
        "resizable": true,
        "center": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main-capability",
  "description": "Capabilities for the main launcher window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:default",
    "core:window:allow-close",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-start-dragging"
  ]
}
```

- [ ] **Step 4: Verify the desktop shell config**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: PASS with a successful Rust check.

Run: `npm run tauri info`

Expected: PASS and show the current Tauri, Rust, and Node environment summary.

- [ ] **Step 5: Commit the Tauri bootstrap**

```bash
git add src-tauri
git commit -m "chore: add tauri desktop shell"
```

## Task 3: Implement the App Shell, Navigation, and Placeholder Pages

**Files:**
- Modify: `src/app/App.tsx`
- Create: `src/app/routes.tsx`
- Create: `src/data/nav.ts`
- Create: `src/layouts/AppShell/AppShell.tsx`
- Create: `src/layouts/AppShell/AppShell.test.tsx`
- Create: `src/pages/PlaceholderPage/PlaceholderPage.tsx`
- Create: `src/components/navigation/Sidebar/Sidebar.tsx`
- Create: `src/components/navigation/NavItem/NavItem.tsx`
- Create: `src/components/window/Topbar/Topbar.tsx`
- Create: `src/components/window/WindowControls/WindowControls.tsx`
- Create: `src/styles/shell.css`

- [ ] **Step 1: Write a failing shell navigation test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../app/App';

describe('AppShell', () => {
  it('switches between nav pages and renders placeholders', async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByRole('button', { name: '一键启动' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('一键启动')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '设置' }));
    expect(screen.getByRole('button', { name: '设置' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('设置 页面建设中')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '模型管理' }));
    expect(screen.getByText('模型管理 页面建设中')).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run the shell test to confirm it fails**

Run: `npm run test -- --run src/layouts/AppShell/AppShell.test.tsx`

Expected: FAIL because the sidebar and page-switching shell do not exist yet.

- [ ] **Step 3: Implement the shell, navigation registry, and placeholder pages**

```ts
export type PageId =
  | 'home'
  | 'settings'
  | 'advanced'
  | 'troubleshooting'
  | 'versions'
  | 'models'
  | 'tools'
  | 'community'
  | 'ideas'
  | 'console';

export interface NavItemData {
  id: PageId;
  label: string;
  icon: string;
  section: 'primary' | 'secondary';
}

export const navItems: NavItemData[] = [
  { id: 'home', label: '一键启动', icon: '▶', section: 'primary' },
  { id: 'settings', label: '设置', icon: '⚙', section: 'primary' },
  { id: 'advanced', label: '高级选项', icon: '≣', section: 'primary' },
  { id: 'troubleshooting', label: '疑难解答', icon: '⌘', section: 'primary' },
  { id: 'versions', label: '版本管理', icon: '🕘', section: 'primary' },
  { id: 'models', label: '模型管理', icon: '◫', section: 'primary' },
  { id: 'tools', label: '小工具', icon: '🧰', section: 'primary' },
  { id: 'community', label: '交流群', icon: '💬', section: 'secondary' },
  { id: 'ideas', label: '灯泡', icon: '💡', section: 'secondary' },
  { id: 'console', label: '控制台', icon: '⌨', section: 'secondary' },
];
```

```tsx
import type { ReactElement } from 'react';
import { PlaceholderPage } from '../pages/PlaceholderPage/PlaceholderPage';
import type { PageId } from '../data/nav';

export function renderPage(pageId: PageId): ReactElement {
  switch (pageId) {
    case 'home':
      return (
        <PlaceholderPage
          title="一键启动"
          description="首页完整复刻将在后续任务中接入。"
        />
      );
    case 'settings':
      return (
        <PlaceholderPage
          title="设置"
          description="设置页完整复刻将在后续任务中接入。"
        />
      );
    case 'advanced':
      return (
        <PlaceholderPage
          title="高级选项"
          description="预留更细粒度的启动和环境参数配置。"
        />
      );
    case 'troubleshooting':
      return (
        <PlaceholderPage
          title="疑难解答"
          description="预留日志、诊断和修复入口。"
        />
      );
    case 'versions':
      return (
        <PlaceholderPage
          title="版本管理"
          description="预留多版本切换和回滚能力。"
        />
      );
    case 'models':
      return (
        <PlaceholderPage
          title="模型管理"
          description="预留模型浏览、下载和目录管理。"
        />
      );
    case 'tools':
      return (
        <PlaceholderPage
          title="小工具"
          description="预留常用工具和附加操作入口。"
        />
      );
    case 'community':
      return (
        <PlaceholderPage
          title="交流群"
          description="预留社区入口和外链跳转。"
        />
      );
    case 'ideas':
      return (
        <PlaceholderPage
          title="灯泡"
          description="预留提示、公告和推荐信息。"
        />
      );
    case 'console':
      return (
        <PlaceholderPage
          title="控制台"
          description="预留运行日志和命令输出视图。"
        />
      );
  }
}
```

```tsx
import { useState } from 'react';
import { Sidebar } from '../../components/navigation/Sidebar/Sidebar';
import { Topbar } from '../../components/window/Topbar/Topbar';
import { navItems, type PageId } from '../../data/nav';
import { renderPage } from '../../app/routes';

export function AppShell() {
  const [activePage, setActivePage] = useState<PageId>('home');

  return (
    <div className="launcher-root">
      <div className="app-shell">
        <Sidebar
          items={navItems}
          activePage={activePage}
          onSelect={setActivePage}
        />

        <main className="content-shell">
          <Topbar title="UI 复刻预览" />
          <section className="page-shell">{renderPage(activePage)}</section>
        </main>
      </div>
    </div>
  );
}
```

```tsx
import { AppShell } from '../layouts/AppShell/AppShell';
import { Providers } from './providers';
import '../styles/shell.css';

function App() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}

export default App;
```

```tsx
interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <div className="placeholder-page">
      <div className="placeholder-card">
        <div className="placeholder-kicker">Template Slot</div>
        <h1>{title} 页面建设中</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}
```

```tsx
import type { NavItemData, PageId } from '../../../data/nav';

interface NavItemProps {
  item: NavItemData;
  active: boolean;
  onSelect: (id: PageId) => void;
}

export function NavItem({ item, active, onSelect }: NavItemProps) {
  return (
    <button
      type="button"
      className={`nav-item${active ? ' active' : ''}`}
      aria-pressed={active}
      onClick={() => onSelect(item.id)}
    >
      <span className="nav-icon" aria-hidden="true">
        {item.icon}
      </span>
      <span>{item.label}</span>
    </button>
  );
}
```

```tsx
import { NavItem } from '../NavItem/NavItem';
import type { NavItemData, PageId } from '../../../data/nav';

interface SidebarProps {
  items: NavItemData[];
  activePage: PageId;
  onSelect: (id: PageId) => void;
}

export function Sidebar({ items, activePage, onSelect }: SidebarProps) {
  const primaryItems = items.filter((item) => item.section === 'primary');
  const secondaryItems = items.filter((item) => item.section === 'secondary');

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-dot" aria-hidden="true" />
        <span>绘世 2.8.5</span>
      </div>

      <div className="nav">
        {primaryItems.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            active={item.id === activePage}
            onSelect={onSelect}
          />
        ))}

        <div className="nav-spacer" />

        {secondaryItems.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            active={item.id === activePage}
            onSelect={onSelect}
          />
        ))}
      </div>
    </aside>
  );
}
```

```tsx
export function WindowControls() {
  return (
    <div className="window-btns" aria-label="窗口控制">
      <button type="button" className="window-btn" aria-label="最小化窗口">
        —
      </button>
      <button type="button" className="window-btn" aria-label="切换最大化窗口">
        □
      </button>
      <button type="button" className="window-btn" aria-label="关闭窗口">
        ×
      </button>
    </div>
  );
}
```

```tsx
import { WindowControls } from '../WindowControls/WindowControls';

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-title" data-tauri-drag-region>
        {title}
      </div>
      <div className="topbar-right">
        <div className="topbar-help">?</div>
        <WindowControls />
      </div>
    </header>
  );
}
```

```css
.launcher-root {
  min-height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at 20% -10%, rgba(59, 130, 246, 0.14), transparent 28%),
    radial-gradient(circle at 100% 0%, rgba(236, 72, 153, 0.08), transparent 24%),
    linear-gradient(180deg, #0f1216 0%, #14181d 100%);
}

.app-shell {
  width: min(1440px, 100%);
  height: min(900px, calc(100vh - 48px));
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  background: #101419;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 22px;
  overflow: hidden;
  box-shadow: var(--shadow);
}

.sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 10px;
  background: linear-gradient(180deg, #13171d 0%, #11151a 100%);
  border-right: 1px solid var(--line);
}

.brand {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
  color: #fff;
  font-size: 14px;
  opacity: 0.95;
}

.brand-dot {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(135deg, #ff8fb1, #9b8cff);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.08) inset;
}

.nav {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.nav-item {
  width: 100%;
  min-height: 68px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  color: #e7edf7;
  font-size: 12px;
  transition: 0.2s ease;
  opacity: 0.86;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.04);
  opacity: 1;
}

.nav-item.active {
  background: linear-gradient(180deg, rgba(74, 144, 226, 0.14), rgba(74, 144, 226, 0.06));
  border-color: rgba(74, 144, 226, 0.28);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
  opacity: 1;
}

.nav-icon {
  font-size: 21px;
  line-height: 1;
}

.nav-spacer {
  flex: 1;
}

.content-shell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: linear-gradient(180deg, #171b22 0%, #161a21 100%);
}

.topbar {
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  color: var(--muted);
  font-size: 14px;
  border-bottom: 1px solid var(--line);
}

.topbar-title {
  flex: 1;
  display: flex;
  align-items: center;
  height: 100%;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.topbar-help {
  opacity: 0.8;
}

.window-btns {
  display: flex;
  gap: 10px;
}

.window-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: 16px;
  opacity: 0.8;
}

.window-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  opacity: 1;
}

.page-shell {
  flex: 1;
  overflow: auto;
  padding: 16px 18px 18px;
}

.placeholder-page {
  min-height: 100%;
  display: grid;
  place-items: center;
}

.placeholder-card {
  width: min(520px, 100%);
  padding: 28px 30px;
  border-radius: 18px;
  background: linear-gradient(180deg, #1c222a, #191f27);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.placeholder-kicker {
  margin-bottom: 8px;
  color: var(--accent);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
}

.placeholder-card h1 {
  margin: 0 0 10px;
  font-size: 28px;
}

.placeholder-card p {
  margin: 0;
  color: #c0cad8;
  line-height: 1.8;
}

@media (max-width: 900px) {
  .app-shell {
    grid-template-columns: 72px 1fr;
  }
}
```

- [ ] **Step 4: Run the shell test to confirm it passes**

Run: `npm run test -- --run src/layouts/AppShell/AppShell.test.tsx`

Expected: PASS with one passing navigation test.

- [ ] **Step 5: Commit the shell**

```bash
git add src/app/App.tsx src/app/routes.tsx src/data/nav.ts src/layouts/AppShell/AppShell.tsx src/layouts/AppShell/AppShell.test.tsx src/pages/PlaceholderPage/PlaceholderPage.tsx src/components/navigation/Sidebar/Sidebar.tsx src/components/navigation/NavItem/NavItem.tsx src/components/window/Topbar/Topbar.tsx src/components/window/WindowControls/WindowControls.tsx src/styles/shell.css
git commit -m "feat: add launcher shell navigation"
```

## Task 4: Implement the Home Page Recreation

**Files:**
- Modify: `src/app/routes.tsx`
- Create: `src/data/home.ts`
- Create: `src/pages/HomePage/HomePage.tsx`
- Create: `src/pages/HomePage/HomePage.test.tsx`
- Create: `src/components/home/HeroBanner/HeroBanner.tsx`
- Create: `src/components/home/FolderGrid/FolderGrid.tsx`
- Create: `src/components/home/FolderCard/FolderCard.tsx`
- Create: `src/components/home/NoticePanel/NoticePanel.tsx`
- Create: `src/styles/home.css`

- [ ] **Step 1: Write a failing home-page test**

```tsx
import { render, screen } from '@testing-library/react';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders the hero, folders, metadata, and announcement panel', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', { name: '绘世 - 启动器' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Stable Diffusion WebUI')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /打开 / })).toHaveLength(8);
    expect(screen.getByText('启动器版本：2.6.17 Build 222')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '✈ 运行中' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the home-page test to confirm it fails**

Run: `npm run test -- --run src/pages/HomePage/HomePage.test.tsx`

Expected: FAIL because `HomePage` and its child components do not exist yet.

- [ ] **Step 3: Implement the homepage data and components**

```ts
export interface HeroConfettiPiece {
  top: string;
  left: string;
  color: string;
  rotate: string;
  width?: string;
}

export interface FolderItem {
  title: string;
  path: string;
  icon: string;
}

export const heroCopy = {
  eyebrow: 'Stable Diffusion WebUI',
  title: '绘世 - 启动器',
  description: '让 AI 与你一同创作，让画笔随心所欲！',
};

export const heroConfetti: HeroConfettiPiece[] = [
  { top: '40px', left: '63%', color: '#ffd54b', rotate: '-28deg' },
  { top: '72px', left: '70%', color: '#7ef9ff', rotate: '-52deg', width: '24px' },
  { top: '54px', left: '81%', color: '#ff79c6', rotate: '16deg', width: '22px' },
  { top: '120px', left: '88%', color: '#ffe36f', rotate: '-62deg', width: '26px' },
  { top: '126px', left: '28%', color: '#ff9a43', rotate: '-28deg', width: '12px' },
  { top: '165px', left: '16%', color: '#8dd0ff', rotate: '18deg', width: '18px' },
  { top: '196px', left: '10%', color: '#f1cf67', rotate: '-12deg', width: '22px' },
  { top: '178px', left: '76%', color: '#72a7ff', rotate: '-32deg', width: '18px' },
];

export const folders: FolderItem[] = [
  { title: '根目录', path: '.', icon: '📁' },
  { title: '扩展文件夹', path: 'extensions', icon: '🧷' },
  { title: '临时文件夹', path: 'tmp', icon: '🧹' },
  { title: '超分输出', path: 'extras-images', icon: '⊞' },
  { title: '文生图（网格）', path: 'txt2img-grids', icon: '🖹' },
  { title: '文生图（单图）', path: 'txt2img-images', icon: '📄' },
  { title: '图生图（网格）', path: 'img2img-grids', icon: '🖼' },
  { title: '图生图（单图）', path: 'img2img-images', icon: '▣' },
];

export const versionMeta = [
  '启动器版本：2.6.17 Build 222',
  '源码交付标签：2023-12-15 13:55',
  'SD-WebUI 版本：4afasf8 · add changelog c... (2023-11-04 00:50:14)',
];

export const notices = [
  '近期有人假冒所谓“秋叶研发小组人员”散布欺诈消息，请注意甄别身份与启动器均为个人项目，不存在任何研发小组概念，请提高警惕，谨防诈骗。',
  '本启动器免费提供，如您通过其他渠道付费获得本软件，请立即退款并投诉相关商家。',
  '本启动器作者为纯白忧伤王秋葉 aaki@bilibili（UID 12566101）。',
];

export const runButtonLabel = '✈ 运行中';
```

```tsx
import { heroConfetti, heroCopy } from '../../../data/home';

export function HeroBanner() {
  return (
    <section className="hero">
      <div className="mountains" aria-hidden="true">
        <div className="mountain" />
        <div className="mountain" />
        <div className="mountain" />
        <div className="mountain" />
        <div className="mountain" />
      </div>

      <div className="confetti" aria-hidden="true">
        {heroConfetti.map((piece) => (
          <span
            key={`${piece.top}-${piece.left}`}
            style={{
              top: piece.top,
              left: piece.left,
              ['--c' as string]: piece.color,
              ['--r' as string]: piece.rotate,
              width: piece.width,
            }}
          />
        ))}
      </div>

      <div className="hero-copy">
        <div className="hero-copy__eyebrow">{heroCopy.eyebrow}</div>
        <h1>{heroCopy.title}</h1>
        <p>{heroCopy.description}</p>
      </div>
    </section>
  );
}
```

```tsx
import type { FolderItem } from '../../../data/home';

interface FolderCardProps {
  item: FolderItem;
}

export function FolderCard({ item }: FolderCardProps) {
  return (
    <button
      type="button"
      className="folder-card"
      aria-label={`打开 ${item.title}`}
    >
      <span className="folder-left">
        <span className="folder-icon" aria-hidden="true">
          {item.icon}
        </span>
        <span className="folder-text">
          <span className="folder-title">{item.title}</span>
          <span className="folder-sub">{item.path}</span>
        </span>
      </span>

      <span className="arrow" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
```

```tsx
import type { FolderItem } from '../../../data/home';
import { FolderCard } from '../FolderCard/FolderCard';

interface FolderGridProps {
  items: FolderItem[];
}

export function FolderGrid({ items }: FolderGridProps) {
  return (
    <div className="folder-grid">
      {items.map((item) => (
        <FolderCard key={item.title} item={item} />
      ))}
    </div>
  );
}
```

```tsx
interface NoticePanelProps {
  notices: string[];
  buttonLabel: string;
}

export function NoticePanel({ notices, buttonLabel }: NoticePanelProps) {
  return (
    <aside className="notice">
      <h3>公告</h3>

      {notices.map((notice) => (
        <p key={notice}>{notice}</p>
      ))}

      <button type="button" className="run-btn">
        {buttonLabel}
      </button>
    </aside>
  );
}
```

```tsx
import { FolderGrid } from '../../components/home/FolderGrid/FolderGrid';
import { HeroBanner } from '../../components/home/HeroBanner/HeroBanner';
import { NoticePanel } from '../../components/home/NoticePanel/NoticePanel';
import { folders, notices, runButtonLabel, versionMeta } from '../../data/home';

export function HomePage() {
  return (
    <div className="home-page">
      <HeroBanner />

      <div className="main-grid">
        <div>
          <div className="section-title">文件夹</div>
          <FolderGrid items={folders} />

          <div className="meta">
            {versionMeta.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>

        <NoticePanel notices={notices} buttonLabel={runButtonLabel} />
      </div>
    </div>
  );
}
```

```tsx
import { HomePage } from '../pages/HomePage/HomePage';
import { PlaceholderPage } from '../pages/PlaceholderPage/PlaceholderPage';
import type { PageId } from '../data/nav';

export function renderPage(pageId: PageId) {
  switch (pageId) {
    case 'home':
      return <HomePage />;
    case 'settings':
      return (
        <PlaceholderPage
          title="设置"
          description="设置页完整复刻将在后续任务中接入。"
        />
      );
    case 'advanced':
      return (
        <PlaceholderPage
          title="高级选项"
          description="预留更细粒度的启动和环境参数配置。"
        />
      );
    case 'troubleshooting':
      return (
        <PlaceholderPage
          title="疑难解答"
          description="预留日志、诊断和修复入口。"
        />
      );
    case 'versions':
      return (
        <PlaceholderPage
          title="版本管理"
          description="预留多版本切换和回滚能力。"
        />
      );
    case 'models':
      return (
        <PlaceholderPage
          title="模型管理"
          description="预留模型浏览、下载和目录管理。"
        />
      );
    case 'tools':
      return (
        <PlaceholderPage
          title="小工具"
          description="预留常用工具和附加操作入口。"
        />
      );
    case 'community':
      return (
        <PlaceholderPage
          title="交流群"
          description="预留社区入口和外链跳转。"
        />
      );
    case 'ideas':
      return (
        <PlaceholderPage
          title="灯泡"
          description="预留提示、公告和推荐信息。"
        />
      );
    case 'console':
      return (
        <PlaceholderPage
          title="控制台"
          description="预留运行日志和命令输出视图。"
        />
      );
  }
}
```

```css
.home-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.hero {
  position: relative;
  min-height: 246px;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background:
    radial-gradient(circle at 62% 46%, rgba(255, 182, 193, 0.42), transparent 10%),
    linear-gradient(135deg, rgba(98, 147, 194, 0.88), rgba(60, 66, 99, 0.92) 44%, rgba(43, 48, 67, 0.98));
}

.hero::before,
.hero::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.hero::before {
  background:
    linear-gradient(115deg, transparent 45%, rgba(255, 93, 181, 0.45) 49%, rgba(255, 222, 245, 0.85) 50%, rgba(255, 93, 181, 0.45) 51%, transparent 55%),
    radial-gradient(circle at 85% 22%, rgba(255, 255, 255, 0.35), transparent 10%),
    radial-gradient(circle at 88% 28%, rgba(255, 255, 255, 0.22), transparent 18%);
  mix-blend-mode: screen;
  opacity: 0.9;
}

.mountains {
  position: absolute;
  inset: auto 0 0 0;
  height: 72%;
}

.mountain {
  position: absolute;
  bottom: -6px;
  width: 0;
  height: 0;
  border-left: 120px solid transparent;
  border-right: 120px solid transparent;
  border-bottom: 180px solid rgba(31, 35, 47, 0.94);
  filter: drop-shadow(0 20px 25px rgba(0, 0, 0, 0.28));
}

.mountain:nth-child(1) {
  left: 15%;
  transform: scale(1.1);
}

.mountain:nth-child(2) {
  left: 29%;
  border-bottom-color: rgba(35, 41, 56, 0.96);
  transform: scale(0.82);
}

.mountain:nth-child(3) {
  left: 41%;
  border-bottom-color: rgba(26, 29, 39, 0.98);
  transform: scale(1.26);
}

.mountain:nth-child(4) {
  left: 63%;
  border-bottom-color: rgba(49, 55, 74, 0.92);
  transform: scale(0.88);
}

.mountain:nth-child(5) {
  left: 77%;
  border-bottom-color: rgba(43, 49, 66, 0.94);
  transform: scale(1.05);
}

.confetti span {
  position: absolute;
  width: 18px;
  height: 8px;
  border-radius: 2px;
  opacity: 0.85;
  transform: rotate(var(--r));
  background: var(--c);
  box-shadow: 0 0 24px color-mix(in srgb, var(--c) 70%, transparent);
}

.hero-copy {
  position: relative;
  z-index: 2;
  max-width: 560px;
  padding: 44px 52px;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.28);
}

.hero-copy__eyebrow {
  margin-bottom: 10px;
  font-size: 19px;
  opacity: 0.96;
}

.hero-copy h1 {
  margin: 0 0 10px;
  font-size: 46px;
  line-height: 1.12;
  letter-spacing: 0.5px;
}

.hero-copy p {
  margin: 0;
  font-size: 18px;
  color: rgba(255, 255, 255, 0.9);
}

.main-grid {
  display: grid;
  grid-template-columns: 1.2fr 320px;
  gap: 18px;
}

.section-title {
  margin: 8px 0 14px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.folder-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.folder-card {
  min-height: 102px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px;
  background: linear-gradient(180deg, #202732, #1b212a);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  color: inherit;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.folder-left {
  min-width: 0;
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.folder-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: linear-gradient(180deg, #2d3643, #232a35);
  color: #dbe7ff;
  border: 1px solid rgba(255, 255, 255, 0.05);
  flex: none;
}

.folder-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.folder-title {
  margin: 2px 0 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-sub {
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.arrow {
  color: #b0bccd;
  font-size: 22px;
  opacity: 0.8;
  flex: none;
}

.meta {
  margin-top: 18px;
  padding: 8px 2px 0;
  color: #adb8c7;
  font-size: 14px;
  line-height: 1.95;
}

.notice {
  min-height: 420px;
  display: flex;
  flex-direction: column;
  padding: 18px 18px 20px;
  border-radius: 16px;
  background: linear-gradient(180deg, #1b212a, #171c24);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.notice h3 {
  margin: 2px 0 16px;
  font-size: 18px;
}

.notice p {
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 1.8;
  color: #c0cad8;
}

.run-btn {
  margin-top: auto;
  height: 68px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(180deg, #36aaff, #2794fb);
  color: #f8fbff;
  font-size: 21px;
  letter-spacing: 1px;
  box-shadow: 0 12px 30px rgba(39, 148, 251, 0.28);
}

@media (max-width: 1180px) {
  .main-grid {
    grid-template-columns: 1fr;
  }

  .notice {
    min-height: auto;
  }

  .folder-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .folder-grid {
    grid-template-columns: 1fr;
  }

  .hero-copy {
    padding: 28px;
  }

  .hero-copy h1 {
    font-size: 34px;
  }

  .hero-copy p,
  .hero-copy__eyebrow {
    font-size: 16px;
  }
}
```

- [ ] **Step 4: Run the home-page test to confirm it passes**

Run: `npm run test -- --run src/pages/HomePage/HomePage.test.tsx`

Expected: PASS with one passing homepage test.

- [ ] **Step 5: Commit the homepage**

```bash
git add src/app/routes.tsx src/data/home.ts src/pages/HomePage/HomePage.tsx src/pages/HomePage/HomePage.test.tsx src/components/home/HeroBanner/HeroBanner.tsx src/components/home/FolderGrid/FolderGrid.tsx src/components/home/FolderCard/FolderCard.tsx src/components/home/NoticePanel/NoticePanel.tsx src/styles/home.css
git commit -m "feat: add recreated launcher home page"
```

## Task 5: Implement the Settings Page Recreation

**Files:**
- Modify: `src/app/routes.tsx`
- Create: `src/data/settings.ts`
- Create: `src/pages/SettingsPage/SettingsPage.tsx`
- Create: `src/pages/SettingsPage/SettingsPage.test.tsx`
- Create: `src/components/settings/SettingsTabs/SettingsTabs.tsx`
- Create: `src/components/settings/SettingCard/SettingCard.tsx`
- Create: `src/components/settings/SettingRow/SettingRow.tsx`
- Create: `src/components/settings/ToggleSwitch/ToggleSwitch.tsx`
- Create: `src/styles/settings.css`

- [ ] **Step 1: Write a failing settings-page test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  it('renders settings controls and switches tabs', async () => {
    const user = userEvent.setup();

    render(<SettingsPage />);

    expect(
      screen.getByRole('tab', { name: '一般设置', selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('代理服务器地址')).toHaveValue(
      'http://127.0.0.1:xxxx',
    );
    expect(
      screen.getByRole('button', { name: '将代理应用到 Git' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('tab', { name: '关于' }));
    expect(
      screen.getByText('XnneHangLab Launcher Template'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the settings-page test to confirm it fails**

Run: `npm run test -- --run src/pages/SettingsPage/SettingsPage.test.tsx`

Expected: FAIL because `SettingsPage` and its child components do not exist yet.

- [ ] **Step 3: Implement the settings data and components**

```ts
export type SettingsTabId = 'general' | 'about';

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
}

export interface ToggleSetting {
  id: string;
  label: string;
  description?: string;
  defaultValue: boolean;
  icon?: string;
}

export const settingsTabs: SettingsTab[] = [
  { id: 'general', label: '一般设置' },
  { id: 'about', label: '关于' },
];

export const proxyDefaults = {
  address: 'http://127.0.0.1:xxxx',
  git: true,
  pip: true,
  env: true,
  modelDownload: true,
};

export const mirrorSettings: ToggleSetting[] = [
  {
    id: 'pypiMirror',
    label: 'PyPI 国内镜像',
    description: '通过国内镜像下载 Python 软件包',
    defaultValue: false,
    icon: 'Py',
  },
  {
    id: 'gitMirror',
    label: 'Git 国内镜像',
    description: '通过国内镜像下载 Git 仓库',
    defaultValue: false,
    icon: '⎇',
  },
  {
    id: 'hfMirror',
    label: 'Huggingface 国内镜像',
    description: '通过国内镜像下载 Huggingface 模型',
    defaultValue: false,
    icon: '🤗',
  },
  {
    id: 'replaceExtensionList',
    label: '替换扩展列表链接',
    description: '将内置扩展列表链接替换为国内镜像链接',
    defaultValue: false,
    icon: '📄',
  },
  {
    id: 'githubAccel',
    label: 'GitHub 加速',
    description: '提供未镜像的扩展下载速度',
    defaultValue: false,
    icon: '◎',
  },
];

export const preferenceSettings: ToggleSetting[] = [
  {
    id: 'darkTheme',
    label: '主题模式',
    description: '深色主题，复刻原界面质感',
    defaultValue: true,
    icon: '🎨',
  },
  {
    id: 'pagePreview',
    label: '页面预览',
    description: '点击左侧导航可切换主页与设置页',
    defaultValue: true,
    icon: '🗂',
  },
];

export const aboutInfo = [
  'XnneHangLab Launcher Template',
  '第一阶段聚焦于桌面壳和 UI 复刻。',
  '后续将逐步接入环境检查、下载和启动逻辑。',
];
```

```tsx
import type { SettingsTab, SettingsTabId } from '../../../data/settings';

interface SettingsTabsProps {
  items: SettingsTab[];
  activeTab: SettingsTabId;
  onSelect: (id: SettingsTabId) => void;
}

export function SettingsTabs({
  items,
  activeTab,
  onSelect,
}: SettingsTabsProps) {
  return (
    <div className="settings-tabs" role="tablist" aria-label="设置标签">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === activeTab}
          className={`settings-tab${item.id === activeTab ? ' active' : ''}`}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
```

```tsx
import type { PropsWithChildren } from 'react';

interface SettingCardProps extends PropsWithChildren {
  title?: string;
}

export function SettingCard({ title, children }: SettingCardProps) {
  return (
    <section className="setting-card">
      {title ? <div className="group-title">{title}</div> : null}
      {children}
    </section>
  );
}
```

```tsx
import type { PropsWithChildren, ReactNode } from 'react';

interface SettingRowProps extends PropsWithChildren {
  name: string;
  description?: string;
  icon?: string;
  trailing?: ReactNode;
  inset?: boolean;
}

export function SettingRow({
  name,
  description,
  icon,
  trailing,
  inset = false,
  children,
}: SettingRowProps) {
  return (
    <div className="setting-row">
      <div className="setting-main">
        {icon ? (
          <div className="setting-icon" aria-hidden="true">
            {icon}
          </div>
        ) : null}

        <div className={`setting-text${inset ? ' inset' : ''}`}>
          <div className="setting-name">{name}</div>
          {description ? <div className="setting-desc">{description}</div> : null}
        </div>
      </div>

      <div className="setting-action">
        {children}
        {trailing}
      </div>
    </div>
  );
}
```

```tsx
interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

export function ToggleSwitch({
  label,
  checked,
  onChange,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      className={`switch${checked ? ' on' : ''}`}
      aria-label={label}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    />
  );
}
```

```tsx
import { useState } from 'react';
import { SettingCard } from '../../components/settings/SettingCard/SettingCard';
import { SettingRow } from '../../components/settings/SettingRow/SettingRow';
import { SettingsTabs } from '../../components/settings/SettingsTabs/SettingsTabs';
import { ToggleSwitch } from '../../components/settings/ToggleSwitch/ToggleSwitch';
import {
  aboutInfo,
  mirrorSettings,
  preferenceSettings,
  proxyDefaults,
  settingsTabs,
  type SettingsTabId,
} from '../../data/settings';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [proxyAddress, setProxyAddress] = useState(proxyDefaults.address);
  const [proxyToggles, setProxyToggles] = useState({
    git: proxyDefaults.git,
    pip: proxyDefaults.pip,
    env: proxyDefaults.env,
    modelDownload: proxyDefaults.modelDownload,
  });
  const [mirrorToggles, setMirrorToggles] = useState(
    Object.fromEntries(
      mirrorSettings.map((item) => [item.id, item.defaultValue]),
    ) as Record<string, boolean>,
  );
  const [preferenceToggles, setPreferenceToggles] = useState(
    Object.fromEntries(
      preferenceSettings.map((item) => [item.id, item.defaultValue]),
    ) as Record<string, boolean>,
  );

  return (
    <div className="settings-shell">
      <SettingsTabs
        items={settingsTabs}
        activeTab={activeTab}
        onSelect={setActiveTab}
      />

      <div className="settings-wrap">
        {activeTab === 'general' ? (
          <>
            <div className="group-title group-title--standalone">网络设置</div>

            <SettingCard>
              <SettingRow
                name="代理设置"
                description="代理服务器设置"
                icon="🛩"
                trailing={<span className="setting-chevron">⌃</span>}
              />

              <SettingRow name="代理服务器地址" inset>
                <input
                  className="proxy-input"
                  aria-label="代理服务器地址"
                  value={proxyAddress}
                  onChange={(event) => setProxyAddress(event.target.value)}
                />
              </SettingRow>

              <SettingRow name="将代理应用到 Git" inset>
                <ToggleSwitch
                  label="将代理应用到 Git"
                  checked={proxyToggles.git}
                  onChange={(next) =>
                    setProxyToggles((current) => ({ ...current, git: next }))
                  }
                />
              </SettingRow>

              <SettingRow name="将代理应用到 Pip" inset>
                <ToggleSwitch
                  label="将代理应用到 Pip"
                  checked={proxyToggles.pip}
                  onChange={(next) =>
                    setProxyToggles((current) => ({ ...current, pip: next }))
                  }
                />
              </SettingRow>

              <SettingRow name="将代理应用到环境变量" inset>
                <ToggleSwitch
                  label="将代理应用到环境变量"
                  checked={proxyToggles.env}
                  onChange={(next) =>
                    setProxyToggles((current) => ({ ...current, env: next }))
                  }
                />
              </SettingRow>

              <SettingRow name="将代理应用到模型下载" inset>
                <ToggleSwitch
                  label="将代理应用到模型下载"
                  checked={proxyToggles.modelDownload}
                  onChange={(next) =>
                    setProxyToggles((current) => ({
                      ...current,
                      modelDownload: next,
                    }))
                  }
                />
              </SettingRow>
            </SettingCard>

            <SettingCard>
              {mirrorSettings.map((item) => (
                <SettingRow
                  key={item.id}
                  name={item.label}
                  description={item.description}
                  icon={item.icon}
                >
                  <ToggleSwitch
                    label={item.label}
                    checked={mirrorToggles[item.id]}
                    onChange={(next) =>
                      setMirrorToggles((current) => ({
                        ...current,
                        [item.id]: next,
                      }))
                    }
                  />
                </SettingRow>
              ))}
            </SettingCard>

            <div className="group-title group-title--standalone">偏好设置</div>

            <SettingCard>
              {preferenceSettings.map((item) => (
                <SettingRow
                  key={item.id}
                  name={item.label}
                  description={item.description}
                  icon={item.icon}
                >
                  <ToggleSwitch
                    label={item.label}
                    checked={preferenceToggles[item.id]}
                    onChange={(next) =>
                      setPreferenceToggles((current) => ({
                        ...current,
                        [item.id]: next,
                      }))
                    }
                  />
                </SettingRow>
              ))}
            </SettingCard>

            <div className="footer-space" />
          </>
        ) : (
          <div className="about-card">
            {aboutInfo.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

```tsx
import { HomePage } from '../pages/HomePage/HomePage';
import { PlaceholderPage } from '../pages/PlaceholderPage/PlaceholderPage';
import { SettingsPage } from '../pages/SettingsPage/SettingsPage';
import type { PageId } from '../data/nav';

export function renderPage(pageId: PageId) {
  switch (pageId) {
    case 'home':
      return <HomePage />;
    case 'settings':
      return <SettingsPage />;
    case 'advanced':
      return (
        <PlaceholderPage
          title="高级选项"
          description="预留更细粒度的启动和环境参数配置。"
        />
      );
    case 'troubleshooting':
      return (
        <PlaceholderPage
          title="疑难解答"
          description="预留日志、诊断和修复入口。"
        />
      );
    case 'versions':
      return (
        <PlaceholderPage
          title="版本管理"
          description="预留多版本切换和回滚能力。"
        />
      );
    case 'models':
      return (
        <PlaceholderPage
          title="模型管理"
          description="预留模型浏览、下载和目录管理。"
        />
      );
    case 'tools':
      return (
        <PlaceholderPage
          title="小工具"
          description="预留常用工具和附加操作入口。"
        />
      );
    case 'community':
      return (
        <PlaceholderPage
          title="交流群"
          description="预留社区入口和外链跳转。"
        />
      );
    case 'ideas':
      return (
        <PlaceholderPage
          title="灯泡"
          description="预留提示、公告和推荐信息。"
        />
      );
    case 'console':
      return (
        <PlaceholderPage
          title="控制台"
          description="预留运行日志和命令输出视图。"
        />
      );
  }
}
```

```css
.settings-shell {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 14px;
  height: 100%;
}

.settings-tabs {
  display: flex;
  gap: 18px;
  padding: 2px 6px 0;
  color: #d8e0ec;
  font-size: 15px;
  border-bottom: 1px solid var(--line);
}

.settings-tab {
  position: relative;
  padding: 10px 2px 14px;
  background: transparent;
  border: 0;
  color: inherit;
  opacity: 0.8;
}

.settings-tab.active,
.settings-tab[aria-selected='true'] {
  opacity: 1;
}

.settings-tab.active::after,
.settings-tab[aria-selected='true']::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 3px;
  border-radius: 999px;
  background: var(--accent);
}

.settings-wrap {
  overflow: auto;
  padding-right: 4px;
}

.group-title {
  margin: 10px 0 12px;
  font-size: 20px;
  font-weight: 700;
}

.group-title--standalone {
  margin-top: 0;
}

.setting-card {
  margin-bottom: 14px;
  overflow: hidden;
  border-radius: 16px;
  background: linear-gradient(180deg, #1c222a, #191f27);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.setting-row {
  min-height: 70px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 20px;
  align-items: center;
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.setting-row:first-child {
  border-top: 0;
}

.setting-main {
  min-width: 0;
  display: flex;
  gap: 14px;
  align-items: center;
}

.setting-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: #232a34;
  color: #d8e5ff;
  border: 1px solid rgba(255, 255, 255, 0.05);
  flex: none;
}

.setting-text {
  min-width: 0;
}

.setting-text.inset {
  padding-left: 52px;
}

.setting-name {
  margin-bottom: 4px;
  font-size: 15px;
}

.setting-desc {
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.setting-action {
  display: flex;
  align-items: center;
  gap: 12px;
}

.setting-chevron {
  opacity: 0.6;
}

.proxy-input {
  width: 230px;
  height: 38px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1px solid rgba(121, 161, 221, 0.6);
  background: #1a212a;
  color: #dce7f6;
  outline: none;
  font-size: 14px;
}

.switch {
  position: relative;
  width: 42px;
  height: 22px;
  border: 0;
  border-radius: 999px;
  background: #3b4350;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e9edf4;
  transition: 0.2s ease;
}

.switch.on,
.switch[aria-pressed='true'] {
  background: linear-gradient(180deg, #36a3ff, #2488f7);
}

.switch.on::after,
.switch[aria-pressed='true']::after {
  left: 23px;
}

.about-card {
  padding: 24px;
  border-radius: 16px;
  background: linear-gradient(180deg, #1b212a, #171c24);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.about-card p {
  margin: 0 0 12px;
  line-height: 1.8;
  color: #c0cad8;
}

.about-card p:last-child {
  margin-bottom: 0;
}

.footer-space {
  height: 20px;
}

@media (max-width: 900px) {
  .proxy-input {
    width: 170px;
  }
}
```

- [ ] **Step 4: Run the settings-page test to confirm it passes**

Run: `npm run test -- --run src/pages/SettingsPage/SettingsPage.test.tsx`

Expected: PASS with one passing settings-page test.

- [ ] **Step 5: Commit the settings page**

```bash
git add src/app/routes.tsx src/data/settings.ts src/pages/SettingsPage/SettingsPage.tsx src/pages/SettingsPage/SettingsPage.test.tsx src/components/settings/SettingsTabs/SettingsTabs.tsx src/components/settings/SettingCard/SettingCard.tsx src/components/settings/SettingRow/SettingRow.tsx src/components/settings/ToggleSwitch/ToggleSwitch.tsx src/styles/settings.css
git commit -m "feat: add recreated launcher settings page"
```

## Task 6: Wire the Desktop Window Controls and Final Verification

**Files:**
- Create: `src/services/desktop/window.ts`
- Create: `src/components/window/WindowControls/WindowControls.test.tsx`
- Create: `src/components/window/Topbar/Topbar.test.tsx`
- Modify: `src/components/window/WindowControls/WindowControls.tsx`
- Modify: `src/components/window/Topbar/Topbar.tsx`
- Modify: `src/styles/shell.css`
- Verify: `src-tauri/tauri.conf.json`
- Verify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Write failing tests for the desktop control wiring**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WindowControls } from './WindowControls';
import {
  closeWindow,
  minimizeWindow,
  toggleMaximizeWindow,
} from '../../../services/desktop/window';

vi.mock('../../../services/desktop/window', () => ({
  minimizeWindow: vi.fn(async () => undefined),
  toggleMaximizeWindow: vi.fn(async () => undefined),
  closeWindow: vi.fn(async () => undefined),
}));

describe('WindowControls', () => {
  it('calls the desktop service when the buttons are clicked', async () => {
    const user = userEvent.setup();

    render(<WindowControls />);

    await user.click(screen.getByRole('button', { name: '最小化窗口' }));
    await user.click(screen.getByRole('button', { name: '切换最大化窗口' }));
    await user.click(screen.getByRole('button', { name: '关闭窗口' }));

    expect(minimizeWindow).toHaveBeenCalledTimes(1);
    expect(toggleMaximizeWindow).toHaveBeenCalledTimes(1);
    expect(closeWindow).toHaveBeenCalledTimes(1);
  });
});
```

```tsx
import { render, screen } from '@testing-library/react';
import { Topbar } from './Topbar';

describe('Topbar', () => {
  it('marks the title area as a tauri drag region', () => {
    render(<Topbar title="UI 复刻预览" />);

    const dragNode = screen
      .getByText('UI 复刻预览')
      .closest('[data-tauri-drag-region]');

    expect(dragNode).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the desktop control tests to confirm they fail**

Run: `npm run test -- --run src/components/window/WindowControls/WindowControls.test.tsx src/components/window/Topbar/Topbar.test.tsx`

Expected: FAIL because the window-control component does not call the desktop service yet.

- [ ] **Step 3: Implement the desktop adapter and wire the controls**

```ts
import { getCurrentWindow } from '@tauri-apps/api/window';

async function runWindowAction(
  action: (appWindow: ReturnType<typeof getCurrentWindow>) => Promise<void>,
) {
  try {
    const appWindow = getCurrentWindow();
    await action(appWindow);
  } catch {
    return;
  }
}

export function minimizeWindow() {
  return runWindowAction((appWindow) => appWindow.minimize());
}

export function toggleMaximizeWindow() {
  return runWindowAction((appWindow) => appWindow.toggleMaximize());
}

export function closeWindow() {
  return runWindowAction((appWindow) => appWindow.close());
}
```

```tsx
import {
  closeWindow,
  minimizeWindow,
  toggleMaximizeWindow,
} from '../../../services/desktop/window';

export function WindowControls() {
  return (
    <div className="window-btns" aria-label="窗口控制">
      <button
        type="button"
        className="window-btn"
        aria-label="最小化窗口"
        onClick={() => void minimizeWindow()}
      >
        —
      </button>
      <button
        type="button"
        className="window-btn"
        aria-label="切换最大化窗口"
        onClick={() => void toggleMaximizeWindow()}
      >
        □
      </button>
      <button
        type="button"
        className="window-btn window-btn--close"
        aria-label="关闭窗口"
        onClick={() => void closeWindow()}
      >
        ×
      </button>
    </div>
  );
}
```

```tsx
import { WindowControls } from '../WindowControls/WindowControls';

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-title" data-tauri-drag-region>
        <span data-tauri-drag-region>{title}</span>
      </div>
      <div className="topbar-right">
        <div className="topbar-help">?</div>
        <WindowControls />
      </div>
    </header>
  );
}
```

```css
.window-btn--close:hover {
  background: rgba(232, 76, 76, 0.24);
  color: #fff;
}
```

- [ ] **Step 4: Run automated verification and desktop checks**

Run: `npm run test -- --run`

Expected: PASS with all frontend tests passing.

Run: `npm run build`

Expected: PASS and generate the `dist/` directory.

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: PASS with a successful Rust check.

Run: `npm run tauri dev`

Expected: app launches with a custom undecorated window, a draggable top title area, working minimize / maximize / close buttons, full sidebar navigation, complete Home, complete Settings, and placeholder pages for the remaining nav items.

- [ ] **Step 5: Commit the desktop integration**

```bash
git add src/services/desktop/window.ts src/components/window/WindowControls/WindowControls.tsx src/components/window/WindowControls/WindowControls.test.tsx src/components/window/Topbar/Topbar.tsx src/components/window/Topbar/Topbar.test.tsx src/styles/shell.css src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "feat: wire tauri window controls"
```

## Final Verification Checklist

- Run: `npm run test -- --run`
- Expected: all tests pass

- Run: `npm run build`
- Expected: frontend build completes successfully

- Run: `cargo check --manifest-path src-tauri/Cargo.toml`
- Expected: Rust side compiles successfully

- Run: `npm run tauri dev`
- Expected:
  - custom desktop window opens
  - top bar drag area works
  - minimize, maximize, and close buttons work
  - Home matches the reference composition
  - Settings matches the reference composition
  - non-implemented pages show placeholder shells without layout breakage

## Notes for the Implementer

- Keep the static data modules separate from page JSX even when the data is only used once in phase one.
- Do not add a global state library in this implementation pass.
- Do not replace the placeholder pages with real business logic yet.
- If a later task needs filesystem or process launch support, add it under `src/services/desktop/` instead of calling Tauri APIs throughout the component tree.
