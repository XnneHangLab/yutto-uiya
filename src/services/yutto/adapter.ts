/**
 * Translate `task.event` notifications from yutto serve into the existing
 * RuntimeEvent shape so reducers and pages stay untouched (migration plan
 * 阶段 2): item_listed → parse.item, progress → download.file_progress,
 * runtime state → download.started/completed/failed.
 *
 * Wire event vocabulary (yutto src/yutto/core/task_service.py):
 *   state{from,to,error?} · batch_started{total} · request_queued{url,index,total}
 *   stage{name,item?} · progress{phase,current,total,speed_per_second,unit}
 *   item_skipped{item,reason} · artifact_created{path,item}
 *   item_listed{avid,cid,url,name,title,cover_url,planned_path,display_group}
 */

import type { RuntimeEvent, VideoParseItem } from '../runtime/runtime';
import type { TaskEventPayload, TaskSnapshot } from './rpc';

export type YuttoTaskKind = 'resolve' | 'download';

export interface TaskEventAdapterContext {
  /** resolve tasks emit parse.* events, download tasks emit download.*. */
  kind: YuttoTaskKind;
  /** The original request URL; becomes RuntimeEvent.target. */
  target: string;
  /**
   * Absolute posix download root from the task snapshot's
   * payload.output.directory; used to relativize item_listed planned_path
   * into VideoParseItem.dir. Without it dir falls back to ''.
   */
  outputDirectory?: string;
}

const STAGE_LABELS: Record<string, string> = {
  resolving: '解析中',
  preparing: '准备中',
  writing_resources: '写入附件',
  downloading: '下载中',
  postprocessing: '后处理中',
};

/**
 * Create a stateful translator for one task. It deduplicates by seq (the
 * task.subscribe replay and live pushes may overlap) and assigns
 * VideoParseItem.index in arrival order.
 */
export function createTaskEventTranslator(
  context: TaskEventAdapterContext,
): (event: TaskEventPayload) => RuntimeEvent[] {
  let lastSeq = 0;
  let itemIndex = 0;

  return (event) => {
    if (event.seq <= lastSeq) {
      return [];
    }
    lastSeq = event.seq;

    switch (event.kind) {
      case 'state':
        return translateState(context, event);
      case 'item_listed':
        if (context.kind === 'resolve') {
          itemIndex += 1;
          return translateItemListed(context, event, itemIndex);
        }
        return [genericEvent(context, event, describeData(event.data))];
      case 'progress':
        return translateProgress(context, event);
      case 'stage':
        return [
          genericEvent(
            context,
            event,
            stageMessage(event.data.name, event.data.item),
          ),
        ];
      case 'batch_started':
        return [
          genericEvent(context, event, `批量任务：共 ${event.data.total} 项`),
        ];
      case 'request_queued':
        return [
          genericEvent(
            context,
            event,
            `排队 ${event.data.index}/${event.data.total}: ${event.data.url}`,
          ),
        ];
      case 'item_skipped':
        return [
          genericEvent(
            context,
            event,
            `跳过 ${event.data.item}（${event.data.reason}）`,
          ),
        ];
      case 'artifact_created':
        return [genericEvent(context, event, `产物: ${event.data.path}`)];
      default:
        return [genericEvent(context, event, describeData(event.data))];
    }
  };
}

/** Extract payload.output.directory (absolute posix) from a task snapshot. */
export function outputDirectoryFromSnapshot(
  snapshot: Pick<TaskSnapshot, 'payload'>,
): string | undefined {
  const output = snapshot.payload.output;
  if (typeof output !== 'object' || output === null) {
    return undefined;
  }
  const directory = (output as Record<string, unknown>).directory;
  return typeof directory === 'string' ? directory : undefined;
}

function translateState(
  context: TaskEventAdapterContext,
  event: TaskEventPayload,
): RuntimeEvent[] {
  const prefix = eventPrefix(context);
  const to = String(event.data.to ?? '');
  switch (to) {
    case 'queued':
      return [
        baseEvent(context, event, `${prefix}.queued`, 'queued', '已进入队列'),
      ];
    case 'running':
      return [
        baseEvent(
          context,
          event,
          `${prefix}.started`,
          context.kind === 'resolve' ? 'preparing' : 'downloading',
          context.kind === 'resolve' ? '开始解析' : '开始下载',
        ),
      ];
    case 'completed':
      return [
        baseEvent(
          context,
          event,
          `${prefix}.completed`,
          'completed',
          context.kind === 'resolve' ? '解析完成' : '下载完成',
        ),
      ];
    case 'failed':
      return [
        baseEvent(
          context,
          event,
          `${prefix}.failed`,
          'failed',
          errorMessage(event.data.error) ??
            (context.kind === 'resolve' ? '解析失败' : '下载失败'),
        ),
      ];
    case 'cancelled':
      return [
        baseEvent(context, event, `${prefix}.cancelled`, 'cancelled', '已取消'),
      ];
    default:
      // cancelling and未来的中间态：仅作为控制台信息展示。
      return [genericEvent(context, event, `状态: ${to}`)];
  }
}

