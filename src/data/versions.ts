export interface VersionEntry {
  date: string;
  version: string;
  badge: string;
  title: string;
  highlights?: string[];
}

export const CURRENT_VERSION = {
  version: 'v2.0.1',
  date: '2026-04-16',
  channel: '稳定版',
  summary: '资源选择器、音频画质选项、多平台构建',
};

export const VERSION_TIMELINE: VersionEntry[] = [
  {
    date: '2026-04-16',
    version: 'v2.0.1',
    badge: '当前',
    title: '资源选择器与多平台构建',
    highlights: [
      '下载资源选择器（视频/音频/封面/字幕/弹幕）',
      '音频画质选项',
      '平台信息展示与一键 uv sync',
      '多平台 Release 构建流水线',
    ],
  },
  {
    date: '2026-04-12',
    version: 'v2.0.0',
    badge: '大版本',
    title: '从 Streamlit 迁移至 Tauri',
    highlights: [
      '全新 Tauri 2 + React 桌面客户端',
      '全局快捷键呼出窗口',
      '合集/收藏夹批量解析与下载',
      '实时控制台日志',
      '扫码登录',
    ],
  },
  {
    date: '2025-05-19',
    version: 'v1.1.4',
    badge: '',
    title: 'Streamlit 最终版本',
  },
  {
    date: '2025-05-12',
    version: 'v1.1.3',
    badge: '',
    title: '稳定性修复',
  },
  {
    date: '2025-04-30',
    version: 'v1.1.2',
    badge: '',
    title: '功能优化',
  },
  {
    date: '2025-04-16',
    version: 'v1.1.0',
    badge: '',
    title: '功能增强',
  },
  {
    date: '2025-04-07',
    version: 'v1.0.4',
    badge: '',
    title: '问题修复',
  },
  {
    date: '2025-03-10',
    version: 'v1.0.3',
    badge: '',
    title: '问题修复',
  },
  {
    date: '2025-02-26',
    version: 'v1.0.2',
    badge: '',
    title: '问题修复',
  },
  {
    date: '2024-11-26',
    version: 'v1.0.0',
    badge: '初版',
    title: 'Streamlit 初始版本',
  },
];
