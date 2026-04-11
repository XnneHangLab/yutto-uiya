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
    authState: 'authenticated',
    authMessage: '已登录',
    authSource: '/root/.config/yutto/auth.toml（profile: default）',
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
    runtimeDriver: 'uv',
    pythonPath: '',
    appRoot: '/repo',
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
    startAuthLogin: vi.fn().mockResolvedValue(undefined),
    cancelAuthLogin: vi.fn().mockResolvedValue(undefined),
    logoutAuth: vi.fn().mockResolvedValue('已退出登录'),
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
      groups: [],
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
      undefined,
    );

    // Task should appear in queue
    await waitFor(() =>
      expect(screen.getByText('已进入下载队列')).toBeInTheDocument(),
    );
  });

  it('enqueues grouped child items with the shared group directory', async () => {
    vi.mocked(runtimeBridge.parseTarget).mockResolvedValue({
      items: [],
      groups: [
        {
          title: '合集',
          dir: '合集目录',
          items: [
            {
              index: 1,
              title: '合集视频 1',
              url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
              dir: '',
            },
            {
              index: 2,
              title: '合集视频 2',
              url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
              dir: '',
            },
          ],
        },
      ],
      videoQualities: [],
      audioQualities: [],
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '下载管理' }));

    const urlInput = await screen.findByLabelText('Bilibili 视频链接');
    await user.type(urlInput, 'https://www.bilibili.com/video/BV1xx411c7mD');

    await user.click(screen.getByRole('button', { name: '解析' }));
    await user.click(await screen.findByRole('button', { name: '展开分组 合集' }));
    await user.click(screen.getByRole('button', { name: '下载所选 (2)' }));

    expect(runtimeBridge.enqueueDownload).toHaveBeenNthCalledWith(
      1,
      'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
      expect.any(Object),
      '合集视频 1',
      '合集目录',
    );
    expect(runtimeBridge.enqueueDownload).toHaveBeenNthCalledWith(
      2,
      'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
      expect.any(Object),
      '合集视频 2',
      '合集目录',
    );
  });

  it('shows parse items incrementally before parseTarget resolves', async () => {
    let resolveParse: ((value: {
      items: Array<{ index: number; title: string; url: string; dir: string }>;
      videoQualities: Array<{ label: string; code: number }>;
      audioQualities: Array<{ label: string; code: number }>;
      dir?: string;
    }) => void) | null = null;

    vi.mocked(runtimeBridge.parseTarget).mockImplementation(
      () => new Promise((resolve) => {
        resolveParse = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '下载管理' }));

    const urlInput = await screen.findByLabelText('Bilibili 视频链接');
    await user.type(urlInput, 'https://www.bilibili.com/video/BV1xx411c7mD');
    await user.click(screen.getByRole('button', { name: '解析' }));

    act(() => {
      runtimeBridge.__emitRuntimeEvent({
        event: 'parse.item',
        taskId: '',
        target: 'https://www.bilibili.com/video/BV1xx411c7mD',
        status: 'parsing',
        message: '解析到视频',
        progressCurrent: 1,
        progressTotal: 0,
        progressUnit: 'item',
        timestamp: '1712300004',
        parseItem: {
          index: 1,
          title: '测试视频',
          url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
          dir: '',
        },
      });
    });

    await screen.findByText('测试视频');

    act(() => {
      resolveParse?.({
        items: [
          {
            index: 1,
            title: '测试视频',
            url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
            dir: '',
          },
        ],
        videoQualities: [],
        audioQualities: [],
        groups: [],
      });
    });
  });

  it('blocks download actions until environment probe is ready', async () => {
    vi.mocked(runtimeBridge.probeEnvironment).mockResolvedValue({
      workspaceRoot: '/repo',
      repoRoot: '/repo',
      status: 'yutto-unavailable',
      yuttoAvailable: false,
      yuttoVersion: null,
      ffmpegAvailable: false,
      authState: 'unknown',
      authMessage: '',
      authSource: '',
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

  it('starts auth login from settings and shows qr dialog from runtime events', async () => {
    const user = userEvent.setup();
    vi.mocked(runtimeBridge.probeEnvironment).mockResolvedValue({
      ...readyProbe,
      authState: 'missing',
      authMessage: '未登录，只能下载低画质',
    });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '设置' }));
    await user.click(await screen.findByRole('button', { name: '登录' }));

    expect(runtimeBridge.startAuthLogin).toHaveBeenCalledTimes(1);

    act(() => {
      runtimeBridge.__emitRuntimeEvent({
        event: 'auth.login.qr',
        taskId: '',
        target: 'auth',
        status: 'pending',
        message: '请使用哔哩哔哩 App 扫码登录',
        progressCurrent: 1,
        progressTotal: 3,
        progressUnit: 'step',
        timestamp: '1712300006',
        authQrDataUrl: 'data:image/png;base64,abc',
      });
    });

    expect(await screen.findByRole('dialog', { name: '扫码登录' })).toBeInTheDocument();
    expect(screen.getByAltText('登录二维码')).toHaveAttribute('src', 'data:image/png;base64,abc');
  });

  it('hydrates portable python path from runtime inspection for conda settings', async () => {
    const user = userEvent.setup();
    vi.mocked(runtimeBridge.inspectRuntime).mockResolvedValue({
      ...defaultInspection,
      runtimeDriver: 'uv',
      pythonPath: '/portable/env/python.exe',
      appRoot: '/portable',
    });

    render(<App />);

    await user.click(screen.getByRole('button', { name: '设置' }));
    await user.click(await screen.findByRole('button', { name: 'conda' }));

    expect(screen.getByLabelText('Python 可执行文件路径')).toHaveValue('/portable/env/python.exe');
  });

  it('cancels auth login when closing the qr dialog and allows restarting', async () => {
    const user = userEvent.setup();
    vi.mocked(runtimeBridge.probeEnvironment).mockResolvedValue({
      ...readyProbe,
      authState: 'missing',
      authMessage: '未登录，只能下载低画质',
    });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '设置' }));
    const loginButton = await screen.findByRole('button', { name: '登录' });

    await user.click(loginButton);

    act(() => {
      runtimeBridge.__emitRuntimeEvent({
        event: 'auth.login.qr',
        taskId: '',
        target: 'auth',
        status: 'pending',
        message: '请使用哔哩哔哩 App 扫码登录',
        progressCurrent: 1,
        progressTotal: 3,
        progressUnit: 'step',
        timestamp: '1712300006',
        authQrDataUrl: 'data:image/png;base64,abc',
      });
    });

    await user.click(await screen.findByRole('button', { name: '关闭' }));
    expect(runtimeBridge.cancelAuthLogin).toHaveBeenCalledTimes(1);

    act(() => {
      runtimeBridge.__emitRuntimeEvent({
        event: 'auth.login.cancelled',
        taskId: '',
        target: 'auth',
        status: 'cancelled',
        message: '已取消登录',
        progressCurrent: 0,
        progressTotal: 3,
        progressUnit: 'step',
        timestamp: '1712300007',
      });
    });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '扫码登录' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: '登录' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(runtimeBridge.startAuthLogin).toHaveBeenCalledTimes(2);
  });
});