function translateItemListed(
  context: TaskEventAdapterContext,
  event: TaskEventPayload,
  index: number,
): RuntimeEvent[] {
  const data = event.data;
  const title = String(data.name ?? data.title ?? '');
  const item: VideoParseItem = {
    index,
    title,
    url: String(data.url ?? ''),
    dir: relativeParentDir(
      typeof data.planned_path === 'string' ? data.planned_path : '',
      context.outputDirectory,
    ),
  };
  if (typeof data.cover_url === 'string' && data.cover_url) {
    item.cover = data.cover_url;
  }
  return [
    {
      ...baseEvent(
        context,
        event,
        'parse.item',
        'preparing',
        `解析到 ${title}`,
      ),
      parseItem: item,
    },
  ];
}

function translateProgress(
  context: TaskEventAdapterContext,
  event: TaskEventPayload,
): RuntimeEvent[] {
  const data = event.data;
  const current = toFiniteNumber(data.current);
  const total = toFiniteNumber(data.total);
  const phase = String(data.phase ?? 'downloading');
  const desc = STAGE_LABELS[phase] ?? phase;
  const percent =
    total > 0 ? Math.min(100, Math.floor((current / total) * 100)) : undefined;

  const runtimeEvent: RuntimeEvent = {
    ...baseEvent(
      context,
      event,
      `${eventPrefix(context)}.file_progress`,
      context.kind === 'resolve' ? 'preparing' : 'downloading',
      percent === undefined ? desc : `${desc} ${percent}%`,
    ),
    desc,
    downloaded: formatBytes(current),
  };
  runtimeEvent.progressCurrent = current;
  runtimeEvent.progressTotal = total;
  runtimeEvent.progressUnit = 'bytes';
  if (percent !== undefined) {
    runtimeEvent.percent = percent;
  }
  if (total > 0) {
    runtimeEvent.total = formatBytes(total);
  }
  return [runtimeEvent];
}

function baseEvent(
  context: TaskEventAdapterContext,
  event: TaskEventPayload,
  name: string,
  status: string,
  message: string,
): RuntimeEvent {
  return {
    event: name,
    taskId: event.task_id,
    target: context.target,
    status,
    message,
    progressCurrent: 0,
    progressTotal: 0,
    progressUnit: '',
    timestamp: event.created_at,
  };
}

function genericEvent(
  context: TaskEventAdapterContext,
  event: TaskEventPayload,
  message: string,
): RuntimeEvent {
  return baseEvent(
    context,
    event,
    `${eventPrefix(context)}.${event.kind}`,
    context.kind === 'resolve' ? 'preparing' : 'downloading',
    message,
  );
}

function eventPrefix(context: TaskEventAdapterContext): 'parse' | 'download' {
  return context.kind === 'resolve' ? 'parse' : 'download';
}

function stageMessage(name: unknown, item: unknown): string {
  const label = STAGE_LABELS[String(name)] ?? String(name ?? '');
  return typeof item === 'string' && item ? `${label}: ${item}` : label;
}

function errorMessage(error: unknown): string | undefined {
  if (typeof error === 'string' && error) {
    return error;
  }
  if (typeof error === 'object' && error !== null) {
    const shape = error as { message?: unknown; type?: unknown };
    if (typeof shape.message === 'string' && shape.message) {
      return shape.message;
    }
    if (typeof shape.type === 'string' && shape.type) {
      return shape.type;
    }
  }
  return undefined;
}

function describeData(data: Record<string, unknown>): string {
  try {
    const text = JSON.stringify(data);
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  } catch {
    return '';
  }
}

/**
 * Parent directory of a posix planned_path, relative to the download root.
 * Wire paths always use forward slashes (service.py `_to_json_value`).
 */
function relativeParentDir(plannedPath: string, root?: string): string {
  const separator = plannedPath.lastIndexOf('/');
  if (separator <= 0) {
    return '';
  }
  const parent = plannedPath.slice(0, separator);
  if (!root) {
    return '';
  }
  const normalizedRoot = root.endsWith('/') ? root.slice(0, -1) : root;
  if (parent === normalizedRoot) {
    return '';
  }
  if (parent.startsWith(`${normalizedRoot}/`)) {
    return parent.slice(normalizedRoot.length + 1);
  }
  return '';
}

function toFiniteNumber(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${Math.floor(value)} B`;
  }
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let scaled = value;
  let unit = 'B';
  for (const next of units) {
    if (scaled < 1024) {
      break;
    }
    scaled /= 1024;
    unit = next;
  }
  return `${scaled.toFixed(1)} ${unit}`;
}
