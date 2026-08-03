import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from '../../app/App';
import * as runtimeBridge from '../../services/runtime/bridge';
import type { RuntimeEvent } from '../../services/runtime/runtime';
import { startDownload } from '../../services/yutto/download';
import { resolveParseTarget } from '../../services/yutto/parse';

vi.mock('../../services/yutto/parse', () => ({
  resolveParseTarget: vi.fn(),
}));

vi.mock('../../services/yutto/download', () => ({
  startDownload: vi.fn(),
  cancelDownload: vi.fn(),
}));

function queuedRecord(taskId: string, target: string, label: string) {
  return {
    taskId,
    target,
    label,
    status: 'queued' as const,
    message: '已进入下载队列',
    progressCurrent: 0,
    progressTotal: 3,
    updatedAt: '1712300000',
    saveDir: '',
  };
}

const runtimeListeners = new Set<(event: RuntimeEvent) => void>();
const rawLogListeners = new Set<(line: string) => void>();

const { readyProbe, defaultInspection, defaultManagedFolders } = vi.hoisted(
  () => ({
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
      noProxy: true,
      fetchWorkers: 8,
      runtimeDriver: 'uv',
      pythonPath: '',
      appRoot: '/repo',
    },
    defaultManagedFolders: [
      { key: 'workspace', label: '根目录', path: '/repo' },
      { key: 'downloads', label: '下载目录', path: '/repo/downloads' },
      { key: 'logs', label: '日志目录', path: '/repo/logs' },
    ],
  }),
);

