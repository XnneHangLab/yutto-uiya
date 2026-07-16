import type { RuntimeEvent } from '../runtime/runtime';
import { resetRpcConnection } from './connection';
import { FakeSocket, flush } from './fake-socket';
import { resolveParseTarget } from './parse';
import { AUDIO_QUALITY_OPTIONS, VIDEO_QUALITY_OPTIONS } from './quality';

const TARGET = 'https://www.bilibili.com/video/BV1xx';

function stateEvent(seq: number, to: string, error?: unknown) {
  return {
    task_id: 'task-1',
    seq,
    kind: 'state',
    state: to,
    created_at: '2026-07-16T00:00:00',
    data: { from: 'running', to, ...(error ? { error } : {}) },
  };
}

function itemListedEvent(seq: number, data: Record<string, unknown>) {
  return {
    task_id: 'task-1',
    seq,
    kind: 'item_listed',
    state: 'running',
    created_at: '2026-07-16T00:00:00',
    data,
  };
}

interface HarnessOptions {
  capabilities?: string[];
}

/**
 * Drive the connect handshake, answer resolve.start with a snapshot, and
 * hand control back to the test right before task.subscribe is answered.
 */
async function startParse(options: HarnessOptions = {}) {
  const socket = new FakeSocket();
  const events: RuntimeEvent[] = [];
  const parsePromise = resolveParseTarget({
    serve: { url: 'ws://127.0.0.1:0', token: 'tok' },
    target: TARGET,
    onEvent: (event) => {
      events.push(event);
    },
    socketFactory: () => socket,
  });
  const guarded = parsePromise.catch((error: unknown) => error);

  socket.open();
  await flush();
  socket.receive({
    jsonrpc: '2.0',
    id: socket.lastRequest().id,
    result: { authenticated: true },
  });
  await flush();
  socket.receive({
    jsonrpc: '2.0',
    id: socket.lastRequest().id,
    result: {
      name: 'yutto',
      version: '2.2.0',
      protocol_version: 1,
      capabilities: options.capabilities ?? [
        'download.start',
        'resolve.start',
        'task.subscribe',
      ],
    },
  });
  await flush();
  return { socket, events, parsePromise, guarded };
}

async function answerResolveStart(socket: FakeSocket) {
  const request = socket.lastRequest();
  expect(request.method).toBe('resolve.start');
  expect(request.params).toEqual({
    request: { source: { url: TARGET }, scope: { batch: true } },
  });
  socket.receive({
    jsonrpc: '2.0',
    id: request.id,
    result: {
      task_id: 'task-1',
      state: 'queued',
      error: null,
      created_at: '2026-07-16T00:00:00',
      started_at: null,
      finished_at: null,
      last_event_seq: 0,
      payload: { output: { directory: '/dl/root' } },
      result: null,
    },
  });
  await flush();
}

async function answerSubscribe(socket: FakeSocket, replayEvents: unknown[]) {
  const request = socket.lastRequest();
  expect(request.method).toBe('task.subscribe');
  expect(request.params).toEqual({ task_id: 'task-1', after_seq: 0 });
  socket.receive({
    jsonrpc: '2.0',
    id: request.id,
    result: {
      task_id: 'task-1',
      after_seq: 0,
      events: replayEvents,
      truncated: false,
    },
  });
  await flush();
}

async function answerTaskGet(socket: FakeSocket, snapshot: unknown) {
  const request = socket.lastRequest();
  expect(request.method).toBe('task.get');
  socket.receive({ jsonrpc: '2.0', id: request.id, result: snapshot });
  await flush();
}

