import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  EnvironmentProbe,
  ManagedPath,
  RuntimeEvent,
  RuntimeInspection,
  ServeInfo,
  ServeStatus,
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

/**
 * Convert downloaded m4a/aac under the given downloads-root-relative
 * directory to wav (the wire has no wav format; this is the retained uiya
 * post-processing step).
 */
export function convertWavAudio(relativeDir: string) {
  return invoke<void>('convert_wav_audio', { relativeDir });
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

export function setRuntimeDriver(
  driver: string,
  pythonPath: string | null,
  ffmpegPath: string | null,
  noProxy: boolean,
  downloadDir: string | null,
  fetchWorkers: number,
) {
  return invoke<EnvironmentProbe>('set_runtime_driver', {
    driver,
    pythonPath,
    ffmpegPath,
    noProxy,
    downloadDir,
    fetchWorkers,
  });
}

export function uvSync() {
  return invoke<void>('uv_sync');
}

export function startServe() {
  return invoke<ServeInfo>('serve_start');
}

export function stopServe() {
  return invoke<void>('serve_stop');
}

export function getServeStatus() {
  return invoke<ServeStatus>('serve_status');
}

export function pickPythonPath() {
  return invoke<string | null>('pick_python_path_command');
}

export function pickFfmpegPath() {
  return invoke<string | null>('pick_ffmpeg_path_command');
}

export function detectFfmpegPath() {
  return invoke<string[]>('detect_ffmpeg_path');
}

export function pickDownloadDir() {
  return invoke<string | null>('pick_download_dir_command');
}

export function startAuthLogin() {
  return invoke<void>('start_auth_login');
}

export function cancelAuthLogin() {
  return invoke<void>('cancel_auth_login');
}

export function logoutAuth() {
  return invoke<string>('logout_auth');
}

export function openPath(path: string) {
  return invoke<void>('open_path_command', { path });
}

export function openUrl(url: string) {
  return invoke<void>('open_url_command', { url });
}

export function fetchCoverImage(url: string) {
  return invoke<string>('fetch_cover_image', { url });
}

export function getHotkey() {
  return invoke<string>('get_hotkey');
}

export function setHotkey(shortcut: string) {
  return invoke<void>('set_hotkey', { shortcut });
}

export function pauseHotkey() {
  return invoke<void>('pause_hotkey');
}

export async function subscribeRuntimeEvents(
  onEvent: (event: RuntimeEvent) => void,
  onRawLog: (line: string) => void,
) {
  const unlistenCallbacks: Array<() => void> = [];

  try {
    const unlistenEvent = await listen<RuntimeEvent>(
      'runtime:event',
      (event) => {
        onEvent(event.payload);
      },
    );
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

export function subscribeServeStatus(onStatus: (status: ServeStatus) => void) {
  return listen<ServeStatus>('runtime:serve-status', (event) => {
    onStatus(event.payload);
  });
}
