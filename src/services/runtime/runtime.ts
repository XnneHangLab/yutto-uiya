import { createConsoleLog, type ConsoleLogEntry } from '../launcher/launcher';

export type RuntimeDriver = 'uv' | 'conda';
export type EnvironmentProbeStatus =
  | 'workspace-invalid'
  | 'uv-unavailable'
  | 'python-unavailable'
  | 'yutto-unavailable'
  | 'ready';
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
  yuttoAvailable: boolean;
  yuttoVersion: string | null;
  ffmpegAvailable: boolean;
  issues: string[];
  message: string;
}

export interface RuntimeInspection {
  managedPaths: { key: string; path: string }[];
  downloadDir: string;
  sessData: boolean;
  ffmpegPath: string;
  noProxy: boolean;
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

export interface VideoParseItem {
  index: number;
  title: string;
  url: string;
}

export interface ManagedFolderItem {
  key: string;
  title: string;
  path: string;
  icon: string;
}

const folderIcons: Record<string, string> = {
  workspace: '📁',
  downloads: '⬇',
  logs: '🧾',
};

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
  return probe?.status === 'ready';
}

function buildRuntimeTaskLabel(target: string) {
  // use the URL as-is; the Rust task record already stores it as label
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
