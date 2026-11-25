import { DEFAULT_DOWNLOAD_OPTIONS } from '../runtime/runtime';
import { buildDownloadRequest } from './requests';

const TARGET = 'https://www.bilibili.com/video/BV1xx411c7mD?p=1';

function audioOnlyRequest(audioFormat: string) {
  return buildDownloadRequest({
    target: TARGET,
    dir: '',
    options: {
      ...DEFAULT_DOWNLOAD_OPTIONS,
      requireVideo: false,
      requireAudio: true,
      audioFormat,
    },
  });
}

describe('buildDownloadRequest audio-only formats', () => {
  it.each([
    true,
    false,
  ])('uses the page-name template only for multi-P items (%s)', (usePageName) => {
    const request = buildDownloadRequest({
      target: TARGET,
      dir: '课程',
      usePageName,
      options: DEFAULT_DOWNLOAD_OPTIONS,
    });
    expect(request.scope).toEqual({ batch: false });
    expect(request.output).toEqual({
      directory: '课程',
      ...(usePageName ? { subpath_template: '{name}' } : {}),
    });
  });
  it('sets audio_only_format without overriding codec (backend auto-infers)', () => {
    const mp3 = audioOnlyRequest('mp3');
    expect(mp3.output).toEqual({ audio_only_format: 'mp3' });
    expect(mp3.stream).not.toHaveProperty('audio_save_codec');

    const flac = audioOnlyRequest('flac');
    expect(flac.output).toEqual({ audio_only_format: 'flac' });
    expect(flac.stream).not.toHaveProperty('audio_save_codec');
  });

  it('keeps the copy codec for m4a and wav (wire downloads m4a)', () => {
    const m4a = audioOnlyRequest('m4a');
    expect(m4a.output).toEqual({ audio_only_format: 'm4a' });
    expect(m4a.stream).not.toHaveProperty('audio_save_codec');

    const wav = audioOnlyRequest('wav');
    expect(wav.output).toEqual({ audio_only_format: 'm4a' });
    expect(wav.stream).not.toHaveProperty('audio_save_codec');
  });

  it.each([
    'hevc',
    'av1',
  ] as const)('prefers %s without disabling the backend codec fallback', (videoCodec) => {
    const request = buildDownloadRequest({
      target: TARGET,
      dir: '',
      options: { ...DEFAULT_DOWNLOAD_OPTIONS, videoCodec },
    });
    expect(request.stream).toMatchObject({
      video_download_codec: videoCodec,
      video_save_codec: 'copy',
    });
    expect(request.stream).not.toHaveProperty('video_download_codec_priority');
  });

  it('explicitly prefers H.264 by default while keeping codec fallback', () => {
    const request = buildDownloadRequest({
      target: TARGET,
      dir: '',
      options: DEFAULT_DOWNLOAD_OPTIONS,
    });
    expect(request.stream).toMatchObject({
      video_download_codec: 'avc',
      video_save_codec: 'copy',
    });
    expect(request.stream).not.toHaveProperty('video_download_codec_priority');
  });

  it('requests subtitles without media, cover, or danmaku', () => {
    const request = buildDownloadRequest({
      target: TARGET,
      dir: '',
      options: {
        ...DEFAULT_DOWNLOAD_OPTIONS,
        requireVideo: false,
        requireAudio: false,
        requireCover: false,
        requireDanmaku: false,
        requireSubtitle: true,
      },
    });
    expect(request.resources).toEqual({
      video: false,
      audio: false,
      cover: false,
      save_cover: false,
      danmaku: false,
      subtitle: true,
    });
    expect(request.output).toBeUndefined();
  });

  it('never overrides the codec for video downloads', () => {
    const request = buildDownloadRequest({
      target: TARGET,
      dir: '',
      options: { ...DEFAULT_DOWNLOAD_OPTIONS, audioFormat: 'mp3' },
    });
    expect(request.output).toBeUndefined();
    expect(request.stream).not.toHaveProperty('audio_save_codec');
  });
});
