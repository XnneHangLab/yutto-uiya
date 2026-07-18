/**
 * Test double for RpcSocket, shared by the yutto service vitest suites.
 * Not imported by production code.
 */

import type { RpcSocket } from './rpc';

type FakeListener = (event: unknown) => void;

export class FakeSocket implements RpcSocket {
  readyState = 0;
  sent: string[] = [];
  private listeners: Record<string, FakeListener[]> = {
    open: [],
    message: [],
    close: [],
    error: [],
  };

  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event: never) => void,
  ): void {
    this.listeners[type]?.push(listener as FakeListener);
  }

  send(data: string): void {
    if (this.readyState !== 1) {
      throw new Error('socket is not open');
    }
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    this.emit('close', { code, reason });
  }

  // test drivers
  open(): void {
    this.readyState = 1;
    this.emit('open', {});
  }

  receive(message: unknown): void {
    this.emit('message', { data: JSON.stringify(message) });
  }

  serverClose(code: number, reason = ''): void {
    this.readyState = 3;
    this.emit('close', { code, reason });
  }

  fail(): void {
    this.emit('error', {});
  }

  request(index: number): Record<string, unknown> {
    return JSON.parse(this.sent[index]) as Record<string, unknown>;
  }

  lastRequest(): Record<string, unknown> {
    return this.request(this.sent.length - 1);
  }

  private emit(type: string, event: unknown): void {
    for (const listener of [...(this.listeners[type] ?? [])]) {
      listener(event);
    }
  }
}

export function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
