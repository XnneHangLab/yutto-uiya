export type PageId =
  | 'home'
  | 'settings'
  | 'advanced'
  | 'troubleshooting'
  | 'versions'
  | 'models'
  | 'tools'
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

export type NavItemData = PageNavItemData | ThemeToggleNavItemData;

export const navItems: NavItemData[] = [
  { type: 'page', id: 'home', label: '一键启动', icon: '▶', section: 'primary' },
  { type: 'page', id: 'settings', label: '设置', icon: '⚙', section: 'primary' },
  { type: 'page', id: 'advanced', label: '高级选项', icon: '≣', section: 'primary' },
  { type: 'page', id: 'troubleshooting', label: '疑难解答', icon: '⌘', section: 'primary' },
  { type: 'page', id: 'versions', label: '版本管理', icon: '🕘', section: 'primary' },
  { type: 'page', id: 'models', label: '模型管理', icon: '◫', section: 'primary' },
  { type: 'page', id: 'tools', label: '小工具', icon: '🧰', section: 'primary' },
  { type: 'page', id: 'community', label: '交流群', icon: '💬', section: 'secondary' },
  {
    type: 'action',
    id: 'ideas',
    action: 'toggle-theme',
    label: '灯泡',
    icon: '💡',
    section: 'secondary',
  },
  { type: 'page', id: 'console', label: '控制台', icon: '⌨', section: 'secondary' },
];