describe('resolveParseTarget', () => {
  beforeEach(() => {
    resetRpcConnection();
  });

  it('streams parse events and rebuilds items/groups from the final result', async () => {
    const { socket, events, parsePromise } = await startParse();
    await answerResolveStart(socket);

    // Replay carries the start; live pushes deliver the items (seq-deduped).
    await answerSubscribe(socket, [stateEvent(1, 'running')]);
    socket.receive({
      jsonrpc: '2.0',
      method: 'task.event',
      params: itemListedEvent(2, {
        url: `${TARGET}?p=1`,
        name: 'EP01',
        title: '某合集',
        cover_url: 'https://i0.hdslb.com/1.jpg',
        planned_path: '/dl/root/某合集/EP01.mp4',
        display_group: '某合集',
      }),
    });
    socket.receive({
      jsonrpc: '2.0',
      method: 'task.event',
      params: itemListedEvent(2, { url: 'dup', name: 'dup' }),
    });
    socket.receive({
      jsonrpc: '2.0',
      method: 'task.event',
      params: stateEvent(3, 'completed'),
    });
    await flush();

    await answerTaskGet(socket, {
      task_id: 'task-1',
      state: 'completed',
      error: null,
      created_at: '',
      started_at: '',
      finished_at: '',
      last_event_seq: 3,
      payload: { output: { directory: '/dl/root' } },
      result: {
        items: [
          {
            avid: 'av1',
            cid: '10',
            url: `${TARGET}?p=1`,
            name: 'EP01',
            title: '某合集',
            cover_url: 'https://i0.hdslb.com/1.jpg',
            planned_path: '/dl/root/某合集/EP01.mp4',
            display_group: '某合集',
          },
          {
            avid: 'av1',
            cid: '11',
            url: `${TARGET}?p=2`,
            name: 'EP02',
            title: '某合集',
            cover_url: '',
            planned_path: '/dl/root/某合集/EP02.mp4',
            display_group: '某合集',
          },
        ],
      },
    });

    const result = await parsePromise;
    expect(result.items).toEqual([]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups?.[0]).toMatchObject({
      title: '某合集',
      dir: '某合集',
    });
    expect(result.groups?.[0].items.map((item) => item.index)).toEqual([1, 2]);
    expect(result.dir).toBe('某合集');
    expect(result.videoQualities).toEqual(VIDEO_QUALITY_OPTIONS);
    expect(result.audioQualities).toEqual(AUDIO_QUALITY_OPTIONS);

    const names = events.map((event) => event.event);
    expect(names).toEqual(['parse.started', 'parse.item', 'parse.completed']);
    expect(events[1].parseItem).toMatchObject({
      index: 1,
      title: 'EP01',
      dir: '某合集',
      cover: 'https://i0.hdslb.com/1.jpg',
    });
  });

  it('places ungrouped items into root items', async () => {
    const { socket, parsePromise } = await startParse();
    await answerResolveStart(socket);
    await answerSubscribe(socket, [
      stateEvent(1, 'running'),
      stateEvent(2, 'completed'),
    ]);
    await answerTaskGet(socket, {
      task_id: 'task-1',
      state: 'completed',
      error: null,
      created_at: '',
      started_at: '',
      finished_at: '',
      last_event_seq: 2,
      payload: { output: { directory: '/dl/root' } },
      result: {
        items: [
          {
            url: TARGET,
            name: '单个视频',
            title: '单个视频',
            cover_url: '',
            planned_path: '/dl/root/单个视频.mp4',
            display_group: null,
          },
        ],
      },
    });

    const result = await parsePromise;
    expect(result.groups).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      index: 1,
      title: '单个视频',
      dir: '',
    });
    expect(result.dir).toBe('');
  });

  it('rejects with the task error when the resolve task fails', async () => {
    const { socket, guarded } = await startParse();
    await answerResolveStart(socket);
    await answerSubscribe(socket, [
      stateEvent(1, 'running'),
      stateEvent(2, 'failed', {
        code: 'E1',
        type: 'NotFoundError',
        message: '视频不存在',
      }),
    ]);
    await answerTaskGet(socket, {
      task_id: 'task-1',
      state: 'failed',
      error: { code: 'E1', type: 'NotFoundError', message: '视频不存在' },
      created_at: '',
      started_at: '',
      finished_at: '',
      last_event_seq: 2,
      payload: {},
      result: null,
    });

    expect(String(await guarded)).toContain('视频不存在');
  });

  it('maps network options onto the wire request', async () => {
    const socket = new FakeSocket();
    const parsePromise = resolveParseTarget({
      serve: { url: 'ws://127.0.0.1:0', token: 'tok' },
      target: TARGET,
      network: { proxy: 'no', fetchWorkers: 32 },
      socketFactory: () => socket,
    });
    const guarded = parsePromise.catch(() => undefined);

    socket.open();
    await flush();
    socket.receive({
      jsonrpc: '2.0',
      id: socket.lastRequest().id,
      result: { authenticated: true },
    });
    await flush();
    socket.receive({
      jsonrpc: '2.0',
      id: socket.lastRequest().id,
      result: {
        name: 'yutto',
        version: '2.2.0',
        protocol_version: 1,
        capabilities: ['resolve.start'],
      },
    });
    await flush();

    const request = socket.lastRequest();
    expect(request.method).toBe('resolve.start');
    expect(request.params).toEqual({
      request: {
        source: { url: TARGET },
        scope: { batch: true },
        // fetch workers clamp to the server policy ceiling
        network: { proxy: 'no', fetch_workers: 16 },
      },
    });
    socket.serverClose(1000);
    await guarded;
  });

  it('rejects when the server lacks the resolve.start capability', async () => {
    const { guarded } = await startParse({
      capabilities: ['download.start'],
    });
    expect(String(await guarded)).toContain('不支持 resolve.start');
  });

  it('rejects when the connection drops mid-parse', async () => {
    const { socket, guarded } = await startParse();
    await answerResolveStart(socket);
    await answerSubscribe(socket, [stateEvent(1, 'running')]);
    socket.serverClose(1013, 'event consumer is too slow');

    expect(String(await guarded)).toContain('连接已断开');
  });
});
