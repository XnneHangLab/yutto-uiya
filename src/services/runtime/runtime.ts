import { createConsoleLog, type ConsoleLogEntry } from '../launcher/launcher';

export type RuntimeMode = 'cpu' | 'gpu';
export type ResourceStatus = 'missing' | 'partial' | 'ready';
export type RuntimeDriver = 'uv' | 'conda';
export type EnvironmentProbeStatus =
  | 'workspace-invalid'
  | 'uv-unavailable'
  | 'python-unavailable'
  | 'torch-unavailable'
  | 'torch-cpu-ready'
  | 'torch-gpu-ready';
export type DownloadTaskStatus =
  | 'queued'
  | 'preparing'
  | 'downloading'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled';

const downloadTaskStatuses: DownloadTaskStatus[] = [
  'queued',
  'preparing',
  'downloading',
  'verifying',
  'completed',
  'failed',
  'cancelled',
];

const activeStatuses: DownloadTaskStatus[] = [
  'queued',
  'preparing',
  'downloading',
  'verifying',
];

export interface ManagedPath {
  key: string;
  label: string;
  path: string;
}

export interface EnvironmentProbe {
  workspaceRoot: string;
  repoRoot: string;
  status: EnvironmentProbeStatus;
  mode: RuntimeMode | null;
  torchAvailable: boolean;
  torchVersion: string | null;
  cudaAvailable: boolean;
  issues: string[];
  message: string;
}

export interface RuntimeInspection {
  runtimeDriver: RuntimeDriver;
  pythonPath?: string;
  defaultBackend: string;
  environment: {
    mode: RuntimeMode;
    torchAvailable: boolean;
    torchVersion: string | null;
    cudaAvailable: boolean;
    issues: string[];
  };
  availableBackends: string[];
  managedPaths: ManagedPath[];
  resources: Record<
    string,
    {
      key: string;
      label: string;
      status: ResourceStatus;
      path: string;
      missingPaths: string[];
    }
  >;
  latestMessage: string;
}

export interface RuntimeTaskRecord {
  taskId: string;
  target: string;
  label: string;
  status: DownloadTaskStatus;
  message: string;
  progressCurrent: number;
  progressTotal: number;
  updatedAt: string;
}

export interface RuntimeEvent {
  event: string;
  taskId: string;
  target: string;
  status: string;
  message: string;
  progressCurrent: number;
  progressTotal: number;
  progressUnit: string;
  timestamp: string;
  // present only when event === 'download.file_progress'
  desc?: string;
  percent?: number;
  downloaded?: string;
  total?: string;
}

export interface FileProgress {
  target: string;
  desc: string;
  percent: number;
  downloaded?: string;
  total?: string;
}

export interface ManagedFolderItem {
  key: string;
  title: string;
  path: string;
  icon: string;
}

const folderIcons: Record<string, string> = {
  workspace: '📁',
  genieBase: '🧠',
  modelscopeCache: '⬇',
  downloadLogs: '🧾',
  models: '◫',
};

export function buildManagedFolderItems(
  inspection: RuntimeInspection,
): ManagedFolderItem[] {
  return buildFolderItemsFromPaths(inspection.managedPaths);
}

export function buildFolderItemsFromPaths(paths: ManagedPath[]): ManagedFolderItem[] {
  return paths.map((item) => ({
    key: item.key,
    title: item.label,
    path: item.path,
    icon: folderIcons[item.key] ?? '📁',
  }));
}

export function applyRuntimeEvent(
  current: RuntimeTaskRecord[],
  event: RuntimeEvent,
): RuntimeTaskRecord[] {
  const next = [...current];
  const index = next.findIndex((item) => item.taskId === event.taskId);
  const previous = index === -1 ? null : next[index];
  const label =
    previous?.label.trim() || buildRuntimeTaskLabel(event.target);
  const task: RuntimeTaskRecord = {
    taskId: event.taskId,
    target: event.target,
    label,
    status: normalizeRuntimeTaskStatus(event.status),
    message: event.message,
    progressCurrent: event.progressCurrent,
    progressTotal: event.progressTotal,
    updatedAt: event.timestamp,
  };

  if (index === -1) {
    next.push(task);
  } else {
    next[index] = task;
  }

  return next;
}

export function createConsoleLogFromRuntimeEvent(
  event: RuntimeEvent,
): ConsoleLogEntry {
  const kind =
    normalizeRuntimeTaskStatus(event.status) === 'failed' ? 'stderr' : 'system';
  return createConsoleLog(kind, `${event.target}: ${event.message}`);
}

export function getQueueSummary(tasks: RuntimeTaskRecord[]) {
  const activeTask =
    tasks.find((task) => activeStatuses.includes(task.status)) ?? null;

  return {
    queueLength: tasks.filter((task) => activeStatuses.includes(task.status))
      .length,
    activeTask,
  };
}

export function isEnvironmentReady(probe: EnvironmentProbe | null) {
  return (
    probe?.status === 'torch-cpu-ready' ||
    probe?.status === 'torch-gpu-ready'
  );
}

function buildRuntimeTaskLabel(target: string) {
  if (target === 'genie-base') return 'GenieData 基础资源';
  if (target === 'gsv-lite') return 'GSV-Lite 数据包';
  return target;
}

function normalizeRuntimeTaskStatus(status: string): DownloadTaskStatus {
  if (
    downloadTaskStatuses.includes(status as DownloadTaskStatus)
  ) {
    return status as DownloadTaskStatus;
  }

  return 'downloading';
}
