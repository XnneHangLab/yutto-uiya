/**
 * JSON-RPC 2.0 client for `yutto serve` (WebSocket transport).
 *
 * Protocol contract (yutto src/yutto/server/{websocket,rpc,service}.py):
 * - the FIRST frame must be `server.authenticate` within the server's
 *   authentication timeout (5s), otherwise the socket is closed (1008);
 * - requests are `{jsonrpc:'2.0', id, method, params}` with object params;
 * - notifications are `{jsonrpc:'2.0', method:'task.event', params}` and are
 *   only delivered for task ids registered via `task.subscribe`;
 * - wire field names are snake_case and wire paths use posix separators.
 *
 * Reference implementation: D:\lab\yuttos\verify_resolve_rpc.py.
 */

export type TaskState =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelling'
  | 'cancelled';

export interface YuttoServerInfo {
  name: string;
  version: string;
  protocol_version: number;
  capabilities: string[];
}

export interface TaskError {
  code: string | number;
  type: string;
  message?: string;
  truncated?: boolean;
}

export interface TaskSnapshotSummary {
  task_id: string;
  state: TaskState;
  error: TaskError | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  last_event_seq: number;
}

export interface TaskSnapshot extends TaskSnapshotSummary {
  payload: Record<string, unknown>;
  result: unknown;
}

export interface TaskListPage {
  tasks: (TaskSnapshotSummary & { url: string })[];
  offset: number;
  next_offset: number | null;
  total: number;
}

export interface TaskEventPayload {
  task_id: string;
  seq: number;
  kind: string;
  state: TaskState;
  created_at: string;
  data: Record<string, unknown>;
}

export interface TaskEventReplay {
  task_id: string;
  after_seq: number;
  events: TaskEventPayload[];
  truncated: boolean;
}

/** DownloadRequest JSON accepted by download.start / resolve.start. */
export type DownloadRequestPayload = Record<string, unknown>;

// Server-side JSON-RPC error codes (websocket.py).
export const AUTHENTICATION_ERROR = -32001;
export const TASK_NOT_FOUND_ERROR = -32004;
export const REQUEST_REJECTED_ERROR = -32010;
export const SERVER_BUSY_ERROR = -32020;

export class YuttoRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(method: string, code: number, message: string, data?: unknown) {
    super(`${method} failed: ${message}`);
    this.name = 'YuttoRpcError';
    this.code = code;
    this.data = data;
  }
}

/**
 * Minimal WebSocket surface the client depends on; the browser WebSocket
 * satisfies it, tests inject a fake.
 */
export interface RpcSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event: never) => void,
  ): void;
}

export type RpcSocketFactory = (url: string) => RpcSocket;

export interface YuttoRpcClientOptions {
  url: string;
  token: string;
  socketFactory?: RpcSocketFactory;
  requestTimeoutMs?: number;
}

