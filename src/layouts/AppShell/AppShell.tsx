import { useEffect, useRef, useState } from 'react';
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
  startAuthLogin,
  cancelAuthLogin,
  chooseWorkspaceRoot,
  cancelTask,
  enqueueDownload,
  exportConsoleLogs,
  inspectRuntime,
  listDownloadTasks,
  listManagedFolders,
  openManagedPath,
  openTaskSaveDir,
  parseTarget,
  pickFfmpegPath,
  pickPythonPath,
  probeEnvironment,
  logoutAuth,
  setRuntimeDriver as setRuntimeDriverApi,
  subscribeRuntimeEvents,
  useRepoWorkspaceRoot,
} from '../../services/runtime/bridge';
import {
  applyRuntimeEvent,
  applyParseRuntimeEvent,
  buildFolderItemsFromPaths,
  collectParseItems,
  createConsoleLogFromRuntimeEvent,
  DEFAULT_DOWNLOAD_OPTIONS,
  getQueueSummary,
  isAuthRuntimeEvent,
  isParseRuntimeEvent,
  isEnvironmentReady,
  type DownloadOptions,
  type EnvironmentProbe,
  type ManagedFolderItem,
  type QualityOption,
  type RuntimeDriver,
  type RuntimeInspection,
  type RuntimeTaskRecord,
  type VideoParseGroup,
  type VideoParseItem,
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

function normalizeParseGroups(groups: VideoParseGroup[]): VideoParseGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      dir: item.dir || group.dir,
    })),
  }));
}

