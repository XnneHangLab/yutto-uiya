import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from '../../app/App';
import * as runtimeBridge from '../../services/runtime/bridge';
import type { RuntimeEvent } from '../../services/runtime/runtime';

const runtimeListeners = new Set<(event: RuntimeEvent) => void>();
const rawLogListeners = new Set<(line: string) => void>();

vi.mock('../../services/runtime/bridge', async () => {
  const actual = await vi.importActual<typeof import('../../services/runtime/bridge')>(
    '../../services/runtime/bridge',
  );

  return {
    ...actual,
    probeEnvironment: vi.fn().mockResolvedValue({
      workspaceRoot: '/repo',
      repoRoot: '/repo',
      status: 'torch-cpu-ready',
      mode: 'cpu',
      torchAvailable: true,
      torchVersion: '2.6.0+cpu',
      cudaAvailable: false,
      issues: [],
      message: 'torch 已就绪: CPU',
    }),
    chooseWorkspaceRoot: vi.fn().mockResolvedValue(null),
    useRepoWorkspaceRoot: vi.fn().mockResolvedValue({
      workspaceRoot: '/repo',
      repoRoot: '/repo',
      status: 'torch-cpu-ready',
      mode: 'cpu',
      torchAvailable: true,
      torchVersion: '2.6.0+cpu',
      cudaAvailable: false,
      issues: [],
      message: 'torch 已就绪: CPU',
    }),
    inspectRuntime: vi.fn().mockResolvedValue({
      runtimeDriver: 'uv',
      pythonPath: '/repo/.venv/bin/python',
      defaultBackend: 'genie-tts',
      environment: {
        mode: 'cpu',
        torchAvailable: true,
        torchVersion: '2.6.0+cpu',
        cudaAvailable: false,
        issues: [],
      },
      availableBackends: ['genie-tts'],
      managedPaths: [
        { key: 'workspace', label: '根目录', path: '/repo' },
        { key: 'genieBase', label: 'Genie 基础资源', path: '/repo/models/genie/base' },
        { key: 'modelscopeCache', label: 'ModelScope 缓存', path: '/repo/models/cache/modelscope' },
        { key: 'downloadLogs', label: '下载日志', path: '/repo/logs/downloads' },
      ],
      resources: {
        'genie-base': {
          key: 'genie-base',
          label: 'GenieData 基础资源',
          status: 'missing',
          path: '/repo/models/genie/base/GenieData',
          missingPaths: ['speaker_encoder.onnx'],
        },
        'gsv-lite': {
          key: 'gsv-lite',
          label: 'GSV-Lite 数据包',
          status: 'missing',
          path: '/repo/models/GSVLiteData',
          missingPaths: ['chinese-hubert-base'],
        },
      },
      latestMessage: '运行驱动 uv，当前环境 CPU',
    }),
    listDownloadTasks: vi.fn().mockResolvedValue([]),
    enqueueDownload: vi.fn().mockResolvedValue({
      taskId: 'task-1',
      target: 'genie-base',
      label: 'GenieData 基础资源',
      status: 'queued',
      message: '已进入下载队列',
      progressCurrent: 0,
      progressTotal: 3,
      updatedAt: '1712300000',
    }),
    openManagedPath: vi.fn().mockResolvedValue(undefined),
    exportConsoleLogs: vi.fn().mockResolvedValue('/repo/logs/downloads/launcher.log'),
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

  it('loads runtime inspection, navigates to models, and keeps queue state in sync', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Wait for inspection to load — folder cards from managed paths appear
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '打开 根目录' })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: '模型管理' }));

    // First "下载" button corresponds to genie-tts (non-gpu card, always enabled)
    const downloadBtns = screen.getAllByRole('button', { name: '下载' });
    await user.click(downloadBtns[0]);
    expect(runtimeBridge.enqueueDownload).toHaveBeenCalledWith('genie-base');

    const mockedBridge = runtimeBridge as typeof runtimeBridge & {
      __emitRuntimeEvent: (event: RuntimeEvent) => void;
    };

    await act(async () => {
      mockedBridge.__emitRuntimeEvent({
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
    });

    await waitFor(() => expect(screen.getByText('正在下载')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '一键启动' }));
    expect(screen.getByRole('button', { name: '打开 Genie 基础资源' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '打开 Genie 基础资源' }));
    expect(runtimeBridge.openManagedPath).toHaveBeenCalledWith('genieBase');

    await user.click(screen.getByRole('button', { name: '控制台' }));
    expect(screen.getByText('运行驱动 uv')).toBeInTheDocument();
    expect(screen.getByText('当前任务 GenieData 基础资源')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '设置' }));
    expect(screen.getByText('CPU 就绪')).toBeInTheDocument();
  });

  it('refreshes inspection after download completion so model card status matches disk state', async () => {
    const user = userEvent.setup();
    vi.mocked(runtimeBridge.inspectRuntime)
      .mockResolvedValueOnce({
        runtimeDriver: 'uv',
        pythonPath: '/repo/.venv/bin/python',
        defaultBackend: 'genie-tts',
        environment: {
          mode: 'cpu',
          torchAvailable: true,
          torchVersion: '2.6.0+cpu',
          cudaAvailable: false,
          issues: [],
        },
        availableBackends: ['genie-tts'],
        managedPaths: [
          { key: 'workspace', label: '根目录', path: '/repo' },
          { key: 'genieBase', label: 'Genie 基础资源', path: '/repo/models/GenieData' },
          { key: 'downloadLogs', label: '下载日志', path: '/repo/logs/downloads' },
        ],
        resources: {
          'genie-base': {
            key: 'genie-base',
            label: 'GenieData 基础资源',
            status: 'missing',
            path: '/repo/models/GenieData',
            missingPaths: ['speaker_encoder.onnx'],
          },
        },
        latestMessage: '运行驱动 uv，当前环境 CPU',
      })
      .mockResolvedValueOnce({
        runtimeDriver: 'uv',
        pythonPath: '/repo/.venv/bin/python',
        defaultBackend: 'genie-tts',
        environment: {
          mode: 'cpu',
          torchAvailable: true,
          torchVersion: '2.6.0+cpu',
          cudaAvailable: false,
          issues: [],
        },
        availableBackends: ['genie-tts'],
        managedPaths: [
          { key: 'workspace', label: '根目录', path: '/repo' },
          { key: 'genieBase', label: 'Genie 基础资源', path: '/repo/models/GenieData' },
          { key: 'downloadLogs', label: '下载日志', path: '/repo/logs/downloads' },
        ],
        resources: {
          'genie-base': {
            key: 'genie-base',
            label: 'GenieData 基础资源',
            status: 'ready',
            path: '/repo/models/GenieData',
            missingPaths: [],
          },
        },
        latestMessage: '运行驱动 uv，当前环境 CPU',
      });

    render(<App />);
    await user.click(screen.getByRole('button', { name: '模型管理' }));
    await waitFor(() => expect(screen.getByText('未下载')).toBeInTheDocument());

    const mockedBridge = runtimeBridge as typeof runtimeBridge & {
      __emitRuntimeEvent: (event: RuntimeEvent) => void;
    };

    await act(async () => {
      mockedBridge.__emitRuntimeEvent({
        event: 'download.completed',
        taskId: 'task-1',
        target: 'genie-base',
        status: 'completed',
        message: 'GenieData 基础资源 下载完成',
        progressCurrent: 4,
        progressTotal: 4,
        progressUnit: 'stage',
        timestamp: '1712300002',
      });
    });

    await waitFor(() => expect(screen.getByText('已就绪')).toBeInTheDocument());
    expect(runtimeBridge.inspectRuntime).toHaveBeenCalledTimes(2);
  });

  it('blocks runtime inspection and download actions until environment probe is ready', async () => {
    const user = userEvent.setup();
    vi.mocked(runtimeBridge.probeEnvironment).mockResolvedValue({
      workspaceRoot: '/repo',
      repoRoot: '/repo',
      status: 'torch-unavailable',
      mode: null,
      torchAvailable: false,
      torchVersion: null,
      cudaAvailable: false,
      issues: ['No module named torch'],
      message: 'torch 不可用',
    });

    render(<App />);

    await user.click(screen.getByRole('button', { name: '模型管理' }));
    const downloadBtns = await screen.findAllByRole('button', { name: '下载' });
    for (const btn of downloadBtns) {
      expect(btn).toBeDisabled();
    }
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
