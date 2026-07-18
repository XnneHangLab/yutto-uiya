import type { QualityOption } from '../runtime/runtime';

/**
 * Static quality menus (serve migration 阶段 3): the download side of yutto
 * auto-downgrades to the best available stream, so the UI no longer needs to
 * probe per-video quality lists during parse. Codes follow yutto
 * media/quality.py.
 */
export const VIDEO_QUALITY_OPTIONS: QualityOption[] = [
  { label: '8K', code: 127 },
  { label: '杜比视界', code: 126 },
  { label: 'HDR', code: 125 },
  { label: '4K', code: 120 },
  { label: '1080P 60', code: 116 },
  { label: '1080P 高码率', code: 112 },
  { label: '1080P', code: 80 },
  { label: '720P 60', code: 74 },
  { label: '720P', code: 64 },
  { label: '480P', code: 32 },
  { label: '360P', code: 16 },
];

export const AUDIO_QUALITY_OPTIONS: QualityOption[] = [
  { label: 'Hi-Res', code: 30251 },
  { label: '杜比音效', code: 30255 },
  { label: '杜比全景声', code: 30250 },
  { label: '320', code: 30280 },
  { label: '128', code: 30232 },
  { label: '64', code: 30216 },
];