export function AppShell() {
  const [activePage, setActivePage] = useState<PageId>('home');
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredTheme() ?? 'night');
  const [environmentProbe, setEnvironmentProbe] = useState<EnvironmentProbe | null>(null);
  const [inspection, setInspection] = useState<RuntimeInspection | null>(null);
  const [tasks, setTasks] = useState<RuntimeTaskRecord[]>([]);
  const [folders, setFolders] = useState<ManagedFolderItem[]>([]);
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [wrapLines, setWrapLines] = useState(true);
  const [runtimeDriver, setRuntimeDriver] = useState<RuntimeDriver>('uv');
  const [pythonExePath, setPythonExePath] = useState('');
  const [ffmpegMode, setFfmpegMode] = useState<'system' | 'local'>('system');
  const [ffmpegExePath, setFfmpegExePath] = useState('');
  const [noProxy, setNoProxy] = useState(false);
  const [parseItems, setParseItems] = useState<VideoParseItem[]>([]);
  const [parseGroups, setParseGroups] = useState<VideoParseGroup[]>([]);
  const [parseSelected, setParseSelected] = useState<Set<number>>(new Set());
  const [downloadUrl, setDownloadUrl] = useState('');
  const [parseDirOverride, setParseDirOverride] = useState('');
  const [parseVideoQualities, setParseVideoQualities] = useState<QualityOption[]>([]);
  const [downloadOptions, setDownloadOptions] = useState<DownloadOptions>(DEFAULT_DOWNLOAD_OPTIONS);
  const [authBusy, setAuthBusy] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authDialogStatus, setAuthDialogStatus] = useState('');
  const [authDialogQrDataUrl, setAuthDialogQrDataUrl] = useState('');
  const parsingTargetRef = useRef<string | null>(null);

  async function refreshEnvironmentStatus() {
    try {
      const nextProbe = await probeEnvironment();
      setEnvironmentProbe(nextProbe);
      if (!isEnvironmentReady(nextProbe)) {
        setInspection(null);
        return;
      }
      const [nextInspection, paths] = await Promise.all([
        inspectRuntime(),
        listManagedFolders(),
      ]);
      setInspection(nextInspection);
      setRuntimeDriver(nextInspection.runtimeDriver);
      setPythonExePath(nextInspection.pythonPath ?? '');
      setFolders(buildFolderItemsFromPaths(paths));
      if (nextInspection.ffmpegPath && nextInspection.ffmpegPath !== 'ffmpeg') {
        setFfmpegMode('local');
        setFfmpegExePath(nextInspection.ffmpegPath);
      } else {
        setFfmpegMode('system');
        setFfmpegExePath('');
      }
      setNoProxy(nextInspection.noProxy ?? false);
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `刷新环境状态失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  useEffect(() => {
    writeStoredTheme(theme);
  }, [theme]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};

    async function refreshInspectionSnapshot() {
      try {
        const [nextInspection, paths] = await Promise.all([
          inspectRuntime(),
          listManagedFolders(),
        ]);
        if (disposed) {
          return;
        }
        setInspection(nextInspection);
        setRuntimeDriver(nextInspection.runtimeDriver);
        setPythonExePath(nextInspection.pythonPath ?? '');
        setFolders(buildFolderItemsFromPaths(paths));
        if (nextInspection.ffmpegPath && nextInspection.ffmpegPath !== 'ffmpeg') {
          setFfmpegMode('local');
          setFfmpegExePath(nextInspection.ffmpegPath);
        } else {
          setFfmpegMode('system');
          setFfmpegExePath('');
        }
        setNoProxy(nextInspection.noProxy ?? false);
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
        if (isAuthRuntimeEvent(event)) {
          if (event.event === 'auth.login.started') {
            setAuthBusy(true);
            setAuthDialogOpen(true);
            setAuthDialogStatus(event.message);
            setAuthDialogQrDataUrl('');
          } else if (event.event === 'auth.login.qr') {
            setAuthBusy(true);
            setAuthDialogOpen(true);
            setAuthDialogStatus(event.message);
            setAuthDialogQrDataUrl(event.authQrDataUrl ?? '');
          } else if (event.event.startsWith('auth.login.')) {
            setAuthDialogStatus(event.message);
            if (event.authQrDataUrl) {
              setAuthDialogQrDataUrl(event.authQrDataUrl);
            }
            if (event.event === 'auth.login.completed') {
              setAuthBusy(false);
              setAuthDialogOpen(false);
              setAuthDialogQrDataUrl('');
              void refreshEnvironmentStatus();
            } else if (
              event.event === 'auth.login.failed'
              || event.event === 'auth.login.cancelled'
            ) {
              setAuthBusy(false);
              if (event.event === 'auth.login.cancelled') {
                setAuthDialogOpen(false);
                setAuthDialogQrDataUrl('');
              }
            }
          } else if (event.event === 'auth.logout.completed') {
            setAuthBusy(false);
            void refreshEnvironmentStatus();
          }

          setLogs((current) => [...current, createConsoleLogFromRuntimeEvent(event)]);
          return;
        }

        if (isParseRuntimeEvent(event)) {
          if (parsingTargetRef.current && event.target === parsingTargetRef.current) {
            setParseItems((current) => applyParseRuntimeEvent(current, event));

            if (event.event === 'parse.started') {
              setParseSelected(new Set());
              setParseGroups([]);
              setParseDirOverride('');
              setParseVideoQualities([]);
            } else if (event.event === 'parse.item' && event.parseItem) {
              setParseSelected((current) => {
                const next = new Set(current);
                next.add(event.parseItem!.index);
                return next;
              });
            }
          }

          setLogs((current) => [...current, createConsoleLogFromRuntimeEvent(event)]);
          return;
        }

        if (event.event === 'download.completed' || event.event === 'download.failed') {
          void refreshInspectionSnapshot();
        }
        setTasks((current) => applyRuntimeEvent(current, event));
        setLogs((current) => [...current, createConsoleLogFromRuntimeEvent(event)]);
      },
      (line) => {
        if (line.includes('\r')) {
          // Progress-style line: keep only the last segment after \r (in-place overwrite)
          const visible = line.split('\r').filter((s) => s.trim()).pop() ?? line;
          setLogs((current) => {
            const last = current[current.length - 1];
            if (last?.kind === 'progress') {
              return [...current.slice(0, -1), createConsoleLog('progress', visible)];
            }
            return [...current, createConsoleLog('progress', visible)];
          });
        } else {
          setLogs((current) => [...current, createConsoleLog('stdout', line)]);
        }
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

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  async function handleDownloadBilibili(url: string, label?: string, itemDir?: string) {
    if (!isEnvironmentReady(environmentProbe)) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', '环境未就绪，已禁止执行下载'),
      ]);
      return;
    }

    try {
      const task = await enqueueDownload(url, downloadOptions, label, itemDir || parseDirOverride || undefined);
      setTasks((current) => {
        const next = current.filter((item) => item.taskId !== task.taskId);
        next.push(task);
        return next;
      });
      setLogs((current) => [
        ...current,
        createConsoleLog('system', `下载任务已添加: ${task.label}`),
      ]);
      setActivePage('models');
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `创建下载任务失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  async function handleParseTarget(url: string): Promise<VideoParseItem[]> {
    if (!isEnvironmentReady(environmentProbe)) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', '环境未就绪，已禁止执行解析'),
      ]);
      return [];
    }
    try {
      parsingTargetRef.current = url;
      const result = await parseTarget(url);
      const nextGroups = normalizeParseGroups(result.groups ?? []);
      const nextItems = collectParseItems(result.items, nextGroups);
      setParseItems(result.items);
      setParseGroups(nextGroups);
      setParseSelected(new Set(nextItems.map((item) => item.index)));
      setParseDirOverride(result.dir ?? '');
      setParseVideoQualities(result.videoQualities);
      if (result.videoQualities.length > 0) {
        setDownloadOptions((prev) => ({ ...prev, videoQuality: result.videoQualities[0].code }));
      }
      return result.items;
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `解析失败: ${toErrorMessage(error)}`),
      ]);
      return [];
    } finally {
      if (parsingTargetRef.current === url) {
        parsingTargetRef.current = null;
      }
    }
  }

  function handleClearParseItems() {
    setParseItems([]);
    setParseGroups([]);
    setParseSelected(new Set());
    setParseDirOverride('');
    setParseVideoQualities([]);
    setDownloadOptions(DEFAULT_DOWNLOAD_OPTIONS);
  }

  async function handleWorkspaceProbe(nextProbe: EnvironmentProbe) {
    setEnvironmentProbe(nextProbe);
    setInspection(null);
    setFolders([]);
    setTasks([]);

    if (!isEnvironmentReady(nextProbe)) {
      return;
    }

    const [nextInspection, paths] = await Promise.all([
      inspectRuntime(),
      listManagedFolders(),
    ]);
    setInspection(nextInspection);
    setRuntimeDriver(nextInspection.runtimeDriver);
    setPythonExePath(nextInspection.pythonPath ?? '');
    setFolders(buildFolderItemsFromPaths(paths));
    if (nextInspection.ffmpegPath && nextInspection.ffmpegPath !== 'ffmpeg') {
      setFfmpegMode('local');
      setFfmpegExePath(nextInspection.ffmpegPath);
    } else {
      setFfmpegMode('system');
      setFfmpegExePath('');
    }
    setNoProxy(nextInspection.noProxy ?? false);
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

  async function handleOpenFolder(relativePath?: string) {
    try {
      await openTaskSaveDir(relativePath ?? '');
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `打开目录失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  async function handleStartAuthLogin() {
    setAuthDialogOpen(true);
    setAuthBusy(true);
    setAuthDialogStatus('正在生成二维码…');
    setAuthDialogQrDataUrl('');
    try {
      await startAuthLogin();
    } catch (error) {
      setAuthBusy(false);
      setAuthDialogStatus(toErrorMessage(error));
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `启动登录失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  async function handleLogoutAuth() {
    setAuthBusy(true);
    try {
      const message = await logoutAuth();
      setLogs((current) => [...current, createConsoleLog('system', message)]);
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `退出登录失败: ${toErrorMessage(error)}`),
      ]);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleCloseAuthDialog() {
    setAuthDialogOpen(false);
    if (!authBusy) {
      return;
    }

    try {
      await cancelAuthLogin();
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `取消登录失败: ${toErrorMessage(error)}`),
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

  async function handleChooseFfmpegExe(): Promise<string | null> {
    try {
      return await pickFfmpegPath();
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `选择 FFmpeg 路径失败: ${toErrorMessage(error)}`),
      ]);
      return null;
    }
  }

  async function handleSaveSettings(
    driver: RuntimeDriver,
    exePath: string,
    nextFfmpegMode: 'system' | 'local',
    nextFfmpegExePath: string,
    nextNoProxy: boolean,
  ) {
    const ffmpegPath = nextFfmpegMode === 'local' ? nextFfmpegExePath : null;
    try {
      const nextProbe = await setRuntimeDriverApi(driver, exePath || null, ffmpegPath, nextNoProxy);
      setRuntimeDriver(driver);
      setPythonExePath(exePath);
      setFfmpegMode(nextFfmpegMode);
      setFfmpegExePath(nextFfmpegExePath);
      setNoProxy(nextNoProxy);
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

  function handleClearLogs() {
    setLogs([]);
  }

  async function handleCancelTask(taskId: string) {
    try {
      await cancelTask(taskId);
    } catch (error) {
      setLogs((current) => [
        ...current,
        createConsoleLog('stderr', `取消任务失败: ${toErrorMessage(error)}`),
      ]);
    }
  }

  const latestMessage = environmentProbe?.message ?? '正在读取运行时信息';
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
              folders,
              logs,
              autoScroll,
              wrapLines,
              latestMessage,
              onOpenModels: () => setActivePage('models'),
              onDownload: handleDownloadBilibili,
              onParse: handleParseTarget,
              parseItems,
              parseGroups,
              parseSelected,
              onParseSelectedChange: setParseSelected,
              onClearParseItems: handleClearParseItems,
              downloadUrl,
              onDownloadUrlChange: setDownloadUrl,
              parseVideoQualities,
              downloadOptions,
              onDownloadOptionsChange: setDownloadOptions,
              onCancelTask: handleCancelTask,
              onOpenDownloadsFolder: handleOpenFolder,
              onOpenPath: handleOpenManagedPath,
              runtimeDriver,
              scriptsReady,
              workspaceLocked,
              workspaceRoot:
                environmentProbe?.workspaceRoot ?? '',
              environmentProbe,
              onChooseWorkspaceRoot: handleChooseWorkspaceRoot,
              onUseRepoWorkspaceRoot: handleUseRepoWorkspaceRoot,
              pythonExePath,
              onChoosePythonExe: handleChoosePythonExe,
              ffmpegMode,
              ffmpegExePath,
              onChooseFfmpegExe: handleChooseFfmpegExe,
              noProxy,
              authBusy,
              authDialogOpen,
              authDialogStatus,
              authDialogQrDataUrl,
              onStartAuthLogin: handleStartAuthLogin,
              onLogoutAuth: handleLogoutAuth,
              onCloseAuthDialog: handleCloseAuthDialog,
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
