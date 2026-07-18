/**
 * Shared RPC connection to the managed yutto serve (serve migration 阶段 4).
 * One live client per {url, token} — downloads need a long-lived socket for
 * task.event streaming, and parses reuse it instead of reconnecting. The
 * client's lifetime tracks the serve's: a serve reload issues a new
 * {url, token}, the old socket dies, and the next call reconnects.
 */

import { type RpcSocketFactory, YuttoRpcClient } from './rpc';

export interface ServeConnectionInfo {
  url: string;
  token: string;
}

interface CachedConnection {
  key: string;
  clientPromise: Promise<YuttoRpcClient>;
}

let cached: CachedConnection | null = null;

export async function getRpcClient(
  serve: ServeConnectionInfo,
  socketFactory?: RpcSocketFactory,
): Promise<YuttoRpcClient> {
  const key = `${serve.url}|${serve.token}`;
  if (cached?.key === key) {
    try {
      const client = await cached.clientPromise;
      if (!client.isClosed) {
        return client;
      }
    } catch {
      // fall through to reconnect
    }
  }

  const clientPromise = YuttoRpcClient.connect({
    url: serve.url,
    token: serve.token,
    socketFactory,
  });
  const entry: CachedConnection = { key, clientPromise };
  cached = entry;
  try {
    const client = await clientPromise;
    client.onClose(() => {
      if (cached === entry) {
        cached = null;
      }
    });
    return client;
  } catch (error) {
    if (cached === entry) {
      cached = null;
    }
    throw error;
  }
}

/** Drop the cached connection (tests, or forcing a reconnect). */
export function resetRpcConnection(): void {
  cached = null;
}
