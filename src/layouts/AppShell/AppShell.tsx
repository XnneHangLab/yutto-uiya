import { useEffect, useState } from 'react';
import { Sidebar } from '../../components/navigation/Sidebar/Sidebar';
import { Topbar } from '../../components/window/Topbar/Topbar';
import { navItems, type PageId } from '../../data/nav';
import { renderPage } from '../../app/routes';
import {
  createConsoleLog,
  formatConsoleExport,
  type ConsoleLogEntry,
} from '../../services/launcher/launcher';
import {
  chooseWorkspaceRoot,
  enqueueDownload,
  exportConsoleLogs,
  inspectRuntime,
  launchWebui,
  listDownloadTasks,
  listManagedFolders,
  openManagedPath,
  pickPythonPath,
  probeEnvironment,
  setRuntimeDriver as setRuntimeDriverApi,
  subscribeRuntimeEvents,
  subscribeWebuiStatus,
  useRepoWorkspaceRoot,
} from '../../services/runtime/bridge';
import {
  applyRuntimeEvent,
  buildFolderItemsFromPaths,
  buildManagedFolderItems,
  createConsoleLogFromRuntimeEvent,
  getQueueSummary,
  isEnvironmentReady,
  type EnvironmentProbe,
  type FileProgress,
  type ManagedFolderItem,
  type RuntimeDriver,
  type RuntimeInspection,
  type RuntimeTaskRecord,
} from '../../services/runtime/runtime';
import {
  readStoredTheme,
  toggleThemeMode,
  writeStoredTheme,
  type ThemeMode,
} from '../../services/theme/theme';

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function AppShell() {
  const [activePage, setActivePage] = useState<PageId>('home');
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme() ?? 'night');
  const [environmentProbe, setEnvironmentProbe] = useState<EnvironmentProbe | null>(null);
  const [inspection, setInspection] = useState<RuntimeInspection | null>(null);
  const [tasks, setTasks] = useState<RuntimeTaskRecord[]>([]);
  const [fileProgress, setFileProgress] = useState<FileProgress | null>(null);
  const [folders, setFolders] = useState<ManagedFolderItem[]>([]);
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [wrapLines, setWrapLines] = useState(true);
  const [runtimeDriver, setRuntimeDriver] = useState<RuntimeDriver>('uv');
  const [pythonExePath, setPythonExePath] = useState('');
  const [webuiRunning, setWebuiRunning] = useState(false);

  useEffect(() => {
    writeStoredTheme(theme);
  }, [theme]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};

    async function refreshInspectionSnapshot() {
      try {
        const nextInspection = await inspectRuntime();
        if (disposed) {
          return;
        }
        setInspection(nextInspection);
        setFolders(buildManagedFolderItems(nextInspection));
      } catch (error) {
        if (disposed) {
          return;
        }
        setLogs((current) => [
          ...current,
          createConsoleLog('stderr', `刷新资源状态失败: ${toErrorMessage(error)}`),
        ]);
      }
    }

    void (async () => {
      try {
        // Populate folder cards immediately from Rust state — no Python subprocess needed
        listManagedFolders()
          .then((paths) => { if (!disposed) setFolders(buildFolderItemsFromPaths(paths)); })
          .catch(() => {});

        const [nextProbe, nextTasks] = await Promise.all([
          probeEnvironment(),
          listDownloadTasks(),
        ]);
        if (disposed) {
          return;
        }
        setEnvironmentProbe(nextProbe);
        setTasks(nextTasks);

        if (!isEnvironmentReady(nextProbe)) {
          setInspection(null);
          return;
        }

        await refreshInspectionSnapshot();
      } catch (error) {
        if (disposed) {
          return;
        }
        setLogs((current) => [
          ...current,
          createConsoleLog('stderr', `初始化运行时失败: ${toErrorMessage(error)}`),
        ]);
      }
    })();

    void subscribeRuntimeEvents(
      (event) => {
        if (event.event === 'download.file_progress') {
          setFileProgress({
            target: event.target,
            desc: event.desc ?? '',
            percent: event.percent ?? 0,
            downloaded: event.downloaded,
            total: event.total,
          });
          return;
        }
        if (event.event === 'download.completed' || event.event === 'download.failed') {
          setFileProgress(null);
          void refreshInspectionSnapshot();
        }
        setTasks((current) => applyRuntimeEvent(current, event));
        setLogs((current) => [...current, createConsoleLogFromRuntimeEvent(event)]);
      },
      (line) => {
        setLogs((current) => [...current, createConsoleLog('stdout', line)]);
      },
    )
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unsubscribe = cleanup;
      })
      .catch((error) => {
        if (disposed) {
          return;
        }
        setLogs((current) => [
          ...current,
          createConsoleLog('stderr', `订阅运行时事件失败: ${toErrorMessage(error)}`),
        ]);
      });

    let unsubscribeWebui = () => {};
    void subscribeWebuiStatus((status) => {
      if (status === 'stopped') {
        setWebuiRunning(false);
        setLogs((current) => [
          ...current,
          createConsoleLog('system', 'Gradio WebUI 进程已退出'),
        ]);
      }
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unsubscribeWebui = cleanup;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeWebui();
    };
  }, []);

  async function handleDownloadGenieBase() {
    if (!isEnvironmentReady(environmentProbe)) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', '环境未就绪，已禁止执行运行时脚本'),
      ]);
      return;
    }

    try {
      const task = await enqueueDownload('genie-base');
      setTasks((current) => {
        const next = current.filter((item) => item.taskId !== task.taskId);
        next.push(task);
        return next;
      });
      setLogs((current) => [
        ...current,
        createConsoleLog('system', `${task.label}: ${task.message}`),
      ]);
      setActivePage('models');
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `创建下载任务失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  async function handleDownloadGsvLite() {
    if (!isEnvironmentReady(environmentProbe)) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', '环境未就绪，已禁止执行运行时脚本'),
      ]);
      return;
    }

    try {
      const task = await enqueueDownload('gsv-lite');
      setTasks((current) => {
        const next = current.filter((item) => item.taskId !== task.taskId);
        next.push(task);
        return next;
      });
      setLogs((current) => [
        ...current,
        createConsoleLog('system', `${task.label}: ${task.message}`),
      ]);
      setActivePage('models');
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `创建下载任务失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  async function handleDownloadQwenTts06b() {
    if (!isEnvironmentReady(environmentProbe)) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', '环境未就绪，已禁止执行运行时脚本'),
      ]);
      return;
    }

    try {
      const task = await enqueueDownload('qwen-tts-0.6b');
      setTasks((current) => {
        const next = current.filter((item) => item.taskId !== task.taskId);
        next.push(task);
        return next;
      });
      setLogs((current) => [
        ...current,
        createConsoleLog('system', `${task.label}: ${task.message}`),
      ]);
      setActivePage('models');
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `创建下载任务失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  async function handleDownloadQwenTts17b() {
    if (!isEnvironmentReady(environmentProbe)) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', '环境未就绪，已禁止执行运行时脚本'),
      ]);
      return;
    }

    try {
      const task = await enqueueDownload('qwen-tts-1.7b');
      setTasks((current) => {
        const next = current.filter((item) => item.taskId !== task.taskId);
        next.push(task);
        return next;
      });
      setLogs((current) => [
        ...current,
        createConsoleLog('system', `${task.label}: ${task.message}`),
      ]);
      setActivePage('models');
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `创建下载任务失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  async function handleDownloadLumingGenieTts() {
    if (!isEnvironmentReady(environmentProbe)) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', '环境未就绪，已禁止执行运行时脚本'),
      ]);
      return;
    }

    try {
      const task = await enqueueDownload('luming-genie-tts-v2-pro-plus');
      setTasks((current) => {
        const next = current.filter((item) => item.taskId !== task.taskId);
        next.push(task);
        return next;
      });
      setLogs((current) => [
        ...current,
        createConsoleLog('system', `${task.label}: ${task.message}`),
      ]);
      setActivePage('models');
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `创建下载任务失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  async function handleWorkspaceProbe(nextProbe: EnvironmentProbe) {
    setEnvironmentProbe(nextProbe);
    setInspection(null);
    setFolders([]);
    setTasks([]);

    if (!isEnvironmentReady(nextProbe)) {
      return;
    }

    const nextInspection = await inspectRuntime();
    setInspection(nextInspection);
    setFolders(buildManagedFolderItems(nextInspection));
  }

  async function handleChooseWorkspaceRoot() {
    try {
      const nextProbe = await chooseWorkspaceRoot();
      if (!nextProbe) {
        return;
      }
      await handleWorkspaceProbe(nextProbe);
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `切换工作目录失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  async function handleUseRepoWorkspaceRoot() {
    try {
      const nextProbe = await useRepoWorkspaceRoot();
      await handleWorkspaceProbe(nextProbe);
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `恢复默认工作目录失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  async function handleOpenManagedPath(pathKey: string) {
    try {
      await openManagedPath(pathKey);
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `打开目录失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  async function handleChoosePythonExe(): Promise<string | null> {
    try {
      return await pickPythonPath();
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `选择 Python 路径失败: ${toErrorMessage(error)}`),
      ]);
      return null;
    }
  }

  async function handleSaveSettings(driver: RuntimeDriver, exePath: string) {
    try {
      const nextProbe = await setRuntimeDriverApi(driver, exePath || null);
      setRuntimeDriver(driver);
      setPythonExePath(exePath);
      if (nextProbe) {
        await handleWorkspaceProbe(nextProbe);
      }
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `保存设置失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  async function handleExportLogs() {
    try {
      const output = formatConsoleExport(logs);
      const path = await exportConsoleLogs(output);
      setLogs((current) => [
        ...current,
        createConsoleLog('system', `日志已导出到 ${path}`),
      ]);
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `导出日志失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  async function handleLaunchWebui() {
    if (!isEnvironmentReady(environmentProbe)) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', '环境未就绪，已禁止启动 WebUI'),
      ]);
      return;
    }

    setActivePage('console');
    setWebuiRunning(true);
    try {
      await launchWebui();
    } catch (error) {
      setWebuiRunning(false);
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `启动 WebUI 失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  function handleClearLogs() {
    setLogs([]);
  }

  const runtimeMode =
    environmentProbe?.mode ?? inspection?.environment.mode ?? 'checking';
  const latestMessage =
    inspection?.latestMessage ??
    environmentProbe?.message ??
    '正在读取运行时信息';
  const scriptsReady = isEnvironmentReady(environmentProbe);
  const workspaceLocked = getQueueSummary(tasks).queueLength > 0;

  return (
    <div className="launcher-root" data-theme={theme}>
      <div className="app-shell">
        <Sidebar
          items={navItems}
          activePage={activePage}
          onSelect={setActivePage}
          theme={theme}
          onToggleTheme={() => setTheme((current) => toggleThemeMode(current))}
        />

        <main className="content-shell">
          <Topbar />
          <section className="page-shell">
            {renderPage(activePage, {
              inspection,
              tasks,
              fileProgress,
              folders,
              logs,
              autoScroll,
              wrapLines,
              latestMessage,
              onOpenModels: () => setActivePage('models'),
              onDownloadGenieBase: handleDownloadGenieBase,
              onDownloadGsvLite: handleDownloadGsvLite,
              onDownloadQwenTts06b: handleDownloadQwenTts06b,
              onDownloadQwenTts17b: handleDownloadQwenTts17b,
              onDownloadLumingGenieTts: handleDownloadLumingGenieTts,
              onOpenPath: handleOpenManagedPath,
              onLaunchWebui: handleLaunchWebui,
              webuiRunning,
              runtimeDriver,
              runtimeMode,
              scriptsReady,
              workspaceLocked,
              workspaceRoot:
                environmentProbe?.workspaceRoot ?? inspection?.managedPaths[0]?.path ?? '',
              environmentProbe,
              onChooseWorkspaceRoot: handleChooseWorkspaceRoot,
              onUseRepoWorkspaceRoot: handleUseRepoWorkspaceRoot,
              pythonExePath,
              onChoosePythonExe: handleChoosePythonExe,
              onSave: handleSaveSettings,
              onSetAutoScroll: setAutoScroll,
              onSetWrapLines: setWrapLines,
              onClearLogs: handleClearLogs,
              onExportLogs: handleExportLogs,
            })}
          </section>
        </main>
      </div>
    </div>
  );
}
