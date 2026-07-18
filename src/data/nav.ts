export type PageId =
  | 'home'
  | 'settings'
  | 'versions'
  | 'models'
  | 'community'
  | 'console';

export interface PageNavItemData {
  type: 'page';
  id: PageId;
  label: string;
  icon: string;
  section: 'primary' | 'secondary';
}

export interface ThemeToggleNavItemData {
  type: 'action';
  id: 'ideas';
  action: 'toggle-theme';
  label: string;
  icon: string;
  section: 'secondary';
}

/** 在系统浏览器中打开外部链接（如文档站点）的导航项。 */
export interface LinkNavItemData {
  type: 'link';
  id: 'docs';
  href: string;
  label: string;
  icon: string;
  section: 'primary' | 'secondary';
}

export type NavItemData =
  | PageNavItemData
  | ThemeToggleNavItemData
  | LinkNavItemData;

export const navItems: NavItemData[] = [
  {
    type: 'page',
    id: 'home',
    label: '一键启动',
    icon: '▶',
    section: 'primary',
  },
  {
    type: 'page',
    id: 'settings',
    label: '设置',
    icon: '⚙',
    section: 'primary',
  },
  {
    // 疑难解答改由文档站点承载（内容更全、随时可更新），应用内只留入口。
    type: 'link',
    id: 'docs',
    href: 'https://yutto.xnnehang.top/guide/intro.html',
    label: '疑难解答',
    icon: '⌘',
    section: 'primary',
  },
  {
    type: 'page',
    id: 'versions',
    label: '版本管理',
    icon: '🕘',
    section: 'primary',
  },
  {
    type: 'page',
    id: 'models',
    label: '下载管理',
    icon: '⬇',
    section: 'primary',
  },
  {
    type: 'page',
    id: 'community',
    label: '联系我',
    icon: '💬',
    section: 'secondary',
  },
  {
    type: 'action',
    id: 'ideas',
    action: 'toggle-theme',
    label: '灯泡',
    icon: '💡',
    section: 'secondary',
  },
  {
    type: 'page',
    id: 'console',
    label: '控制台',
    icon: '⌨',
    section: 'secondary',
  },
];
