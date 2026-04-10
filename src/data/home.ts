export interface HeroConfettiPiece {
  top: string;
  left: string;
  color: string;
  rotate: string;
  width?: string;
}

export interface PlaceholderFolderItem {
  key: string;
  title: string;
  path: string;
  icon: string;
}

export const heroCopy = {
  eyebrow: 'yutto-uiya',
  title: 'yutto-uiya',
  description: 'Bilibili 视频下载工具，由 yutto 驱动。',
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

export const versionMeta = [
  'yutto-uiya v2.0.0',
];

export const notices = [
  'yutto-uiya 是 yutto 的图形界面前端，核心下载能力由 yutto 提供，本项目负责配置与交互。',
  '收藏夹解析、下载队列等功能持续迭代中，欢迎试用并反馈。',
  '问题反馈与功能建议请通过仓库 Issue 或 PR 提交。',
];

export const placeholderFolders: PlaceholderFolderItem[] = [
  { key: 'workspace', title: '根目录', path: '.', icon: '📁' },
  { key: 'extensions', title: '扩展文件夹', path: 'extensions', icon: '🧷' },
  { key: 'tmp', title: '临时文件夹', path: 'tmp', icon: '🧹' },
  { key: 'extras-images', title: '超分输出', path: 'extras-images', icon: '⊞' },
  { key: 'txt2img-grids', title: '文生图（网格）', path: 'txt2img-grids', icon: '🖹' },
  { key: 'txt2img-images', title: '文生图（单图）', path: 'txt2img-images', icon: '📄' },
  { key: 'img2img-grids', title: '图生图（网格）', path: 'img2img-grids', icon: '🖼' },
  { key: 'img2img-images', title: '图生图（单图）', path: 'img2img-images', icon: '▣' },
];
