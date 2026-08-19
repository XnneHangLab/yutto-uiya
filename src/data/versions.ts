export interface VersionEntry {
  date: string;
  version: string;
  badge: string;
  title: string;
  highlights?: string[];
}

export const CURRENT_VERSION = {
  version: 'v2.3.1',
  date: '2026-08-19',
  channel: '稳定版',
  summary: '支持 AV1 偏好与实际资源展示，补全番剧 PGC 分集详情',
};

export const VERSION_TIMELINE: VersionEntry[] = [
  {
    date: '2026-08-19',
    version: 'v2.3.1',
    badge: '当前',
    title: '实际资源与番剧详情',
    highlights: [
      '新增视频编码偏好：可主动选择 AV1；自动模式继续采用内核的兼容优先与回退策略（#96）',
      '下载卡片与控制台显示最终选择的画质、编码、分辨率和转码动作（#97）',
      '番剧详情补全发布方、剧情简介、标签、发布时间和分集时长（#98）',
      '内核升级至 uiya-yutto 0.3.2，支持结构化的最终媒体选择事件',
    ],
  },
  {
    date: '2026-08-12',
    version: 'v2.3.0',
    badge: '',
    title: '解析与网络体验修复',
    highlights: [
      '恢复 PGC / 番剧分集标题，解析结果不再显示通用视频标题（#85）',
      '封面抓取失败时提供更可用的诊断信息（#87）',
      '默认使用直连；需要时仍可启用系统或环境代理（#88）',
      '内核升级至 uiya-yutto 0.3.0（#91）',
      '明确封面与视频、音频同时下载时内嵌，单独下载时另存（#93）',
    ],
  },
  {
    date: '2026-07-19',
    version: 'v2.2.1',
    badge: '',
    title: 'FFmpeg 路径修复与内核升级',
    highlights: [
      '修复自定义 FFmpeg 路径环境检查与 serve 使用不一致的问题（#77）',
      '音频-only mp3/flac 转码逻辑下沉到 uiya-yutto 内核，前端不再需要显式覆盖编码（#74）',
      '内核升级至 uiya-yutto 0.2.4',
      '项目以 AGPL-3.0-only 许可证发布',
    ],
  },
  {
    date: '2026-07-18',
    version: 'v2.2.0',
    badge: '',
    title: '迁移到常驻 yutto server',
    highlights: [
      '解析与下载全面迁移到常驻 yutto server（内核 uiya-yutto 0.2.1），结构化事件取代日志抓取',
      '收藏夹/合集解析大幅提速，列表边解析边逐条平滑出现',
      '下载卡片显示阶段（解析中/写入附件/下载中/后处理中）与实时进度条（百分比 · 大小 · 速率）',
      '下载队列串行执行，显著降低触发风控的概率；排队任务安静等待',
      '修复仅音频 MP3/FLAC 下载失败（现在自动转码）',
      '保存设置自动重启 server，下载目录 / FFmpeg / Python 修改立即生效；任务进行中保存会先提示',
      '画质菜单为完整档位，实际画质下载时自动降级（详见文档站点说明）',
      '疑难解答移至文档站点，应用内保留入口',
    ],
  },
  {
    date: '2026-07-11',
    version: 'v2.1.0',
    badge: '',
    title: '批量解析提速',
    highlights: [
      '内核升级至 uiya-yutto 0.1.0，合集/收藏夹批量解析并发执行，等待时间大幅缩短',
      '新增「解析并发数」设置项（默认 8，可调 1-32）',
      '批量解析时单个视频失败不再中断整体任务',
      'VitePress 文档站点上线',
    ],
  },
  {
    date: '2026-07-05',
    version: 'v2.0.2',
    badge: '',
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
