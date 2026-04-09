import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  DownloadOptions,
  EnvironmentProbe,
  ManagedPath,
  RuntimeEvent,
  RuntimeInspection,
  RuntimeTaskRecord,
  VideoMeta,
  VideoParseResult,
} from './runtime';

export function probeEnvironment() {
  return invoke<EnvironmentProbe>('probe_environment');
}

export function chooseWorkspaceRoot() {
  return invoke<EnvironmentProbe | null>('choose_workspace_root');
}

export function useRepoWorkspaceRoot() {
  return invoke<EnvironmentProbe>('use_repo_workspace_root');
}

export function inspectRuntime() {
  return invoke<RuntimeInspection>('inspect_runtime');
}

export function enqueueDownload(target: string, options: DownloadOptions, label?: string, dirOverride?: string, selectIndex?: number) {
  return invoke<RuntimeTaskRecord>('enqueue_download', {
    target,
    label: label ?? null,
    requireVideo: options.requireVideo,
    requireAudio: options.requireAudio,
    requireCover: options.requireCover,
    videoQuality: options.videoQuality,
    audioQuality: options.audioQuality,
    dirOverride: dirOverride ?? null,
    selectIndex: selectIndex ?? null,
  });
}

export function listDownloadTasks() {
  return invoke<RuntimeTaskRecord[]>('list_download_tasks');
}

export function listManagedFolders() {
  return invoke<ManagedPath[]>('list_managed_folders');
}

export function openManagedPath(pathKey: string) {
  return invoke<void>('open_managed_path', { pathKey });
}

export function openTaskSaveDir(relativePath: string) {
  return invoke<void>('open_task_save_dir', { relativePath });
}

export function exportConsoleLogs(contents: string) {
  return invoke<string>('export_console_logs', { contents });
}

export function setRuntimeDriver(driver: string, pythonPath: string | null, ffmpegPath: string | null, noProxy: boolean) {
  return invoke<EnvironmentProbe>('set_runtime_driver', { driver, pythonPath, ffmpegPath, noProxy });
}

export function pickPythonPath() {
  return invoke<string | null>('pick_python_path_command');
}

export function pickFfmpegPath() {
  return invoke<string | null>('pick_ffmpeg_path_command');
}

export function cancelTask(taskId: string) {
  return invoke<void>('cancel_task', { taskId });
}

export function startAuthLogin() {
  return invoke<void>('start_auth_login');
}

export function logoutAuth() {
  return invoke<string>('logout_auth');
}

export function parseTarget(target: string) {
  return invoke<VideoParseResult>('parse_target', { target });
}

export function openPath(path: string) {
  return invoke<void>('open_path_command', { path });
}

export function fetchVideoMeta(url: string) {
  return invoke<VideoMeta>('fetch_video_meta', { url });
}

export async function subscribeRuntimeEvents(
  onEvent: (event: RuntimeEvent) => void,
  onRawLog: (line: string) => void,
) {
  const unlistenCallbacks: Array<() => void> = [];

  try {
    const unlistenEvent = await listen<RuntimeEvent>('runtime:event', (event) => {
      onEvent(event.payload);
    });
    unlistenCallbacks.push(unlistenEvent);

    const unlistenRaw = await listen<string>('runtime:raw-log', (event) => {
      onRawLog(event.payload);
    });
    unlistenCallbacks.push(unlistenRaw);
  } catch (error) {
    unlistenCallbacks.forEach((cleanup) => cleanup());
    throw error;
  }

  return () => {
    unlistenCallbacks.forEach((cleanup) => cleanup());
  };
}
