export interface FaqVideo {
  bvid: string;
  title: string;
  /** e.g. "1:54" — optional timestamp hint shown to user */
  timestamp?: string;
}

export interface FaqItem {
  id: string;
  title: string;
  symptom: string;
  cause: string;
  steps: string[];
  video?: FaqVideo;
}

export interface FaqCategory {
  id: string;
  label: string;
  icon: string;
  items: FaqItem[];
}

export const faqCategories: FaqCategory[] = [
  {
    id: 'environment',
    label: '环境配置',
    icon: '⚙️',
    items: [
      {
        id: 'ffmpeg-not-found',
        title: 'FFmpeg 不可用',
        symptom: '控制台显示 ffmpeg 不可用，设置页环境检测也提示异常。',
        cause: '没有安装 FFmpeg 或没有在设置中指定路径。',
        steps: [
          '如果用的是一键包，重新解压一次即可，FFmpeg 已经自带',
          '设置 → FFmpeg 来源 → 选择「本地 ffmpeg」',
          '点击「浏览」→ 找到 ffmpeg.exe 选中',
          '点击「保存并重新检测」',
        ],
        video: {
          bvid: 'BV1yRdBBsEGZ',
          title: '一键包使用教程',
          timestamp: '1:54',
        },
      },
      {
        id: 'uv-sync-failed',
        title: '依赖安装失败',
        symptom: '环境检测卡在「uiya 不可用」，或点击同步后长时间无响应。',
        cause: '网络不稳定导致依赖包下载失败。',
        steps: [
          '确认网络连接正常',
          '设置 → 依赖同步 → 点击「uv sync」重试',
          '如果反复失败，尝试换个网络环境后再试',
        ],
      },
    ],
  },
  {
    id: 'download',
    label: '下载问题',
    icon: '⬇️',
    items: [
      {
        id: 'low-quality',
        title: '画质只有 360P / 480P',
        symptom: '下载完成后视频画质很低。',
        cause: 'B站对未登录用户限制最高画质为 480P。',
        steps: [
          '设置 → 账号状态 → 点击「扫码登录」',
          '用 B站手机 App 扫描弹出的二维码',
          '等待显示「已登录」后重新下载',
        ],
        video: {
          bvid: 'BV1yRdBBsEGZ',
          title: '一键包使用教程',
          timestamp: '1:41',
        },
      },
    ],
  },
];
