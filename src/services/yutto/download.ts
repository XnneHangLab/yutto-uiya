/**
 * Download pipeline over yutto serve (serve migration 阶段 4): replaces the
 * Rust-side queue + `uiya.cli download` subprocesses with `download.start`
 * per selected atomic URL. The server's task service does the queueing;
 * events stream back over the shared connection and are translated into the
 * existing RuntimeEvent shape, so reducers and the queue page stay untouched.
 *
 * wav output is not a wire format: such tasks download m4a, and on
 * completion the caller is asked (onCompleted.needsWavConvert) to run the
 * retained uiya convert step; the completed event is withheld until then.
 */

import type {
  DownloadOptions,
  RuntimeEvent,
  RuntimeTaskRecord,
} from '../runtime/runtime';
import {
  createTaskEventTranslator,
  outputDirectoryFromSnapshot,
} from './adapter';
import { getRpcClient, type ServeConnectionInfo } from './connection';
import {
  buildDownloadRequest,
  type NetworkPreferences,
  needsWavConversion,
} from './requests';
import type { RpcSocketFactory } from './rpc';

const TERMINAL_DOWNLOAD_EVENTS = new Set([
  'download.completed',
  'download.failed',
  'download.cancelled',
]);

export interface DownloadCompletion {
  taskId: string;
  target: string;
  /** Item directory relative to the downloads root ('' = root itself). */
  saveDir: string;
  /** Caller must run the wav conversion and then emit the final event. */
  needsWavConvert: boolean;
}

export interface StartDownloadArgs {
  serve: ServeConnectionInfo;
  /** Atomic URL of one episode. */
  target: string;
  /** Display label for the queue row (usually the item title). */
  label: string;
  /** Item directory relative to the downloads root ('' = root itself). */
  dir: string;
  options: DownloadOptions;
  network?: NetworkPreferences;
  /** Receives translated download.* RuntimeEvents as the task progresses. */
  onEvent?: (event: RuntimeEvent) => void;
  /** Fired once when the server reports completed (after wav interception). */
  onCompleted?: (completion: DownloadCompletion) => void;
  /** Test hook forwarded to the connection manager. */
  socketFactory?: RpcSocketFactory;
}

/**
 * Submit one download and stream its events until a terminal state. Resolves
 * with the initial queue record as soon as the server accepts the task.
 */
export async function startDownload(
  args: StartDownloadArgs,
): Promise<RuntimeTaskRecord> {
  const client = await getRpcClient(args.serve, args.socketFactory);
  if (!client.hasCapability('download.start')) {
    throw new Error(
      `当前 yutto server（${client.serverInfo.version}）不支持 download.start`,
    );
  }

  const request = buildDownloadRequest(args);
  const snapshot = await client.downloadStart(request);
  const taskId = snapshot.task_id;
  const needsWav = needsWavConversion(args.options);
  const translate = createTaskEventTranslator({
    kind: 'download',
    target: args.target,
    outputDirectory: outputDirectoryFromSnapshot(snapshot),
  });

  let settled = false;
  let unsubscribeEvents = () => {};
  let unsubscribeClose = () => {};
  const cleanup = () => {
    unsubscribeEvents();
    unsubscribeClose();
  };

  const finish = (event: RuntimeEvent) => {
    settled = true;
    cleanup();
    if (event.event === 'download.completed') {
      args.onCompleted?.({
        taskId,
        target: args.target,
        saveDir: args.dir,
        needsWavConvert: needsWav,
      });
    }
  };

  const feed = (wireEvent: Parameters<typeof translate>[0]) => {
    if (wireEvent.task_id !== taskId || settled) {
      return;
    }
    for (const event of translate(wireEvent)) {
      if (needsWav && event.event === 'download.completed') {
        // Hold the final state: the caller converts to wav first, then
        // emits its own completed/failed event for the task row.
        args.onEvent?.({
          ...event,
          event: 'download.converting',
          status: 'verifying',
          message: '下载完成，正在转码为 wav …',
          progressCurrent: 2,
          progressTotal: 3,
          progressUnit: 'stage',
        });
        finish(event);
        return;
      }
      args.onEvent?.(event);
      if (TERMINAL_DOWNLOAD_EVENTS.has(event.event)) {
        finish(event);
        return;
      }
    }
  };

  unsubscribeEvents = client.onTaskEvent(feed);
  unsubscribeClose = client.onClose((info) => {
    if (settled) {
      return;
    }
    settled = true;
    args.onEvent?.({
      event: 'download.failed',
      taskId,
      target: args.target,
      status: 'failed',
      message: `与 yutto server 的连接已断开（${info.code}）`,
      progressCurrent: 0,
      progressTotal: 0,
      progressUnit: '',
      timestamp: snapshot.created_at,
    });
  });

  try {
    const replay = await client.taskSubscribe(taskId);
    for (const event of replay.events) {
      feed(event);
    }
  } catch (error) {
    cleanup();
    throw error;
  }

  return {
    taskId,
    target: args.target,
    label: args.label,
    status: 'queued',
    message: '已进入下载队列',
    progressCurrent: 0,
    progressTotal: 3,
    updatedAt: snapshot.created_at,
    saveDir: args.dir,
  };
}

export async function cancelDownload(
  serve: ServeConnectionInfo,
  taskId: string,
  socketFactory?: RpcSocketFactory,
): Promise<void> {
  const client = await getRpcClient(serve, socketFactory);
  await client.taskCancel(taskId);
}
