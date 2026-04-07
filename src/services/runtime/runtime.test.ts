import {
  applyRuntimeEvent,
  buildFolderItemsFromPaths,
  createConsoleLogFromRuntimeEvent,
  type RuntimeTaskRecord,
} from './runtime';
import { listen } from '@tauri-apps/api/event';
import { subscribeRuntimeEvents } from './bridge';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

describe('runtime helpers', () => {
  const mockedListen = vi.mocked(listen);

  const managedPaths = [
    { key: 'workspace', label: '根目录', path: '/repo' },
    { key: 'downloads', label: '下载目录', path: '/repo/downloads' },
    { key: 'logs', label: '日志目录', path: '/repo/logs' },
  ];

  beforeEach(() => {
    mockedListen.mockReset();
  });

  it('builds folder items from managed paths', () => {
    expect(buildFolderItemsFromPaths(managedPaths)).toEqual([
      { key: 'workspace', title: '根目录', path: '/repo', icon: '📁' },
      { key: 'downloads', title: '下载目录', path: '/repo/downloads', icon: '⬇' },
      { key: 'logs', title: '日志目录', path: '/repo/logs', icon: '🧾' },
    ]);
  });

  it('upserts task state from a runtime event', () => {
    const current: RuntimeTaskRecord[] = [];
    const next = applyRuntimeEvent(current, {
      event: 'download.progress',
      taskId: 'task-1',
      target: 'https://www.bilibili.com/video/BV1xx411c7mD',
      status: 'downloading',
      message: '正在下载',
      progressCurrent: 1,
      progressTotal: 3,
      progressUnit: 'stage',
      timestamp: '1712300000',
    });

    expect(next).toEqual([
      {
        taskId: 'task-1',
        target: 'https://www.bilibili.com/video/BV1xx411c7mD',
        label: 'https://www.bilibili.com/video/BV1xx411c7mD',
        status: 'downloading',
        message: '正在下载',
        progressCurrent: 1,
        progressTotal: 3,
        updatedAt: '1712300000',
      },
    ]);
  });

  it('preserves an existing task label when applying runtime updates', () => {
    const current: RuntimeTaskRecord[] = [
      {
        taskId: 'task-1',
        target: 'genie-base',
        label: '自定义任务名',
        status: 'queued',
        message: '已进入下载队列',
        progressCurrent: 0,
        progressTotal: 3,
        updatedAt: '1712300000',
      },
    ];

    const next = applyRuntimeEvent(current, {
      event: 'download.progress',
      taskId: 'task-1',
      target: 'genie-base',
      status: 'downloading',
      message: '正在下载',
      progressCurrent: 1,
      progressTotal: 3,
      progressUnit: 'stage',
      timestamp: '1712300001',
    });

    expect(next).toEqual([
      {
        taskId: 'task-1',
        target: 'genie-base',
        label: '自定义任务名',
        status: 'downloading',
        message: '正在下载',
        progressCurrent: 1,
        progressTotal: 3,
        updatedAt: '1712300001',
      },
    ]);
  });

  it('normalizes unknown runtime status values into downloading', () => {
    const next = applyRuntimeEvent([], {
      event: 'download.progress',
      taskId: 'task-unknown',
      target: 'genie-base',
      status: 'mystery-status',
      message: 'unknown',
      progressCurrent: 0,
      progressTotal: 3,
      progressUnit: 'stage',
      timestamp: '1712300002',
    });

    expect(next[0]?.status).toBe('downloading');
  });

  it('converts runtime events into console lines', () => {
    const log = createConsoleLogFromRuntimeEvent({
      event: 'download.failed',
      taskId: 'task-1',
      target: 'genie-base',
      status: 'failed',
      message: 'network error',
      progressCurrent: 3,
      progressTotal: 3,
      progressUnit: 'stage',
      timestamp: '1712300000',
    });

    expect(log.kind).toBe('stderr');
    expect(log.text).toContain('network error');
  });

  it('cleans up registered listeners when runtime subscription partially fails', async () => {
    const eventCleanup = vi.fn();
    mockedListen
      .mockResolvedValueOnce(eventCleanup)
      .mockRejectedValueOnce(new Error('listen failed'));

    await expect(
      subscribeRuntimeEvents(
        () => undefined,
        () => undefined,
      ),
    ).rejects.toThrow('listen failed');

    expect(eventCleanup).toHaveBeenCalledTimes(1);
  });

  it('returns a cleanup function that unlistens both runtime channels', async () => {
    const eventCleanup = vi.fn();
    const rawCleanup = vi.fn();
    mockedListen
      .mockResolvedValueOnce(eventCleanup)
      .mockResolvedValueOnce(rawCleanup);

    const cleanup = await subscribeRuntimeEvents(
      () => undefined,
      () => undefined,
    );

    cleanup();

    expect(eventCleanup).toHaveBeenCalledTimes(1);
    expect(rawCleanup).toHaveBeenCalledTimes(1);
  });
});
