/**
 * DownloadRequest builders shared by the resolve (parse) and download flows
 * (serve migration 阶段 3/4). Wire field names are snake_case; output
 * directories must stay RELATIVE — ServerPolicy resolves them under the
 * serve's --download-root and rejects absolute paths.
 */

import type { DownloadOptions } from '../runtime/runtime';
import type { DownloadRequestPayload } from './rpc';

export interface NetworkPreferences {
  proxy?: string;
  fetchWorkers?: number;
}

/**
 * Map uiya's 网络设置 onto wire network options (the old pipeline passed
 * these as yutto CLI flags). Returns undefined when nothing is set so the
 * request can omit the block entirely.
 */
export function networkRequestOptions(
  preferences?: NetworkPreferences,
): Record<string, unknown> | undefined {
  if (!preferences) {
    return undefined;
  }
  const network: Record<string, unknown> = {};
  if (preferences.proxy) {
    network.proxy = preferences.proxy;
  }
  if (preferences.fetchWorkers) {
    // ServerPolicy caps fetch workers (default max 16); clamp so a large
    // uiya setting degrades instead of rejecting the request.
    network.fetch_workers = Math.min(
      Math.max(1, Math.floor(preferences.fetchWorkers)),
      16,
    );
  }
  return Object.keys(network).length > 0 ? network : undefined;
}

/** wav is produced by post-conversion; the wire itself downloads m4a. */
export function needsWavConversion(options: DownloadOptions): boolean {
  return (
    !options.requireVideo &&
    options.requireAudio &&
    options.audioFormat === 'wav'
  );
}

export interface DownloadRequestArgs {
  /** Atomic URL of one episode (from parse). */
  target: string;
  /** Item directory relative to the downloads root ('' = root itself). */
  dir: string;
  options: DownloadOptions;
  network?: NetworkPreferences;
}

export function buildDownloadRequest(
  args: DownloadRequestArgs,
): DownloadRequestPayload {
  const { options } = args;
  const stream: Record<string, unknown> = {
    video_quality: options.videoQuality,
    audio_quality: options.audioQuality,
  };
  if (options.videoCodec === 'av1') {
    stream.video_download_codec = 'av1';
    stream.video_save_codec = 'copy';
  }
  const request: DownloadRequestPayload = {
    source: { url: args.target },
    scope: { batch: false },
    resources: {
      video: options.requireVideo,
      audio: options.requireAudio,
      danmaku: options.requireDanmaku,
      subtitle: options.requireSubtitle,
      cover: options.requireCover,
      save_cover: options.requireCover,
    },
    stream,
  };

  const output: Record<string, unknown> = {};
  if (args.dir) {
    output.directory = args.dir;
  }
  if (!options.requireVideo && options.requireAudio) {
    const format = options.audioFormat === 'wav' ? 'm4a' : options.audioFormat;
    if (format && format !== 'infer') {
      output.audio_only_format = format;
    }
  }
  if (Object.keys(output).length > 0) {
    request.output = output;
  }

  const network = networkRequestOptions(args.network);
  if (network) {
    request.network = network;
  }
  return request;
}