vi.mock('../../services/runtime/bridge', async () => {
  const actual = await vi.importActual<
    typeof import('../../services/runtime/bridge')
  >('../../services/runtime/bridge');

  return {
    ...actual,
    probeEnvironment: vi.fn().mockResolvedValue(readyProbe),
    chooseWorkspaceRoot: vi.fn().mockResolvedValue(null),
    useRepoWorkspaceRoot: vi.fn().mockResolvedValue(readyProbe),
    inspectRuntime: vi.fn().mockResolvedValue(defaultInspection),
    listManagedFolders: vi.fn().mockResolvedValue(defaultManagedFolders),
    setRuntimeDriver: vi.fn().mockResolvedValue(readyProbe),
    convertWavAudio: vi.fn().mockResolvedValue(undefined),
    openManagedPath: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue(undefined),
    exportConsoleLogs: vi.fn().mockResolvedValue('/repo/logs/launcher.log'),
    startServe: vi
      .fn()
      .mockResolvedValue({ url: 'ws://127.0.0.1:1', token: 'test-token' }),
    stopServe: vi.fn().mockResolvedValue(undefined),
    getServeStatus: vi.fn().mockResolvedValue({
      status: 'stopped',
      url: null,
      pid: null,
      exitCode: null,
      message: null,
    }),
    subscribeServeStatus: vi.fn().mockResolvedValue(() => {}),
    startAuthLogin: vi.fn().mockResolvedValue(undefined),
    cancelAuthLogin: vi.fn().mockResolvedValue(undefined),
    logoutAuth: vi.fn().mockResolvedValue('已退出登录'),
    getHotkey: vi.fn().mockResolvedValue('Ctrl+Shift+Space'),
    setHotkey: vi.fn().mockResolvedValue(undefined),
    pauseHotkey: vi.fn().mockResolvedValue(undefined),
    subscribeRuntimeEvents: vi
      .fn()
      .mockImplementation(async (onEvent, onRawLog) => {
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
      expect(
        screen.getByRole('button', { name: '打开 根目录' }),
      ).toBeInTheDocument(),
    );

    expect(
      screen.getByRole('button', { name: '打开 下载目录' }),
    ).toBeInTheDocument();
    expect(runtimeBridge.listManagedFolders).toHaveBeenCalled();
  });

  it('navigates to download page, parses a URL, and enqueues selected items', async () => {
    vi.mocked(resolveParseTarget).mockResolvedValue({
      dir: '',
      items: [
        {
          index: 1,
          title: '测试视频',
          url: 'https://www.bilibili.com/video/BV1xx411c7mD',
          dir: '',
        },
      ],
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

    await waitFor(() =>
      expect(resolveParseTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          network: { proxy: 'no', fetchWorkers: 8 },
        }),
      ),
    );

    // Parsed item appears; click 下载所选
    await screen.findAllByText('测试视频');
    vi.mocked(startDownload).mockResolvedValue(
      queuedRecord(
        'task-1',
        'https://www.bilibili.com/video/BV1xx411c7mD',
        '测试视频',
      ),
    );
    await user.click(screen.getByRole('button', { name: /下载所选/ }));

    await waitFor(() =>
      expect(startDownload).toHaveBeenCalledWith(
        expect.objectContaining({
          target: 'https://www.bilibili.com/video/BV1xx411c7mD',
          label: '测试视频',
          dir: '',
          network: { proxy: 'no', fetchWorkers: 8 },
        }),
      ),
    );

    // Task should appear in queue
    await waitFor(() =>
      expect(screen.getByText('已进入下载队列')).toBeInTheDocument(),
    );
  });

  it('passes auto to yutto when automatic proxy use is enabled', async () => {
    vi.mocked(runtimeBridge.inspectRuntime).mockResolvedValue({
      ...defaultInspection,
      noProxy: false,
    });
    vi.mocked(resolveParseTarget).mockResolvedValue({
      dir: '',
      items: [],
      groups: [],
      videoQualities: [],
      audioQualities: [],
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '下载管理' }));
    const urlInput = await screen.findByLabelText('Bilibili 视频链接');
    await user.type(urlInput, 'https://www.bilibili.com/bangumi/play/ep779775');
    await user.click(screen.getByRole('button', { name: '解析' }));

    await waitFor(() =>
      expect(resolveParseTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          network: { proxy: 'auto', fetchWorkers: 8 },
        }),
      ),
    );
  });

  it('keeps the queue card on stage messages while download detail events stream', async () => {
    vi.mocked(resolveParseTarget).mockResolvedValue({
      dir: '',
      items: [
        {
          index: 1,
          title: '测试视频',
          url: 'https://www.bilibili.com/video/BV1xx411c7mD',
          dir: '',
        },
      ],
      groups: [],
      videoQualities: [],
      audioQualities: [],
    });
    let downloadOnEvent: ((event: RuntimeEvent) => void) | undefined;
    vi.mocked(startDownload).mockImplementation(async (args) => {
      downloadOnEvent = args.onEvent;
      return queuedRecord('task-1', args.target, args.label);
    });
    const downloadEvent = (
      name: string,
      status: string,
      message: string,
      current = 0,
    ): RuntimeEvent => ({
      event: name,
      taskId: 'task-1',
      target: 'https://www.bilibili.com/video/BV1xx411c7mD',
      status,
      message,
      progressCurrent: current,
      progressTotal: 3,
      progressUnit: 'stage',
      timestamp: '1712300001',
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '下载管理' }));
    const urlInput = await screen.findByLabelText('Bilibili 视频链接');
    await user.type(urlInput, 'https://www.bilibili.com/video/BV1xx411c7mD');
    await user.click(screen.getByRole('button', { name: '解析' }));
    await screen.findAllByText('测试视频');
    await user.click(screen.getByRole('button', { name: /下载所选/ }));
    await waitFor(() =>
      expect(screen.getByText('已进入下载队列')).toBeInTheDocument(),
    );

    // item_listed 的原始 JSON 不得改写卡片。
    act(() => {
      downloadOnEvent?.(
        downloadEvent(
          'download.item_listed',
          'downloading',
          '{"avid":"BV1xx411c7mD","title":"测试视频","cover_url":"https://i0.hdslb.com/c.jpg"}',
        ),
      );
    });
    expect(screen.getByText('已进入下载队列')).toBeInTheDocument();
    expect(screen.queryByText(/cover_url/)).not.toBeInTheDocument();

    // 三段式状态事件照常推进卡片。
    act(() => {
      downloadOnEvent?.(
        downloadEvent('download.started', 'downloading', '开始下载', 1),
      );
    });
    expect(screen.getByText('开始下载')).toBeInTheDocument();
    expect(screen.getByText('下载中')).toBeInTheDocument();

    // stage 事件推进阶段行（状态消息不动），代替旧的「去控制台看」提示。
    act(() => {
      downloadOnEvent?.({
        ...downloadEvent('download.stage', 'downloading', '解析中: 测试视频'),
        desc: '解析中',
      });
    });
    expect(screen.getByText('开始下载')).toBeInTheDocument();
    expect(screen.getByText('解析中…')).toBeInTheDocument();

    // 字节级 file_progress 驱动真实进度条。
    act(() => {
      downloadOnEvent?.({
        ...downloadEvent('download.file_progress', 'downloading', '下载中 45%'),
        desc: '下载中',
        percent: 45,
        downloaded: '45.0 MiB',
        total: '100.0 MiB',
        speed: '2.4 MiB/s',
      });
    });
    expect(
      screen.getByText('下载中 45% · 45.0 MiB / 100.0 MiB · 2.4 MiB/s'),
    ).toBeInTheDocument();
  });

  it('refreshes the environment once when the download queue drains', async () => {
    vi.mocked(resolveParseTarget).mockResolvedValue({
      dir: '',
      items: [
        {
          index: 1,
          title: '视频一',
          url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
          dir: '',
        },
        {
          index: 2,
          title: '视频二',
          url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
          dir: '',
        },
      ],
      groups: [],
      videoQualities: [],
      audioQualities: [],
    });
    const onEvents = new Map<string, (event: RuntimeEvent) => void>();
    let taskSeq = 0;
    vi.mocked(startDownload).mockImplementation(async (args) => {
      taskSeq += 1;
      const taskId = `task-${taskSeq}`;
      if (args.onEvent) {
        onEvents.set(taskId, args.onEvent);
      }
      return queuedRecord(taskId, args.target, args.label);
    });
    const completed = (taskId: string): RuntimeEvent => ({
      event: 'download.completed',
      taskId,
      target: 'https://www.bilibili.com/video/BV1xx411c7mD',
      status: 'completed',
      message: '下载完成',
      progressCurrent: 3,
      progressTotal: 3,
      progressUnit: 'stage',
      timestamp: '1712300002',
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '下载管理' }));
    const urlInput = await screen.findByLabelText('Bilibili 视频链接');
    await user.type(urlInput, 'https://www.bilibili.com/video/BV1xx411c7mD');
    await user.click(screen.getByRole('button', { name: '解析' }));
    await screen.findAllByText('视频一');
    await user.click(screen.getByRole('button', { name: '下载所选 (2)' }));
    await waitFor(() => expect(onEvents.size).toBe(2));

    const probeCalls = () =>
      vi.mocked(runtimeBridge.probeEnvironment).mock.calls.length;
    const baseline = probeCalls();

    // 第一个任务完成：队列里还有任务，不做环境刷新（避免每单一个 probe）。
    act(() => {
      onEvents.get('task-1')?.(completed('task-1'));
    });
    expect(probeCalls()).toBe(baseline);

    // 最后一个任务完成、队列清空：只刷新一次。
    act(() => {
      onEvents.get('task-2')?.(completed('task-2'));
    });
    await waitFor(() => expect(probeCalls()).toBe(baseline + 1));
  });

  it('does not reset a queue row that advanced before startDownload resolved', async () => {
    vi.mocked(resolveParseTarget).mockResolvedValue({
      dir: '',
      items: [
        {
          index: 1,
          title: '测试视频',
          url: 'https://www.bilibili.com/video/BV1xx411c7mD',
          dir: '',
        },
      ],
      groups: [],
      videoQualities: [],
      audioQualities: [],
    });
    // startDownload 在 resolve 前就回放了 queued/started 事件（真实时序）。
    vi.mocked(startDownload).mockImplementation(async (args) => {
      const base = {
        taskId: 'task-1',
        target: args.target,
        progressTotal: 3,
        progressUnit: 'stage',
        timestamp: '1712300001',
      };
      args.onEvent?.({
        ...base,
        event: 'download.queued',
        status: 'queued',
        message: '已进入队列',
        progressCurrent: 0,
      });
      args.onEvent?.({
        ...base,
        event: 'download.started',
        status: 'downloading',
        message: '开始下载',
        progressCurrent: 1,
      });
      return queuedRecord('task-1', args.target, args.label);
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '下载管理' }));
    const urlInput = await screen.findByLabelText('Bilibili 视频链接');
    await user.type(urlInput, 'https://www.bilibili.com/video/BV1xx411c7mD');
    await user.click(screen.getByRole('button', { name: '解析' }));
    await screen.findAllByText('测试视频');
    await user.click(screen.getByRole('button', { name: /下载所选/ }));

    // record 只补 label/saveDir：已领先的状态不回退到排队中。
    await waitFor(() =>
      expect(screen.getByText('开始下载')).toBeInTheDocument(),
    );
    expect(screen.getByText('下载中')).toBeInTheDocument();
    expect(screen.queryByText('已进入下载队列')).not.toBeInTheDocument();
    expect(screen.queryByText('排队中')).not.toBeInTheDocument();
  });

  it('enqueues grouped child items with the shared group directory', async () => {
    vi.mocked(resolveParseTarget).mockResolvedValue({
      dir: '',
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
    vi.mocked(startDownload).mockImplementation((args) =>
      Promise.resolve(
        queuedRecord(`task-${args.label}`, args.target, args.label),
      ),
    );
    await user.click(
      await screen.findByRole('button', { name: '展开分组 合集' }),
    );
    await user.click(screen.getByRole('button', { name: '下载所选 (2)' }));

    await waitFor(() =>
      expect(startDownload).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          target: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
          label: '合集视频 1',
          dir: '合集目录',
        }),
      ),
    );
    expect(startDownload).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        target: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
        label: '合集视频 2',
        dir: '合集目录',
      }),
    );
  });

  it('shows parse items incrementally before the resolve task finishes', async () => {
    type ParseResolution = Awaited<ReturnType<typeof resolveParseTarget>>;
    let emitParseEvent: ((event: RuntimeEvent) => void) | undefined;
    let resolveParse: ((value: ParseResolution) => void) | null = null;

    vi.mocked(resolveParseTarget).mockImplementation(
      (options) =>
        new Promise((resolve) => {
          emitParseEvent = options.onEvent;
          resolveParse = resolve;
        }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '下载管理' }));

    const urlInput = await screen.findByLabelText('Bilibili 视频链接');
    await user.type(urlInput, 'https://www.bilibili.com/video/BV1xx411c7mD');
    await user.click(screen.getByRole('button', { name: '解析' }));

    // The resolve task streams parse.item through onEvent while running.
    await waitFor(() => expect(emitParseEvent).toBeDefined());
    act(() => {
      emitParseEvent?.({
        event: 'parse.item',
        taskId: 'task-1',
        target: 'https://www.bilibili.com/video/BV1xx411c7mD',
        status: 'preparing',
        message: '解析到 测试视频',
        progressCurrent: 0,
        progressTotal: 0,
        progressUnit: '',
        timestamp: '2026-07-16T00:00:00',
        parseItem: {
          index: 1,
          title: '测试视频',
          url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
          dir: '',
        },
      });
    });

    await screen.findAllByText('测试视频');

    act(() => {
      resolveParse?.({
        dir: '',
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

    expect(
      await screen.findByRole('dialog', { name: '扫码登录' }),
    ).toBeInTheDocument();
    expect(screen.getByAltText('登录二维码')).toHaveAttribute(
      'src',
      'data:image/png;base64,abc',
    );
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

    expect(screen.getByLabelText('Python 可执行文件路径')).toHaveValue(
      '/portable/env/python.exe',
    );
  });

  it('reloads the yutto serve after saving settings', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '设置' }));
    await user.click(
      await screen.findByRole('button', { name: '保存并重新检测' }),
    );

    // 保存成功后 serve 必须重启：--download-root、--ffmpeg-path 和 python
    // 解释器都在 serve 启动时固定，不重启新配置不会生效。
    await waitFor(() => expect(runtimeBridge.stopServe).toHaveBeenCalled());
    const saveOrder = vi.mocked(runtimeBridge.setRuntimeDriver).mock
      .invocationCallOrder[0];
    const stopOrder = vi.mocked(runtimeBridge.stopServe).mock
      .invocationCallOrder[0];
    expect(stopOrder).toBeGreaterThan(saveOrder);
    await waitFor(() => {
      const startOrders = vi.mocked(runtimeBridge.startServe).mock
        .invocationCallOrder;
      expect(startOrders.some((order) => order > stopOrder)).toBe(true);
    });
  });

  it('shows the interruption warning in settings while a parse is running', async () => {
    type ParseResolution = Awaited<ReturnType<typeof resolveParseTarget>>;
    let resolveParse: ((value: ParseResolution) => void) | null = null;
    vi.mocked(resolveParseTarget).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveParse = resolve;
        }),
    );
    const warnText = '正在解析/下载，保存会重启 serve 并中断当前任务';

    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '下载管理' }));
    const urlInput = await screen.findByLabelText('Bilibili 视频链接');
    await user.type(urlInput, 'https://www.bilibili.com/video/BV1xx411c7mD');
    await user.click(screen.getByRole('button', { name: '解析' }));

    // Parse still running — settings must warn that saving cuts it.
    await user.click(screen.getByRole('button', { name: '设置' }));
    expect(await screen.findByText(warnText)).toBeInTheDocument();

    act(() => {
      resolveParse?.({
        dir: '',
        items: [],
        videoQualities: [],
        audioQualities: [],
        groups: [],
      });
    });
    await waitFor(() =>
      expect(screen.queryByText(warnText)).not.toBeInTheDocument(),
    );
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

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: '扫码登录' }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '登录' })).toBeEnabled(),
    );

    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(runtimeBridge.startAuthLogin).toHaveBeenCalledTimes(2);
  });
});
