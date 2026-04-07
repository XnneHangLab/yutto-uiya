# Day Night Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `night` / `day` theme switching to the launcher, toggle it from the sidebar lightbulb item, and persist the user’s choice in `localStorage`.

**Architecture:** Keep theme state in `AppShell`, isolate persistence logic in a tiny theme service, render the current theme via `data-theme` on the launcher root, and drive the visual differences through CSS variables in `tokens.css` plus targeted variable usage in `shell.css`, `home.css`, and `settings.css`.

**Tech Stack:** React 18, TypeScript, localStorage, CSS variables, Vitest, React Testing Library

---

## File Structure

### New Files

- Create: `src/services/theme/theme.ts`
- Create: `src/services/theme/theme.test.ts`

### Modified Files

- Modify: `src/layouts/AppShell/AppShell.tsx`
- Modify: `src/layouts/AppShell/AppShell.test.tsx`
- Modify: `src/components/navigation/Sidebar/Sidebar.tsx`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/shell.css`
- Modify: `src/styles/home.css`
- Modify: `src/styles/settings.css`

## Task 1: Add Theme State Utilities and Persistence

**Files:**
- Create: `src/services/theme/theme.ts`
- Create: `src/services/theme/theme.test.ts`

- [ ] **Step 1: Write failing tests for the theme helpers**

```ts
import {
  THEME_STORAGE_KEY,
  isThemeMode,
  readStoredTheme,
  toggleThemeMode,
  writeStoredTheme,
} from './theme';

describe('theme service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('recognizes valid theme values', () => {
    expect(isThemeMode('night')).toBe(true);
    expect(isThemeMode('day')).toBe(true);
    expect(isThemeMode('other')).toBe(false);
  });

  it('reads and writes the stored theme', () => {
    expect(readStoredTheme()).toBeNull();

    writeStoredTheme('day');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('day');
    expect(readStoredTheme()).toBe('day');
  });

  it('falls back to null for invalid stored values', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'broken');

    expect(readStoredTheme()).toBeNull();
  });

  it('toggles between day and night', () => {
    expect(toggleThemeMode('night')).toBe('day');
    expect(toggleThemeMode('day')).toBe('night');
  });
});
```

- [ ] **Step 2: Run the theme helper tests to verify they fail**

Run: `npm run test -- --run src/services/theme/theme.test.ts`

Expected: FAIL because `src/services/theme/theme.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal theme service**

```ts
export type ThemeMode = 'night' | 'day';

export const THEME_STORAGE_KEY = 'xnnehanglab.theme';

export function isThemeMode(value: string): value is ThemeMode {
  return value === 'night' || value === 'day';
}

export function readStoredTheme(): ThemeMode | null {
  const storedValue = localStorage.getItem(THEME_STORAGE_KEY);

  if (storedValue && isThemeMode(storedValue)) {
    return storedValue;
  }

  return null;
}

export function writeStoredTheme(theme: ThemeMode) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function toggleThemeMode(theme: ThemeMode): ThemeMode {
  return theme === 'night' ? 'day' : 'night';
}
```

- [ ] **Step 4: Run the theme helper tests to verify they pass**

Run: `npm run test -- --run src/services/theme/theme.test.ts`

Expected: PASS with all theme helper tests green.

- [ ] **Step 5: Commit the theme service**

```bash
git add src/services/theme/theme.ts src/services/theme/theme.test.ts
git commit -m "feat: add theme persistence helpers"
```

## Task 2: Wire Theme Switching to AppShell and the Sidebar Lightbulb

**Files:**
- Modify: `src/layouts/AppShell/AppShell.tsx`
- Modify: `src/layouts/AppShell/AppShell.test.tsx`
- Modify: `src/components/navigation/Sidebar/Sidebar.tsx`

- [ ] **Step 1: Add failing AppShell tests for theme switching and restore**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../app/App';

