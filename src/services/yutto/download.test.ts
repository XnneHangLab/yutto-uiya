import type { RuntimeEvent } from '../runtime/runtime';
import { DEFAULT_DOWNLOAD_OPTIONS } from '../runtime/runtime';
import { resetRpcConnection } from './connection';
import {
  cancelDownload,
  type DownloadCompletion,
  startDownload,
} from './download';
import { FakeSocket, flush } from './fake-socket';

const TARGET = 'https://www.bilibili.com/video/BV1xx?p=1';

function stateEvent(taskId: string, seq: number, to: string) {
  return {
    task_id: taskId,
    seq,
    kind: 'state',
    state: to,
    created_at: '2026-07-17T00:00:00',
    data: { from: 'queued', to },
  };
}

async function connectAndAnswerHandshake(socket: FakeSocket) {
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
      capabilities: ['download.start', 'task.subscribe', 'task.cancel'],
    },
  });
  await flush();
}

async function answerDownloadStart(socket: FakeSocket, taskId: string) {
  const request = socket.lastRequest();
  expect(request.method).toBe('download.start');
  socket.receive({
    jsonrpc: '2.0',
    id: request.id,
    result: {
      task_id: taskId,
      state: 'queued',
      error: null,
      created_at: '2026-07-17T00:00:00',
      started_at: null,
      finished_at: null,
      last_event_seq: 0,
      payload: { output: { directory: '/dl/root/某合集' } },
      result: null,
    },
  });
  await flush();
}

async function answerSubscribe(socket: FakeSocket, taskId: string) {
  const request = socket.lastRequest();
  expect(request.method).toBe('task.subscribe');
  expect(request.params).toMatchObject({ task_id: taskId });
  socket.receive({
    jsonrpc: '2.0',
    id: request.id,
    result: { task_id: taskId, after_seq: 0, events: [], truncated: false },
  });
  await flush();
}

describe('startDownload', () => {
  beforeEach(() => {
    resetRpcConnection();
  });

  it('submits the request and resolves with the initial queue record', async () => {
    const socket = new FakeSocket();
    const events: RuntimeEvent[] = [];
    const recordPromise = startDownload({
      serve: { url: 'ws://127.0.0.1:0', token: 'tok' },
      target: TARGET,
      label: 'EP01',
      dir: '某合集',
      options: DEFAULT_DOWNLOAD_OPTIONS,
      network: { proxy: 'no' },
      onEvent: (event) => {
        events.push(event);
      },
      socketFactory: () => socket,
    });
    const guarded = recordPromise.catch((error: unknown) => error);

    await connectAndAnswerHandshake(socket);
    const request = socket.lastRequest();
    expect(request.method).toBe('download.start');
    expect(request.params).toEqual({
      request: {
        source: { url: TARGET },
        scope: { batch: false },
        resources: {
          video: true,
          audio: true,
          danmaku: false,
          subtitle: false,
          cover: false,
          save_cover: false,
        },
        stream: { video_quality: 127, audio_quality: 30280 },
        output: { directory: '某合集' },
        network: { proxy: 'no' },
      },
    });
    await answerDownloadStart(socket, 'task-9');
    await answerSubscribe(socket, 'task-9');

    const record = await guarded;
    expect(record).toMatchObject({
      taskId: 'task-9',
      label: 'EP01',
      status: 'queued',
      saveDir: '某合集',
      progressTotal: 3,
    });

    socket.receive({
      jsonrpc: '2.0',
      method: 'task.event',
      params: stateEvent('task-9', 1, 'running'),
    });
    socket.receive({
      jsonrpc: '2.0',
      method: 'task.event',
      params: stateEvent('task-9', 2, 'completed'),
    });
    await flush();

    const names = events.map((event) => event.event);
    expect(names).toEqual(['download.started', 'download.completed']);
    expect(events[0]).toMatchObject({ progressCurrent: 1, progressTotal: 3 });
    expect(events[1]).toMatchObject({ progressCurrent: 3, progressTotal: 3 });
  });

  it('reports completion and withholds the completed event for wav tasks', async () => {
    const socket = new FakeSocket();
    const events: RuntimeEvent[] = [];
    const completions: DownloadCompletion[] = [];
    const promise = startDownload({
      serve: { url: 'ws://127.0.0.1:0', token: 'tok' },
      target: TARGET,
      label: '音频',
      dir: '',
      options: {
        ...DEFAULT_DOWNLOAD_OPTIONS,
        requireVideo: false,
        audioFormat: 'wav',
      },
      onEvent: (event) => {
        events.push(event);
      },
      onCompleted: (completion) => {
        completions.push(completion);
      },
      socketFactory: () => socket,
    }).catch((error: unknown) => error);

    await connectAndAnswerHandshake(socket);
    const request = socket.lastRequest() as {
      params: { request: Record<string, unknown> };
    };
    // wav is post-converted; the wire downloads m4a
    expect(request.params.request.output).toEqual({
      audio_only_format: 'm4a',
    });
    await answerDownloadStart(socket, 'task-wav');
    await answerSubscribe(socket, 'task-wav');
    await promise;

    socket.receive({
      jsonrpc: '2.0',
      method: 'task.event',
      params: stateEvent('task-wav', 1, 'completed'),
    });
    await flush();

    expect(events.map((event) => event.event)).toEqual(['download.converting']);
    expect(events[0]).toMatchObject({ status: 'verifying' });
    expect(completions).toEqual([
      {
        taskId: 'task-wav',
        target: TARGET,
        saveDir: '',
        needsWavConvert: true,
      },
    ]);
  });

  it('shares one connection across tasks and cancels over RPC', async () => {
    const socket = new FakeSocket();
    const factory = vi.fn(() => socket);

    const first = startDownload({
      serve: { url: 'ws://127.0.0.1:0', token: 'tok' },
      target: TARGET,
      label: 'A',
      dir: '',
      options: DEFAULT_DOWNLOAD_OPTIONS,
      socketFactory: factory,
    }).catch((error: unknown) => error);
    await connectAndAnswerHandshake(socket);
    await answerDownloadStart(socket, 'task-1');
    await answerSubscribe(socket, 'task-1');
    await first;

    const cancelPromise = cancelDownload(
      { url: 'ws://127.0.0.1:0', token: 'tok' },
      'task-1',
      factory,
    );
    await flush();
    const request = socket.lastRequest();
    expect(request.method).toBe('task.cancel');
    expect(request.params).toEqual({ task_id: 'task-1' });
    socket.receive({
      jsonrpc: '2.0',
      id: request.id,
      result: { task_id: 'task-1', state: 'cancelling' },
    });
    await cancelPromise;

    // one physical socket for both operations
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('fails the task when the connection drops mid-download', async () => {
    const socket = new FakeSocket();
    const events: RuntimeEvent[] = [];
    const promise = startDownload({
      serve: { url: 'ws://127.0.0.1:0', token: 'tok' },
      target: TARGET,
      label: 'A',
      dir: '',
      options: DEFAULT_DOWNLOAD_OPTIONS,
      onEvent: (event) => {
        events.push(event);
      },
      socketFactory: () => socket,
    }).catch((error: unknown) => error);
    await connectAndAnswerHandshake(socket);
    await answerDownloadStart(socket, 'task-1');
    await answerSubscribe(socket, 'task-1');
    await promise;

    socket.serverClose(1013, 'event consumer is too slow');
    await flush();

    expect(events.map((event) => event.event)).toEqual(['download.failed']);
    expect(events[0].message).toContain('连接已断开');
  });
});
