# 绘心 Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `绘心` brand direction to the template by creating a project README, vendoring the provided SVG logo locally, and replacing the app sidebar brand block with the new logo and brand name.

**Architecture:** Keep the branding change narrow: store the SVG as a local asset under `src/assets/brand/`, import it directly into the sidebar, and author a Chinese-first `README.md` that explains the relationship between the reusable `XnneHangLab` launcher template and the `绘心` product direction. Do not change the desktop icon bundle or Tauri packaging metadata in this pass.

**Tech Stack:** Markdown, SVG asset, React, TypeScript, Vite asset imports, Vitest, React Testing Library

---

## File Structure

### New Files

- Create: `README.md`
- Create: `src/assets/brand/huixin-logo.svg`

### Modified Files

- Modify: `src/components/navigation/Sidebar/Sidebar.tsx`
- Modify: `src/styles/shell.css`
- Modify: `src/layouts/AppShell/AppShell.test.tsx`

## Task 1: Vendor the 绘心 Logo and Author the Project README

**Files:**
- Create: `README.md`
- Create: `src/assets/brand/huixin-logo.svg`

- [ ] **Step 1: Download the approved SVG logo into the repo**

Run: `mkdir -p src/assets/brand`

Expected: `src/assets/brand/` exists.

Run: `curl -L https://github.com/XnneHangLab/XnneHangLabTTS/raw/main/assets/imgs/logo.svg -o src/assets/brand/huixin-logo.svg`

Expected: `src/assets/brand/huixin-logo.svg` is created as a local copy of the provided logo.

- [ ] **Step 2: Verify the downloaded asset is an SVG**

Run: `sed -n '1,20p' src/assets/brand/huixin-logo.svg`

Expected: file begins with valid SVG markup rather than HTML or an error page.

- [ ] **Step 3: Write the project README**

```md
# 绘心

<p align="center">
  <img src="./src/assets/brand/huixin-logo.svg" alt="绘心 Logo" width="120" />
</p>

绘心是基于 XnneHangLab 启动器模板沉淀出的品牌方向，面向更有温度、可长期陪伴的 AI 产品形态。

当前仓库依然是一个可复用的桌面启动器模板仓库，当前界面风格参考绘世启动器，后续可以继续扩展为绘心-voice 等子产品。

## 适用场景

- 语音产品启动器
- 角色 / 陪伴型 AI 桌面入口
- 模型、资源、环境检查的一体化桌面壳
- XnneHangLab 系列桌面项目的统一模板

## 技术栈

- Tauri 2
- React 18
- Vite 5
- TypeScript
- Vitest + React Testing Library

## 当前能力

- 仿绘世风格的桌面启动器壳层
- 完整侧边栏导航
- 首页复刻
- 设置页复刻
- Tauri 窗口控制接线
- 前端测试、构建、Rust 检查链路

## 开发运行

安装依赖：

```bash
npm install
```

前端开发：

```bash
npm run dev
```

桌面开发：

```bash
npm run tauri dev
```

测试：

```bash
npm run test -- --run
```

构建：

```bash
npm run build
```

Rust 侧检查：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

## 项目结构

```text
src/
  app/
  components/
  data/
  layouts/
  pages/
  services/
  styles/
src-tauri/
```

## 后续扩展方向

- 绘心-voice
- 模型管理和下载入口
- 环境检查与诊断
- 启动流程与进程管理
- 更完整的品牌视觉系统
```

- [ ] **Step 4: Verify the README content**

Run: `rg -n "绘心|XnneHangLab|Tauri 2|React 18|模板|绘世" README.md`

Expected: all key positioning terms appear in the README.

- [ ] **Step 5: Commit the README and logo asset**

```bash
git add README.md src/assets/brand/huixin-logo.svg
git commit -m "docs: add huixin branding readme"
```

## Task 2: Replace the Sidebar Brand Block with the 绘心 Logo

**Files:**
- Modify: `src/components/navigation/Sidebar/Sidebar.tsx`
- Modify: `src/styles/shell.css`
- Modify: `src/layouts/AppShell/AppShell.test.tsx`

- [ ] **Step 1: Add a failing sidebar brand assertion**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../app/App';

describe('AppShell', () => {
  it('switches between nav pages and renders active page content', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const root = container.querySelector('.launcher-root');
    const shell = container.querySelector('.app-shell');

    expect(root).not.toBeNull();
    expect(shell).not.toBeNull();
    expect(getComputedStyle(root as Element).paddingTop).toBe('0px');
    expect(getComputedStyle(shell as Element).borderTopWidth).toBe('0px');

    expect(
      screen.getByRole('img', { name: '绘心 Logo' }),
    ).toBeInTheDocument();
    expect(screen.getByText('绘心')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: '主导航' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '帮助' })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: '窗口控制' }),
    ).toBeInTheDocument();

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
});
```

- [ ] **Step 2: Run the sidebar test to verify it fails**

Run: `npm run test -- --run src/layouts/AppShell/AppShell.test.tsx`

Expected: FAIL because the current sidebar still renders the old brand block and does not contain `绘心 Logo`.

- [ ] **Step 3: Replace the brand block with the local SVG and brand text**

```tsx
import huixinLogo from '../../../assets/brand/huixin-logo.svg';
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
            active={item.id === activePage}
            onSelect={onSelect}
          />
        ))}
      </nav>
    </aside>
  );
}
```

```css
.brand {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
  color: #fff;
  font-size: 13px;
  line-height: 1.2;
  opacity: 0.95;
  text-align: center;
}

.brand-logo {
  width: 42px;
  height: 42px;
  display: block;
  object-fit: contain;
}
```

- [ ] **Step 4: Run focused verification**

Run: `npm run test -- --run src/layouts/AppShell/AppShell.test.tsx`

Expected: PASS and confirm the sidebar now exposes `绘心 Logo` and `绘心`.

Run: `npm run build`

Expected: PASS and bundle the imported SVG without asset-resolution errors.

- [ ] **Step 5: Commit the sidebar branding**

```bash
git add src/components/navigation/Sidebar/Sidebar.tsx src/styles/shell.css src/layouts/AppShell/AppShell.test.tsx
git commit -m "feat: brand sidebar as huixin"
```

## Task 3: Final Verification

**Files:**
- Verify: `README.md`
- Verify: `src/assets/brand/huixin-logo.svg`
- Verify: `src/components/navigation/Sidebar/Sidebar.tsx`
- Verify: `src/styles/shell.css`

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

- Keep this pass limited to README, the local SVG asset, and the app sidebar brand block.
- Do not change the Tauri desktop icon bundle in `src-tauri/icons/`.
- Do not rename the repository or Tauri package metadata in this branding pass.
- Do not expand the product story into extra pages; README and sidebar branding are enough for this scope.
