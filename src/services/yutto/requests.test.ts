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

  it('prefers AV1 without disabling the backend codec fallback', () => {
    const request = buildDownloadRequest({
      target: TARGET,
      dir: '',
      options: { ...DEFAULT_DOWNLOAD_OPTIONS, videoCodec: 'av1' },
    });
    expect(request.stream).toMatchObject({
      video_download_codec: 'av1',
      video_save_codec: 'copy',
    });
    expect(request.stream).not.toHaveProperty('video_download_codec_priority');
  });

  it('does not override video codecs in automatic mode', () => {
    const request = buildDownloadRequest({
      target: TARGET,
      dir: '',
      options: DEFAULT_DOWNLOAD_OPTIONS,
    });
    expect(request.stream).not.toHaveProperty('video_download_codec');
    expect(request.stream).not.toHaveProperty('video_download_codec_priority');
    expect(request.stream).not.toHaveProperty('video_save_codec');
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
