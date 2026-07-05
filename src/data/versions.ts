export interface VersionEntry {
  date: string;
  version: string;
  badge: string;
  title: string;
  highlights?: string[];
}

export const CURRENT_VERSION = {
  version: 'v2.0.2',
  date: '2026-07-05',
  channel: '稳定版',
  summary: '下载目录可配置、疑难解答页面、音频格式选择',
};

export const VERSION_TIMELINE: VersionEntry[] = [
  {
    date: '2026-07-05',
    version: 'v2.0.2',
    badge: '当前',
    title: '下载目录可配置与疑难解答',
    highlights: [
      '下载目录可独立配置，不再绑定根目录',
      '疑难解答页面（分类、截图、视频引用）',
      '音频格式选择（M4A/MP3/FLAC/WAV）',
      'Python/Rust/TypeScript CI lint 流水线',
      '非首页懒加载，优化启动速度',
    ],
  },
  {
    date: '2026-04-16',
    version: 'v2.0.1',
    badge: '',
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
];
