import { FakeSocket, flush } from './fake-socket';
import {
  AUTHENTICATION_ERROR,
  type TaskEventPayload,
  YuttoRpcClient,
  YuttoRpcError,
} from './rpc';

const SERVER_INFO = {
  name: 'yutto',
  version: '2.2.0',
  protocol_version: 1,
  capabilities: ['download.start', 'resolve.start', 'task.subscribe'],
};

async function connectClient(overrides: { token?: string } = {}) {
  const socket = new FakeSocket();
  const connectPromise = YuttoRpcClient.connect({
    url: 'ws://127.0.0.1:0',
    token: overrides.token ?? 'test-token',
    socketFactory: () => socket,
  });
  socket.open();
  await flush();
  const authenticate = socket.lastRequest();
  socket.receive({
    jsonrpc: '2.0',
    id: authenticate.id,
    result: { authenticated: true },
  });
  await flush();
  const info = socket.lastRequest();
  socket.receive({ jsonrpc: '2.0', id: info.id, result: SERVER_INFO });
  const client = await connectPromise;
  return { client, socket };
}

describe('YuttoRpcClient.connect', () => {
  it('authenticates as the first frame and fetches server.info', async () => {
    const { client, socket } = await connectClient();

    const first = socket.request(0);
    expect(first.method).toBe('server.authenticate');
    expect(first.params).toEqual({ token: 'test-token' });
    expect(socket.request(1).method).toBe('server.info');

    expect(client.serverInfo.version).toBe('2.2.0');
    expect(client.hasCapability('resolve.start')).toBe(true);
    expect(client.hasCapability('auth.login')).toBe(false);
  });

  it('rejects with YuttoRpcError when authentication fails', async () => {
    const socket = new FakeSocket();
    const connectPromise = YuttoRpcClient.connect({
      url: 'ws://127.0.0.1:0',
      token: 'wrong',
      socketFactory: () => socket,
    });
    const guarded = connectPromise.catch((error: unknown) => error);
    socket.open();
    await flush();
    socket.receive({
      jsonrpc: '2.0',
      id: socket.lastRequest().id,
      error: { code: AUTHENTICATION_ERROR, message: 'Authentication failed' },
    });

    const error = await guarded;
    expect(error).toBeInstanceOf(YuttoRpcError);
    expect((error as YuttoRpcError).code).toBe(AUTHENTICATION_ERROR);
  });

  it('rejects when the socket closes before opening', async () => {
    const socket = new FakeSocket();
    const connectPromise = YuttoRpcClient.connect({
      url: 'ws://127.0.0.1:0',
      token: 'test-token',
      socketFactory: () => socket,
    });
    const guarded = connectPromise.catch((error: unknown) => error);
    socket.serverClose(1008, 'authentication timeout');

    expect(String(await guarded)).toContain('closed before open');
  });
});

describe('YuttoRpcClient requests', () => {
  it('matches out-of-order responses and routes notifications', async () => {
    const { client, socket } = await connectClient();
    const events: TaskEventPayload[] = [];
    const unsubscribe = client.onTaskEvent((event) => {
      events.push(event);
    });

    const first = client.taskGet('task-1');
    const second = client.taskList();
    const firstId = socket.request(2).id;
    const secondId = socket.request(3).id;

    socket.receive({
      jsonrpc: '2.0',
      method: 'task.event',
      params: {
        task_id: 'task-1',
        seq: 1,
        kind: 'state',
        state: 'running',
        created_at: '2026-07-16T00:00:00',
        data: { from: 'queued', to: 'running' },
      },
    });
    socket.receive({
      jsonrpc: '2.0',
      id: secondId,
      result: { tasks: [], offset: 0, next_offset: null, total: 0 },
    });
    socket.receive({
      jsonrpc: '2.0',
      id: firstId,
      result: { task_id: 'task-1', state: 'running' },
    });

    await expect(second).resolves.toMatchObject({ total: 0 });
    await expect(first).resolves.toMatchObject({ task_id: 'task-1' });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('state');

    unsubscribe();
    socket.receive({
      jsonrpc: '2.0',
      method: 'task.event',
      params: {
        task_id: 'task-1',
        seq: 2,
        kind: 'state',
        state: 'completed',
        created_at: '',
        data: {},
      },
    });
    expect(events).toHaveLength(1);
  });

  it('sends snake_case params from the typed wrappers', async () => {
    const { client, socket } = await connectClient();

    void client.taskSubscribe('task-9', 5).catch(() => {});
    expect(socket.lastRequest()).toMatchObject({
      method: 'task.subscribe',
      params: { task_id: 'task-9', after_seq: 5 },
    });

    void client
      .resolveStart({ source: { url: 'https://b23.tv/x' } })
      .catch(() => {});
    expect(socket.lastRequest()).toMatchObject({
      method: 'resolve.start',
      params: { request: { source: { url: 'https://b23.tv/x' } } },
    });
  });

  it('rejects with YuttoRpcError carrying code and data', async () => {
    const { client, socket } = await connectClient();

    const pending = client.downloadStart({});
    const guarded = pending.catch((error: unknown) => error);
    socket.receive({
      jsonrpc: '2.0',
      id: socket.lastRequest().id,
      error: {
        code: -32010,
        message: 'Request rejected',
        data: { reason: 'output.directory escapes its configured root' },
      },
    });

    const error = (await guarded) as YuttoRpcError;
    expect(error).toBeInstanceOf(YuttoRpcError);
    expect(error.code).toBe(-32010);
    expect(error.data).toEqual({
      reason: 'output.directory escapes its configured root',
    });
    expect(error.message).toContain('download.start');
  });

  it('rejects pending requests and reports close when the socket dies', async () => {
    const { client, socket } = await connectClient();
    const closes: number[] = [];
    client.onClose((info) => {
      closes.push(info.code);
    });

    const pending = client.taskGet('task-1');
    const guarded = pending.catch((error: unknown) => error);
    socket.serverClose(1013, 'event consumer is too slow');

    expect(String(await guarded)).toContain('connection closed (code 1013)');
    expect(closes).toEqual([1013]);
    expect(client.isClosed).toBe(true);
    await expect(client.taskGet('task-2')).rejects.toThrow('connection closed');
  });

  it('times out requests that never receive a response', async () => {
    const socket = new FakeSocket();
    const connectPromise = YuttoRpcClient.connect({
      url: 'ws://127.0.0.1:0',
      token: 'test-token',
      socketFactory: () => socket,
      requestTimeoutMs: 5,
    });
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
      result: SERVER_INFO,
    });
    const client = await connectPromise;

    const pending = client.taskGet('task-1');
    await expect(pending).rejects.toThrow('timed out after 5ms');
  });
});
