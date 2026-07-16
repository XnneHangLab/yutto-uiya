/**
 * Parse pipeline over yutto serve (serve migration 阶段 3): replaces the old
 * `--skip-download` + log-scraping flow with `resolve.start` +
 * `task.subscribe`. Streams parse.* RuntimeEvents through onEvent while the
 * task runs, then rebuilds the authoritative item/group lists from the final
 * ResolveResult snapshot.
 */

import type {
  QualityOption,
  RuntimeEvent,
  VideoParseGroup,
  VideoParseItem,
  VideoParseResult,
} from '../runtime/runtime';
import {
  createTaskEventTranslator,
  outputDirectoryFromSnapshot,
  wireItemToParseItem,
} from './adapter';
import { AUDIO_QUALITY_OPTIONS, VIDEO_QUALITY_OPTIONS } from './quality';
import {
  type DownloadRequestPayload,
  type RpcSocketFactory,
  type TaskEventPayload,
  type TaskState,
  YuttoRpcClient,
} from './rpc';

export interface ResolveParseOptions {
  serve: { url: string; token: string };
  target: string;
  /**
   * Maps uiya's 网络设置 onto the request (the old pipeline passed these as
   * yutto CLI flags). Omitted fields fall back to server defaults — note the
   * wire default for proxy is "auto" (system proxy), so 不使用代理 users must
   * pass proxy: 'no' or every request may die with ConnectError.
   */
  network?: { proxy?: string; fetchWorkers?: number };
  /** Receives translated parse.* RuntimeEvents as the task progresses. */
  onEvent?: (event: RuntimeEvent) => void;
  /** Test hook forwarded to YuttoRpcClient.connect. */
  socketFactory?: RpcSocketFactory;
}

interface WireResolvedItem extends Record<string, unknown> {
  display_group?: string | null;
}

const TERMINAL_EVENTS: Record<string, TaskState> = {
  'parse.completed': 'completed',
  'parse.failed': 'failed',
  'parse.cancelled': 'cancelled',
};

export async function resolveParseTarget(
  options: ResolveParseOptions,
): Promise<VideoParseResult> {
  const client = await YuttoRpcClient.connect({
    url: options.serve.url,
    token: options.serve.token,
    socketFactory: options.socketFactory,
  });
  try {
    if (!client.hasCapability('resolve.start')) {
      throw new Error(
        `当前 yutto server（${client.serverInfo.version}）不支持 resolve.start，请升级 yutto`,
      );
    }

    const request: DownloadRequestPayload = {
      source: { url: options.target },
      scope: { batch: true },
    };
    if (options.network) {
      const network: Record<string, unknown> = {};
      if (options.network.proxy) {
        network.proxy = options.network.proxy;
      }
      if (options.network.fetchWorkers) {
        // ServerPolicy caps fetch workers (default max 16); clamp so a large
        // uiya setting degrades instead of rejecting the request.
        network.fetch_workers = Math.min(
          Math.max(1, Math.floor(options.network.fetchWorkers)),
          16,
        );
      }
      if (Object.keys(network).length > 0) {
        request.network = network;
      }
    }
    const snapshot = await client.resolveStart(request);
    const taskId = snapshot.task_id;
    const outputDirectory = outputDirectoryFromSnapshot(snapshot);
    const translate = createTaskEventTranslator({
      kind: 'resolve',
      target: options.target,
      outputDirectory,
    });

    let settleTerminal!: () => void;
    let failTerminal!: (error: Error) => void;
    const terminal = new Promise<void>((resolve, reject) => {
      settleTerminal = resolve;
      failTerminal = reject;
    });

    const feed = (wireEvent: TaskEventPayload) => {
      if (wireEvent.task_id !== taskId) {
        return;
      }
      for (const event of translate(wireEvent)) {
        options.onEvent?.(event);
        if (TERMINAL_EVENTS[event.event]) {
          settleTerminal();
        }
      }
    };

    const unsubscribeEvents = client.onTaskEvent(feed);
    const unsubscribeClose = client.onClose((info) => {
      failTerminal(new Error(`与 yutto server 的连接已断开（${info.code}）`));
    });
    try {
      const replay = await client.taskSubscribe(taskId);
      for (const event of replay.events) {
        feed(event);
      }
      await terminal;
    } finally {
      unsubscribeEvents();
      unsubscribeClose();
    }

    const final = await client.taskGet(taskId);
    if (final.state !== 'completed') {
      throw new Error(
        final.error?.message ||
          final.error?.type ||
          `解析未完成（${final.state}）`,
      );
    }
    return buildParseResult(final.result, outputDirectory);
  } finally {
    client.close();
  }
}

/**
 * Rebuild the VideoParseResult from ResolveResult.items. Root items carry an
 * empty display_group; grouped items (合集/多P) land in groups keyed by
 * display_group, mirroring the old ParseResult contract where
 * `items` holds root entries and groups hold the rest.
 */
function buildParseResult(
  result: unknown,
  outputDirectory?: string,
): VideoParseResult {
  const wireItems = extractResolvedItems(result);
  const rootItems: VideoParseItem[] = [];
  const groupOrder: string[] = [];
  const groupedItems = new Map<string, VideoParseItem[]>();

  wireItems.forEach((wireItem, position) => {
    const item = wireItemToParseItem(wireItem, position + 1, outputDirectory);
    const groupTitle =
      typeof wireItem.display_group === 'string' && wireItem.display_group
        ? wireItem.display_group
        : null;
    if (groupTitle === null) {
      rootItems.push(item);
      return;
    }
    const bucket = groupedItems.get(groupTitle);
    if (bucket) {
      bucket.push(item);
    } else {
      groupOrder.push(groupTitle);
      groupedItems.set(groupTitle, [item]);
    }
  });

  const groups: VideoParseGroup[] = groupOrder.map((title) => {
    const items = groupedItems.get(title) ?? [];
    return { title, dir: items[0]?.dir ?? '', items };
  });

  return {
    dir: commonDirPrefix([
      ...rootItems.map((item) => item.dir),
      ...groups.map((group) => group.dir),
    ]),
    items: rootItems,
    groups,
    videoQualities: cloneOptions(VIDEO_QUALITY_OPTIONS),
    audioQualities: cloneOptions(AUDIO_QUALITY_OPTIONS),
  };
}

function extractResolvedItems(result: unknown): WireResolvedItem[] {
  if (typeof result !== 'object' || result === null) {
    return [];
  }
  const items = (result as Record<string, unknown>).items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter(
    (item): item is WireResolvedItem =>
      typeof item === 'object' && item !== null,
  );
}

/** Shared leading posix path segments across all non-empty dirs, else ''. */
function commonDirPrefix(dirs: string[]): string {
  const nonEmpty = dirs.filter(Boolean);
  if (nonEmpty.length === 0 || nonEmpty.length !== dirs.length) {
    return '';
  }
  let prefix = nonEmpty[0].split('/');
  for (const dir of nonEmpty.slice(1)) {
    const segments = dir.split('/');
    let shared = 0;
    while (
      shared < prefix.length &&
      shared < segments.length &&
      prefix[shared] === segments[shared]
    ) {
      shared += 1;
    }
    prefix = prefix.slice(0, shared);
    if (prefix.length === 0) {
      return '';
    }
  }
  return prefix.join('/');
}

function cloneOptions(options: QualityOption[]): QualityOption[] {
  return options.map((option) => ({ ...option }));
}
