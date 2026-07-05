export interface FaqItem {
  id: string;
  title: string;
  symptom: string;
  cause: string;
  steps: string[];
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
        cause: '系统 PATH 中没有 ffmpeg，或者没有在设置中指定本地路径。',
        steps: [
          '一键包用户可参考视频 BV1yRdBBsEGZ 的 1:54~2:20',
          '下载 FFmpeg：https://ffmpeg.org/download.html',
          '解压到任意目录，如 D:\\tools\\ffmpeg\\bin\\ffmpeg.exe',
          '设置 → FFmpeg 来源 → 选择「本地 ffmpeg」→ 浏览选择路径',
          '点击「保存并重新检测」',
        ],
      },
      {
        id: 'uv-sync-failed',
        title: 'uv sync 安装依赖失败',
        symptom: '环境检测卡在「uiya 不可用」，控制台报网络错误或超时。',
        cause: '网络问题导致 uv 无法从 PyPI 下载依赖包。',
        steps: [
          '检查网络连接和代理设置',
          '或在 pyproject.toml 中将 PyPI 源替换为国内镜像',
          '然后重新点击「设置 → 依赖同步 → uv sync」',
        ],
      },
      {
        id: 'conda-setup',
        title: '使用 conda 环境运行',
        symptom: '不想用 uv，想用已有的 conda 环境。',
        cause: '',
        steps: [
          '创建 conda 环境：conda create -n yutto python=3.11 && pip install -e .',
          '找到该环境的 Python 路径（which python 或 where python）',
          '设置 → Python 运行方式 → 选择「conda」',
          '填入 Python 可执行文件路径，点击「保存并重新检测」',
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
        symptom: '下载完成后视频画质很低，设置页面显示「未登录」。',
        cause: 'Bilibili 对未登录用户限制最高画质为 480P。',
        steps: [
          '设置 → 账号状态 → 点击「扫码登录」',
          '用 Bilibili 手机 App 扫描二维码',
          '等待显示「已登录」后重新下载',
        ],
      },
    ],
  },
  {
    id: 'settings',
    label: '设置相关',
    icon: '🔧',
    items: [
      {
        id: 'workspace-switch-blocked',
        title: '切换工作目录被禁止',
        symptom: '点击「更改目录」后提示「有任务运行，禁止切换」。',
        cause: '有下载任务正在进行中，切换目录会导致路径不一致。',
        steps: [
          '等待当前下载任务完成，或取消所有进行中的任务',
          '再次点击「更改目录」',
        ],
      },
    ],
  },
];
