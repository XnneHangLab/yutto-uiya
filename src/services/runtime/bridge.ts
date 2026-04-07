import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  EnvironmentProbe,
  ManagedPath,
  RuntimeEvent,
  RuntimeInspection,
  RuntimeTaskRecord,
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

export function enqueueDownload(target: string) {
  return invoke<RuntimeTaskRecord>('enqueue_download', { target });
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

export function exportConsoleLogs(contents: string) {
  return invoke<string>('export_console_logs', { contents });
}

export function setRuntimeDriver(driver: string, pythonPath: string | null) {
  return invoke<EnvironmentProbe>('set_runtime_driver', { driver, pythonPath });
}

export function pickPythonPath() {
  return invoke<string | null>('pick_python_path_command');
}

export function launchWebui() {
  return invoke<void>('launch_webui');
}

export async function subscribeWebuiStatus(onStatus: (status: string) => void) {
  return listen<string>('webui:status', (event) => {
    onStatus(event.payload);
  });
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