export interface RpcCloseInfo {
  code: number;
  reason: string;
}

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const SOCKET_OPEN = 1;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class YuttoRpcClient {
  private readonly socket: RpcSocket;
  private readonly requestTimeoutMs: number;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly taskEventHandlers = new Set<
    (event: TaskEventPayload) => void
  >();
  private readonly closeHandlers = new Set<(info: RpcCloseInfo) => void>();
  private nextId = 1;
  private closed = false;
  private info: YuttoServerInfo | null = null;

  private constructor(socket: RpcSocket, requestTimeoutMs: number) {
    this.socket = socket;
    this.requestTimeoutMs = requestTimeoutMs;
    this.socket.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (typeof event.data === 'string') {
        this.handleMessage(event.data);
      }
    });
    this.socket.addEventListener('close', (event: CloseEvent) => {
      this.handleClose({ code: event.code, reason: event.reason });
    });
  }

  /** Open the socket, authenticate (first frame), and fetch server.info. */
  static async connect(
    options: YuttoRpcClientOptions,
  ): Promise<YuttoRpcClient> {
    const factory: RpcSocketFactory =
      options.socketFactory ??
      ((url) => new WebSocket(url) as unknown as RpcSocket);
    const socket = factory(options.url);
    const client = new YuttoRpcClient(
      socket,
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    );
    await client.waitForOpen();
    await client.request('server.authenticate', { token: options.token });
    client.info = await client.request<YuttoServerInfo>('server.info', {});
    return client;
  }

  get serverInfo(): YuttoServerInfo {
    if (this.info === null) {
      throw new Error('client is not connected');
    }
    return this.info;
  }

  hasCapability(name: string): boolean {
    return this.serverInfo.capabilities.includes(name);
  }

  get isClosed(): boolean {
    return this.closed;
  }

  request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error(`${method} failed: connection closed`));
    }
    const id = this.nextId;
    this.nextId += 1;
    const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(`${method} timed out after ${this.requestTimeoutMs}ms`),
        );
      }, this.requestTimeoutMs);
      this.pending.set(id, {
        method,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      try {
        this.socket.send(frame);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  onTaskEvent(handler: (event: TaskEventPayload) => void): () => void {
    this.taskEventHandlers.add(handler);
    return () => {
      this.taskEventHandlers.delete(handler);
    };
  }

  onClose(handler: (info: RpcCloseInfo) => void): () => void {
    this.closeHandlers.add(handler);
    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.socket.close(1000, 'client closed');
    this.handleClose({ code: 1000, reason: 'client closed' });
  }

  // Typed method wrappers (wire params are snake_case).

  downloadStart(request: DownloadRequestPayload): Promise<TaskSnapshot> {
    return this.request<TaskSnapshot>('download.start', { request });
  }

  resolveStart(request: DownloadRequestPayload): Promise<TaskSnapshot> {
    return this.request<TaskSnapshot>('resolve.start', { request });
  }

  taskGet(taskId: string): Promise<TaskSnapshot> {
    return this.request<TaskSnapshot>('task.get', { task_id: taskId });
  }

  taskList(offset = 0, limit = 50): Promise<TaskListPage> {
    return this.request<TaskListPage>('task.list', { offset, limit });
  }

  taskCancel(taskId: string): Promise<TaskSnapshot> {
    return this.request<TaskSnapshot>('task.cancel', { task_id: taskId });
  }

  /** Registers the task for live task.event pushes and returns the replay. */
  taskSubscribe(taskId: string, afterSeq = 0): Promise<TaskEventReplay> {
    return this.request<TaskEventReplay>('task.subscribe', {
      task_id: taskId,
      after_seq: afterSeq,
    });
  }

  taskUnsubscribe(taskId: string): Promise<{ subscribed: boolean }> {
    return this.request<{ subscribed: boolean }>('task.unsubscribe', {
      task_id: taskId,
    });
  }

  private waitForOpen(): Promise<void> {
    if (this.socket.readyState === SOCKET_OPEN) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      this.socket.addEventListener('open', () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      const fail = (message: string) => {
        if (!settled) {
          settled = true;
          reject(new Error(message));
        }
      };
      this.socket.addEventListener('error', () => {
        fail('WebSocket connection failed');
      });
      this.socket.addEventListener('close', (event: CloseEvent) => {
        fail(`WebSocket closed before open (code ${event.code})`);
      });
    });
  }

  private handleMessage(raw: string): void {
    let message: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        return;
      }
      message = parsed as Record<string, unknown>;
    } catch {
      return;
    }

    const id = message.id;
    if (typeof id === 'number') {
      const request = this.pending.get(id);
      if (!request) {
        return;
      }
      this.pending.delete(id);
      clearTimeout(request.timer);
      const error = message.error;
      if (typeof error === 'object' && error !== null) {
        const shape = error as {
          code?: number;
          message?: string;
          data?: unknown;
        };
        request.reject(
          new YuttoRpcError(
            request.method,
            shape.code ?? 0,
            shape.message ?? 'unknown error',
            shape.data,
          ),
        );
      } else {
        request.resolve(message.result);
      }
      return;
    }

    if (message.method === 'task.event') {
      const params = message.params;
      if (typeof params === 'object' && params !== null) {
        for (const handler of [...this.taskEventHandlers]) {
          handler(params as TaskEventPayload);
        }
      }
    }
  }

  private handleClose(info: RpcCloseInfo): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const [, request] of this.pending) {
      clearTimeout(request.timer);
      request.reject(
        new Error(
          `${request.method} failed: connection closed (code ${info.code})`,
        ),
      );
    }
    this.pending.clear();
    for (const handler of [...this.closeHandlers]) {
      handler(info);
    }
  }
}
