import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from '../../app/App';
import * as runtimeBridge from '../../services/runtime/bridge';
import { type RuntimeEvent } from '../../services/runtime/runtime';

const runtimeListeners = new Set<(event: RuntimeEvent) => void>();
const rawLogListeners = new Set<(line: string) => void>();

const {
  readyProbe,
  defaultInspection,
  defaultManagedFolders,
} = vi.hoisted(() => ({
  readyProbe: {
    workspaceRoot: '/repo',
    repoRoot: '/repo',
    status: 'ready',
    yuttoAvailable: true,
    yuttoVersion: '0.0.3',
    ffmpegAvailable: true,
    issues: [],
    message: '环境就绪',
  },
  defaultInspection: {
    managedPaths: [
      { key: 'workspace', path: '/repo' },
      { key: 'downloads', path: '/repo/downloads' },
      { key: 'logs', path: '/repo/logs' },
    ],
    downloadDir: '/repo/downloads',
    sessData: false,
    ffmpegPath: 'ffmpeg',
    noProxy: false,
  },
  defaultManagedFolders: [
    { key: 'workspace', label: '根目录', path: '/repo' },
    { key: 'downloads', label: '下载目录', path: '/repo/downloads' },
    { key: 'logs', label: '日志目录', path: '/repo/logs' },
  ],
}));

vi.mock('../../services/runtime/bridge', async () => {
  const actual = await vi.importActual<typeof import('../../services/runtime/bridge')>(
    '../../services/runtime/bridge',
  );

  return {
    ...actual,
    probeEnvironment: vi.fn().mockResolvedValue(readyProbe),
    chooseWorkspaceRoot: vi.fn().mockResolvedValue(null),
    useRepoWorkspaceRoot: vi.fn().mockResolvedValue(readyProbe),
    inspectRuntime: vi.fn().mockResolvedValue(defaultInspection),
    listManagedFolders: vi.fn().mockResolvedValue(defaultManagedFolders),
    listDownloadTasks: vi.fn().mockResolvedValue([]),
    enqueueDownload: vi.fn().mockResolvedValue({
      taskId: 'task-1',
      target: 'https://www.bilibili.com/video/BV1xx411c7mD',
      label: 'https://www.bilibili.com/video/BV1xx411c7mD',
      status: 'queued',
      message: '已进入下载队列',
      progressCurrent: 0,
      progressTotal: 3,
      updatedAt: '1712300000',
    }),
    openManagedPath: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue(undefined),
    exportConsoleLogs: vi.fn().mockResolvedValue('/repo/logs/launcher.log'),
    parseTarget: vi.fn().mockResolvedValue({ items: [], videoQualities: [], audioQualities: [] }),
    subscribeRuntimeEvents: vi.fn().mockImplementation(async (onEvent, onRawLog) => {
      runtimeListeners.add(onEvent);
      rawLogListeners.add(onRawLog);
      return () => {
        runtimeListeners.delete(onEvent);
        rawLogListeners.delete(onRawLog);
      };
    }),
    __emitRuntimeEvent(event: RuntimeEvent) {
      runtimeListeners.forEach((listener) => listener(event));
    },
    __emitRawLog(line: string) {
      rawLogListeners.forEach((listener) => listener(line));
    },
  };
});

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
    runtimeListeners.clear();
    rawLogListeners.clear();
    vi.clearAllMocks();
  });

  it('loads managed folders and shows them on the home page', async () => {
    render(<App />);

    // listManagedFolders is called immediately; folder cards appear
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '打开 根目录' })).toBeInTheDocument(),
    );

    expect(screen.getByRole('button', { name: '打开 下载目录' })).toBeInTheDocument();
    expect(runtimeBridge.listManagedFolders).toHaveBeenCalled();
  });

  it('navigates to download page, parses a URL, and enqueues selected items', async () => {
    vi.mocked(runtimeBridge.parseTarget).mockResolvedValue({
      items: [{ index: 1, title: '测试视频', url: 'https://www.bilibili.com/video/BV1xx411c7mD' }],
      videoQualities: [],
      audioQualities: [],
    });

    const user = userEvent.setup();
    render(<App />);

    // Navigate to download page via sidebar
    await user.click(screen.getByRole('button', { name: '下载管理' }));

    // The download form should appear
    const urlInput = await screen.findByLabelText('Bilibili 视频链接');
    await user.type(urlInput, 'https://www.bilibili.com/video/BV1xx411c7mD');

    await user.click(screen.getByRole('button', { name: '解析' }));

    // Parsed item appears; click 下载所选
    await screen.findByText('测试视频');
    await user.click(screen.getByRole('button', { name: /下载所选/ }));

    expect(runtimeBridge.enqueueDownload).toHaveBeenCalledWith(
      'https://www.bilibili.com/video/BV1xx411c7mD',
      expect.any(Object),
      '测试视频',
    );

    // Task should appear in queue
    await waitFor(() =>
      expect(screen.getByText('已进入下载队列')).toBeInTheDocument(),
    );
  });

  it('blocks download actions until environment probe is ready', async () => {
    vi.mocked(runtimeBridge.probeEnvironment).mockResolvedValue({
      workspaceRoot: '/repo',
      repoRoot: '/repo',
      status: 'yutto-unavailable',
      yuttoAvailable: false,
      yuttoVersion: null,
      ffmpegAvailable: false,
      issues: ['No module named uiya'],
      message: 'uiya 不可用',
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '下载管理' }));

    // Parse button is disabled when env not ready
    const parseBtn = await screen.findByRole('button', { name: '解析' });
    expect(parseBtn).toBeDisabled();
  });

  it('toggles theme from the lightbulb action and persists the selection', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    const root = container.querySelector('.launcher-root');
    const lightbulb = screen.getByRole('button', { name: '灯泡' });

    expect((root as Element).getAttribute('data-theme')).toBe('night');

    await user.click(lightbulb);

    expect((root as Element).getAttribute('data-theme')).toBe('day');
    expect(localStorage.getItem('xnnehanglab.theme')).toBe('day');
  });
});