describe('AppShell', () => {
  const zeroLengthValues = new Set(['0', '0px']);

  beforeEach(() => {
    localStorage.clear();
  });

  it('switches between nav pages and renders active page content', async () => {
    const user = userEvent.setup();

    const { container } = render(<App />);

    const root = container.querySelector('.launcher-root');
    const shell = container.querySelector('.app-shell');

    expect(root).not.toBeNull();
    expect(shell).not.toBeNull();
    expect(getComputedStyle(root as Element).paddingTop).toBe('0px');
    expect(getComputedStyle(shell as Element).borderTopWidth).toBe('0px');
    expect((root as Element).getAttribute('data-theme')).toBe('night');

    expect(
      screen.getByRole('navigation', { name: '主导航' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '帮助' })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: '窗口控制' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '绘心 Logo' }),
    ).toBeInTheDocument();
    expect(screen.getByText('绘心')).toBeInTheDocument();

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
    expect(
      screen.getByRole('tab', { name: '一般设置', selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('代理服务器地址')).toHaveValue(
      'http://127.0.0.1:xxxx',
    );
    expect(
      screen.getByRole('tabpanel', { name: '一般设置' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '模型管理' }));
    expect(screen.getByText('模型管理 页面建设中')).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(10);
  });

  it('keeps the shell height constrained when the settings page is active', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(screen.getByRole('button', { name: '设置' }));

    const launcherRoot = container.querySelector('.launcher-root');
    const appShell = container.querySelector('.app-shell');
    const contentShell = container.querySelector('.content-shell');
    const pageShell = container.querySelector('.page-shell');
    const settingsShell = container.querySelector('.settings-shell');
    const settingsWrap = container.querySelector('.settings-wrap');

    expect(launcherRoot).not.toBeNull();
    expect(appShell).not.toBeNull();
    expect(contentShell).not.toBeNull();
    expect(pageShell).not.toBeNull();
    expect(settingsShell).not.toBeNull();
    expect(settingsWrap).not.toBeNull();

    expect(getComputedStyle(launcherRoot as Element).height).toBe('100%');
    expect(
      zeroLengthValues.has(getComputedStyle(appShell as Element).minHeight),
    ).toBe(true);
    expect(
      zeroLengthValues.has(getComputedStyle(contentShell as Element).minHeight),
    ).toBe(true);
    expect(
      zeroLengthValues.has(getComputedStyle(pageShell as Element).minHeight),
    ).toBe(true);
    expect(
      zeroLengthValues.has(getComputedStyle(settingsShell as Element).minHeight),
    ).toBe(true);
    expect(
      zeroLengthValues.has(getComputedStyle(settingsWrap as Element).minHeight),
    ).toBe(true);
  });

  it('toggles the theme from the lightbulb item and stores the choice', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const root = container.querySelector('.launcher-root');

    expect(root).not.toBeNull();
    expect((root as Element).getAttribute('data-theme')).toBe('night');

    await user.click(screen.getByRole('button', { name: '灯泡' }));

    expect((root as Element).getAttribute('data-theme')).toBe('day');
    expect(localStorage.getItem('xnnehanglab.theme')).toBe('day');
    expect(screen.getByRole('button', { name: '灯泡' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('restores the saved theme on first render', () => {
    localStorage.setItem('xnnehanglab.theme', 'day');

    const { container } = render(<App />);
    const root = container.querySelector('.launcher-root');

    expect(root).not.toBeNull();
    expect((root as Element).getAttribute('data-theme')).toBe('day');
  });
});
```

- [ ] **Step 2: Run the AppShell tests to verify they fail**

Run: `npm run test -- --run src/layouts/AppShell/AppShell.test.tsx`

Expected: FAIL because AppShell does not yet manage `data-theme`, does not read `localStorage`, and the lightbulb still behaves like a normal nav item.

- [ ] **Step 3: Wire AppShell theme state and make the lightbulb toggle theme**

```tsx
import { useEffect, useState } from 'react';
import { Sidebar } from '../../components/navigation/Sidebar/Sidebar';
import { Topbar } from '../../components/window/Topbar/Topbar';
import { navItems, type PageId } from '../../data/nav';
import { renderPage } from '../../app/routes';
import {
  readStoredTheme,
  toggleThemeMode,
  writeStoredTheme,
  type ThemeMode,
} from '../../services/theme/theme';

export function AppShell() {
  const [activePage, setActivePage] = useState<PageId>('home');
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme() ?? 'night');

  useEffect(() => {
    writeStoredTheme(theme);
  }, [theme]);

  return (
    <div className="launcher-root" data-theme={theme}>
      <div className="app-shell">
        <Sidebar
          items={navItems}
          activePage={activePage}
          theme={theme}
          onSelect={setActivePage}
          onToggleTheme={() => setTheme((current) => toggleThemeMode(current))}
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
import { NavItem } from '../NavItem/NavItem';
import huixinLogo from '../../../assets/brand/huixin-logo.svg';
import type { NavItemData, PageId } from '../../../data/nav';
import type { ThemeMode } from '../../../services/theme/theme';

interface SidebarProps {
  items: NavItemData[];
  activePage: PageId;
  theme: ThemeMode;
  onSelect: (id: PageId) => void;
  onToggleTheme: () => void;
}

export function Sidebar({
  items,
  activePage,
  theme,
  onSelect,
  onToggleTheme,
}: SidebarProps) {
  const primaryItems = items.filter((item) => item.section === 'primary');
  const secondaryItems = items.filter((item) => item.section === 'secondary');

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-logo" src={huixinLogo} alt="绘心 Logo" />
        <span>绘心</span>
      </div>

      <nav className="nav" aria-label="主导航">
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
            active={item.id === 'ideas' ? theme === 'day' : item.id === activePage}
            onSelect={item.id === 'ideas' ? () => onToggleTheme() : onSelect}
          />
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 4: Re-run the AppShell tests**

Run: `npm run test -- --run src/layouts/AppShell/AppShell.test.tsx`

Expected: PASS and confirm theme toggle + restore behavior.

- [ ] **Step 5: Commit the theme state wiring**

```bash
git add src/layouts/AppShell/AppShell.tsx src/layouts/AppShell/AppShell.test.tsx src/components/navigation/Sidebar/Sidebar.tsx
git commit -m "feat: add theme toggle state"
```

## Task 3: Add Night / Day Theme Tokens and Apply Them to the Main Surfaces

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/shell.css`
- Modify: `src/styles/home.css`
- Modify: `src/styles/settings.css`

- [ ] **Step 1: Add a failing style-oriented smoke assertion**

```tsx
import { render } from '@testing-library/react';
import App from '../../app/App';

describe('theme tokens', () => {
  beforeEach(() => {
    localStorage.setItem('xnnehanglab.theme', 'day');
  });

  it('applies the day theme marker to the launcher root', () => {
    const { container } = render(<App />);
    const root = container.querySelector('.launcher-root');

    expect(root).not.toBeNull();
    expect((root as Element).getAttribute('data-theme')).toBe('day');
  });
});
```

Add this to `src/app/App.test.tsx` after the existing smoke test.

- [ ] **Step 2: Run the App test file to confirm the theme marker assertion fails if the previous task is not complete**

Run: `npm run test -- --run src/app/App.test.tsx`

Expected: once Task 2 is complete, this should already pass. If it does, keep the assertion and continue. No further red step is needed for the style work itself.

- [ ] **Step 3: Add day-theme token overrides and switch the main surfaces to variable-based colors**

```css
:root,
.launcher-root[data-theme='night'] {
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
  --shell-bg: #101419;
  --shell-bg-2: #101419;
  --sidebar-bg-start: #13171d;
  --sidebar-bg-end: #11151a;
  --content-bg-start: #171b22;
  --content-bg-end: #161a21;
  --hero-overlay-start: rgba(10, 14, 20, 0.12);
  --hero-overlay-end: rgba(10, 14, 20, 0.28);
  --hero-copy-text: rgba(255, 255, 255, 0.9);
  --card-bg-start: #202732;
  --card-bg-end: #1b212a;
  --input-bg: #1a212a;
  --input-border: rgba(121, 161, 221, 0.6);
  --input-text: #dce7f6;
}

.launcher-root[data-theme='day'] {
  --bg: #eef3f7;
  --panel: #ffffff;
  --panel-2: #f6f9fc;
  --panel-3: #ebf1f7;
  --line: rgba(24, 34, 49, 0.08);
  --text: #182231;
  --muted: #66768c;
  --accent: #3b82f6;
  --accent-2: #2468dc;
  --success: #2f8cf0;
  --shadow: 0 18px 42px rgba(34, 45, 66, 0.10);
  --radius: 18px;
  --sidebar-w: 84px;
  --shell-bg: #f3f7fb;
  --shell-bg-2: #f7fafd;
  --sidebar-bg-start: #f7fafd;
  --sidebar-bg-end: #eef4fa;
  --content-bg-start: #ffffff;
  --content-bg-end: #f5f8fc;
  --hero-overlay-start: rgba(255, 255, 255, 0.16);
  --hero-overlay-end: rgba(255, 255, 255, 0.36);
  --hero-copy-text: rgba(255, 255, 255, 0.96);
  --card-bg-start: #ffffff;
  --card-bg-end: #f5f8fc;
  --input-bg: #ffffff;
  --input-border: rgba(59, 130, 246, 0.25);
  --input-text: #182231;
}
```

Then replace the main hardcoded surfaces with variables. Minimum required replacements:

```css
.launcher-root {
  background: var(--shell-bg);
}

.app-shell {
  background: var(--shell-bg-2);
}

.sidebar {
  background: linear-gradient(180deg, var(--sidebar-bg-start) 0%, var(--sidebar-bg-end) 100%);
  border-right: 1px solid var(--line);
}

.content-shell {
  background: linear-gradient(180deg, var(--content-bg-start) 0%, var(--content-bg-end) 100%);
}
```

```css
.home-page .hero {
  background:
    linear-gradient(180deg, var(--hero-overlay-start), var(--hero-overlay-end)),
    url('../assets/home/hero-bg.png') center / cover no-repeat;
}

.home-page .hero-copy p {
  color: var(--hero-copy-text);
}

.home-page .folder-card,
.home-page .notice {
  background: linear-gradient(180deg, var(--card-bg-start), var(--card-bg-end));
  border: 1px solid var(--line);
}
```

```css
.settings-shell .setting-card,
.settings-shell .about-card {
  background: linear-gradient(180deg, var(--card-bg-start), var(--card-bg-end));
  border: 1px solid var(--line);
}

.settings-shell .proxy-input {
  border: 1px solid var(--input-border);
  background: var(--input-bg);
  color: var(--input-text);
}
```

- [ ] **Step 4: Run the relevant verification**

Run: `npm run test -- --run src/services/theme/theme.test.ts src/layouts/AppShell/AppShell.test.tsx src/app/App.test.tsx`

Expected: PASS with theme persistence and root theme-marker tests green.

Run: `npm run build`

Expected: PASS with theme variables and CSS compiling cleanly.

- [ ] **Step 5: Commit the theme styling**

```bash
git add src/styles/tokens.css src/styles/shell.css src/styles/home.css src/styles/settings.css src/app/App.test.tsx
git commit -m "feat: add day night theme styles"
```

## Task 4: Final Verification

**Files:**
- Verify: `src/services/theme/theme.ts`
- Verify: `src/layouts/AppShell/AppShell.tsx`
- Verify: `src/components/navigation/Sidebar/Sidebar.tsx`
- Verify: `src/styles/tokens.css`

- [ ] **Step 1: Run the verification commands**

Run: `npm run test -- --run`

Expected: PASS with the full frontend test suite green.

Run: `npm run build`

Expected: PASS with Vite production build succeeding.

Run: `git status --short`

Expected: clean worktree.

- [ ] **Step 2: Commit any final verification-only adjustments if needed**

```bash
git status --short
```

Expected: no further changes required.

## Notes for the Implementer

- Keep theme persistence in `localStorage` only for this pass.
- Do not convert the lightbulb into a routed page again.
- Do not add a third theme or system-theme auto detection in this implementation.
- Prefer variable-driven color overrides over page-specific ad hoc theme branches in React code.
