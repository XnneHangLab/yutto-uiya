import { useEffect, useRef, useState } from 'react';
import { SettingCard } from '../../components/settings/SettingCard/SettingCard';
import { SettingRow } from '../../components/settings/SettingRow/SettingRow';
import { SettingsTabs } from '../../components/settings/SettingsTabs/SettingsTabs';
import {
  aboutInfo,
  type SettingsTabId,
  settingsTabs,
} from '../../data/settings';
import { pauseHotkey } from '../../services/runtime/bridge';
import type {
  EnvironmentProbe,
  RuntimeDriver,
  ServeStatus,
} from '../../services/runtime/runtime';
import '../../styles/settings.css';

interface SettingsPageProps {
  workspaceRoot: string;
  workspaceLocked: boolean;
  /** 有解析或下载在跑：保存会重启 serve 并把它们切断，提示但不拦截。 */
  jobsActive?: boolean;
  environmentProbe: EnvironmentProbe | null;
  bundledRuntime?: boolean;
  onChooseWorkspaceRoot: () => void;
  onUseRepoWorkspaceRoot: () => void;
  runtimeDriver: RuntimeDriver;
  pythonExePath: string;
  onChoosePythonExe: () => Promise<string | null>;
  ffmpegMode: 'system' | 'local';
  ffmpegExePath: string;
  onChooseFfmpegExe: () => Promise<string | null>;
  onDetectFfmpeg: () => Promise<string[]>;
  noProxy: boolean;
  fetchWorkers: number;
  downloadDir: string;
  onChooseDownloadDir: () => Promise<string | null>;
  authBusy: boolean;
  authDialogOpen: boolean;
  authDialogStatus: string;
  authDialogQrDataUrl: string;
  onStartAuthLogin: () => void;
  onLogoutAuth: () => void;
  onCloseAuthDialog: () => void;
  onSave: (
    driver: RuntimeDriver,
    pythonExePath: string,
    ffmpegMode: 'system' | 'local',
    ffmpegExePath: string,
    noProxy: boolean,
    downloadDir: string,
    fetchWorkers: number,
  ) => void;
  onUvSync: () => Promise<void>;
  serveStatus: ServeStatus | null;
  serveBusy: boolean;
  onServeReload: () => Promise<void>;
  hotkey: string;
  onSetHotkey: (shortcut: string) => Promise<void>;
}

export function SettingsPage({
  workspaceRoot,
  workspaceLocked,
  jobsActive = false,
  environmentProbe,
  bundledRuntime = false,
  onChooseWorkspaceRoot,
  onUseRepoWorkspaceRoot,
  runtimeDriver,
  pythonExePath,
  onChoosePythonExe,
  ffmpegMode,
  ffmpegExePath,
  onChooseFfmpegExe,
  onDetectFfmpeg,
  noProxy,
  fetchWorkers,
  downloadDir,
  onChooseDownloadDir,
  authBusy,
  authDialogOpen,
  authDialogStatus,
  authDialogQrDataUrl,
  onStartAuthLogin,
  onLogoutAuth,
  onCloseAuthDialog,
  onSave,
  onUvSync,
  serveStatus,
  serveBusy,
  onServeReload,
  hotkey,
  onSetHotkey,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [localDriver, setLocalDriver] = useState<RuntimeDriver>(runtimeDriver);
  const [localPythonExePath, setLocalPythonExePath] = useState(pythonExePath);
  const [localFfmpegMode, setLocalFfmpegMode] = useState<'system' | 'local'>(
    ffmpegMode,
  );
  const [localFfmpegExePath, setLocalFfmpegExePath] = useState(ffmpegExePath);
  const [localNoProxy, setLocalNoProxy] = useState(noProxy);
  const [localFetchWorkers, setLocalFetchWorkers] = useState(fetchWorkers);
  const [localDownloadDir, setLocalDownloadDir] = useState(downloadDir);
  const [syncing, setSyncing] = useState(false);

  // Hotkey recording state
  const [recording, setRecording] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalDriver(runtimeDriver);
    setLocalPythonExePath(pythonExePath);
    setLocalFfmpegMode(ffmpegMode);
    setLocalFfmpegExePath(ffmpegExePath);
    setLocalNoProxy(noProxy);
    setLocalFetchWorkers(fetchWorkers);
    setLocalDownloadDir(downloadDir);
  }, [
    runtimeDriver,
    pythonExePath,
    ffmpegMode,
    ffmpegExePath,
    noProxy,
    fetchWorkers,
    downloadDir,
  ]);

  const environmentLabel = environmentProbe
    ? formatEnvironmentStatus(environmentProbe.status)
    : '正在检测';

  const envReady = environmentProbe?.status === 'ready';
  const authLabel = environmentProbe
    ? formatAuthStatus(environmentProbe.authState)
    : '正在检测';
  const authReady = environmentProbe?.authState === 'authenticated';
  const showLoginAction = environmentProbe?.authState !== 'authenticated';

  const driverDisplayLabel =
    localDriver === 'conda' ? 'conda / 直接 Python' : 'uv';

  const serveState = serveStatus?.status ?? 'stopped';
  const serveLabel =
    serveState === 'running'
      ? '运行中'
      : serveState === 'starting'
        ? '启动中…'
        : serveState === 'crashed'
          ? serveStatus?.exitCode != null
            ? `已崩溃（退出码 ${serveStatus.exitCode}）`
            : '已崩溃'
          : '未启动';
  const serveBadgeClass =
    serveState === 'running'
      ? 'env-info-badge--ready'
      : serveState === 'crashed'
        ? 'env-info-badge--warn'
        : '';

  async function handleBrowsePythonExe() {
    const picked = await onChoosePythonExe();
    if (picked) {
      setLocalPythonExePath(picked);
    }
  }

  async function handleUvSync() {
    setSyncing(true);
    try {
      await onUvSync();
    } finally {
      setSyncing(false);
    }
  }

  async function handleBrowseFfmpegExe() {
    const picked = await onChooseFfmpegExe();
    if (picked) {
      setLocalFfmpegExePath(picked);
      setLocalFfmpegMode('local');
    }
  }

  const [detectStatus, setDetectStatus] = useState<string | null>(null);

  async function handleDetectFfmpeg() {
    setDetectStatus(null);
    const results = await onDetectFfmpeg();
    if (results.length > 0) {
      setLocalFfmpegExePath(results[0]);
      setLocalFfmpegMode('local');
      setDetectStatus('已找到');
    } else {
      setDetectStatus('未找到，请手动浏览选择');
    }
  }

  async function handleBrowseDownloadDir() {
    const picked = await onChooseDownloadDir();
    if (picked) {
      setLocalDownloadDir(picked);
    }
  }

  function formatHotkeyDisplay(h: string) {
    return h.replace(/Key([A-Z])/g, '$1').replace(/Digit(\d)/g, '$1');
  }

  function handleStartRecording() {
    setRecording(true);
    setCaptureError(null);
    // Pause the active shortcut so the window doesn't hide during capture
    void pauseHotkey().catch(() => {});
    setTimeout(() => captureRef.current?.focus(), 0);
  }

  function handleCaptureKeyDown(e: React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    if (e.key === 'Escape') {
      setRecording(false);
      // Re-register the old shortcut
      void onSetHotkey(hotkey).catch(() => {});
      return;
    }
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    if (e.metaKey) parts.push('Meta');
    if (parts.length === 0) return; // need at least one modifier key
    parts.push(e.code);
    const shortcut = parts.join('+');
    setRecording(false);
    void onSetHotkey(shortcut).catch((err) => setCaptureError(String(err)));
  }

  return (
    <div className="settings-shell">
      <SettingsTabs
        items={settingsTabs}
        activeTab={activeTab}
        onSelect={setActiveTab}
      />

      <div className="settings-wrap">
        {activeTab === 'general' ? (
          <div
            id="settings-panel-general"
            role="tabpanel"
            aria-labelledby="settings-tab-general"
          >
            <div className="group-title group-title--standalone">运行环境</div>

            <div className="env-info-card">
              <div className="env-info-row">
                <span className="env-info-label">环境状态</span>
                <span
                  className={`env-info-badge ${envReady ? 'env-info-badge--ready' : 'env-info-badge--warn'}`}
                >
                  {environmentLabel}
                </span>
              </div>
              {environmentProbe?.platform ? (
                <div className="env-info-row">
                  <span className="env-info-label">平台</span>
                  <span className="env-info-badge">
                    {environmentProbe.platform}
                  </span>
                </div>
              ) : null}
              {environmentProbe?.issues &&
              environmentProbe.issues.length > 0 ? (
                <div className="env-info-row env-info-row--issues">
                  <span className="env-info-label">诊断</span>
                  <ul className="env-issues-list">
                    {environmentProbe.issues.map((issue, idx) => (
                      <li key={idx} className="env-issue">
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="env-info-row">
                <span className="env-info-label">运行驱动</span>
                <span className="env-info-value env-info-mono">
                  {driverDisplayLabel}
                </span>
              </div>
              {environmentProbe ? (
                <div className="env-info-row">
                  <span className="env-info-label">认证状态</span>
                  <span
                    className={`env-info-badge ${authReady ? 'env-info-badge--ready' : 'env-info-badge--warn'}`}
                  >
                    {authLabel}
                  </span>
                </div>
              ) : null}
              {environmentProbe?.authMessage ? (
                <div className="env-info-row">
                  <span className="env-info-label">认证详情</span>
                  <span className="env-info-value">
                    {environmentProbe.authMessage}
                  </span>
                </div>
              ) : null}
              {environmentProbe?.authSource ? (
                <div className="env-info-row">
                  <span className="env-info-label">认证来源</span>
                  <span className="env-info-value env-info-mono">
                    {environmentProbe.authSource}
                  </span>
                </div>
              ) : null}
              {environmentProbe ? (
                <div className="env-info-row">
                  <span className="env-info-label">认证操作</span>
                  <div className="workspace-actions">
                    {showLoginAction ? (
                      <button
                        type="button"
                        className="workspace-button"
                        onClick={onStartAuthLogin}
                        disabled={authBusy}
                      >
                        登录
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="workspace-button workspace-button--secondary"
                        onClick={onLogoutAuth}
                        disabled={authBusy}
                      >
                        退出登录
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
              {!bundledRuntime && localDriver === 'uv' ? (
                <div className="env-info-row">
                  <span className="env-info-label">依赖同步</span>
                  <div className="workspace-actions">
                    <button
                      type="button"
                      className="workspace-button"
                      onClick={() => {
                        void handleUvSync();
                      }}
                      disabled={
                        syncing || environmentProbe?.status === 'uv-unavailable'
                      }
                      title={
                        environmentProbe?.status === 'uv-unavailable'
                          ? '请先安装 uv'
                          : undefined
                      }
                    >
                      {syncing ? '同步中…' : 'uv sync'}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="env-info-row">
                <span className="env-info-label">yutto server</span>
                <span
                  className={`env-info-badge ${serveBadgeClass}`}
                  title={serveStatus?.message ?? undefined}
                >
                  {serveLabel}
                </span>
                {serveState === 'running' && serveStatus?.url ? (
                  <span className="env-info-value env-info-mono">
                    {serveStatus.url}
                  </span>
                ) : null}
                <div className="workspace-actions">
                  <button
                    type="button"
                    className="workspace-button"
                    onClick={() => {
                      void onServeReload();
                    }}
                    disabled={serveBusy || !envReady}
                    title={envReady ? undefined : '环境未就绪'}
                  >
                    {serveBusy ? '重启中…' : '重启'}
                  </button>
                </div>
              </div>
            </div>

            <div className="group-title">环境配置</div>

            <SettingCard>
              <SettingRow
                name="根目录"
                description={
                  workspaceLocked
                    ? '有任务进行中，暂时锁定'
                    : '其他目录均相对于该目录'
                }
                icon="📂"
              >
                <div className="workspace-actions">
                  <input
                    className="proxy-input workspace-input"
                    aria-label="工作目录路径"
                    value={workspaceRoot}
                    disabled
                    readOnly
                  />
                  <button
                    type="button"
                    className="workspace-button"
                    onClick={onChooseWorkspaceRoot}
                    disabled={workspaceLocked}
                  >
                    更改目录
                  </button>
                  <button
                    type="button"
                    className="workspace-button workspace-button--secondary"
                    onClick={onUseRepoWorkspaceRoot}
                    disabled={workspaceLocked}
                  >
                    重置为应用目录
                  </button>
                </div>
              </SettingRow>

              <SettingRow
                name="下载目录"
                description="视频文件保存位置，支持绝对路径或相对于根目录的路径"
                icon="📥"
              >
                <div className="workspace-actions">
                  <input
                    className="proxy-input workspace-input"
                    aria-label="下载目录路径"
                    value={localDownloadDir}
                    onChange={(event) =>
                      setLocalDownloadDir(event.target.value)
                    }
                    placeholder="./downloads"
                  />
                  <button
                    type="button"
                    className="workspace-button"
                    onClick={handleBrowseDownloadDir}
                  >
                    浏览
                  </button>
                </div>
              </SettingRow>

              {bundledRuntime ? (
                <SettingRow
                  name="Python 运行环境"
                  description="正式版固定使用随应用提供的 Python 环境"
                  icon="🐍"
                >
                  <span className="env-info-value env-info-mono">
                    {pythonExePath || '内置 Python'}
                  </span>
                </SettingRow>
              ) : (
                <SettingRow
                  name="Python 运行方式"
                  description="uv 为推荐方式；conda 可指定自有环境"
                  icon="🐍"
                >
                  <div className="driver-select-wrap">
                    <button
                      type="button"
                      className={`driver-option ${localDriver === 'uv' ? 'driver-option--active' : ''}`}
                      onClick={() => setLocalDriver('uv')}
                    >
                      uv
                    </button>
                    <button
                      type="button"
                      className={`driver-option ${localDriver === 'conda' ? 'driver-option--active' : ''}`}
                      onClick={() => setLocalDriver('conda')}
                    >
                      conda
                    </button>
                  </div>
                </SettingRow>
              )}

              {!bundledRuntime && localDriver === 'conda' ? (
                <SettingRow
                  name="Python 可执行文件"
                  description="指定 conda 环境中的 python 或 python.exe 路径"
                  icon="🐍"
                >
                  <div className="workspace-actions">
                    <input
                      className="proxy-input workspace-input"
                      aria-label="Python 可执行文件路径"
                      value={localPythonExePath}
                      onChange={(event) =>
                        setLocalPythonExePath(event.target.value)
                      }
                      placeholder="例：/home/user/miniconda3/envs/tts/bin/python"
                    />
                    <button
                      type="button"
                      className="workspace-button"
                      onClick={handleBrowsePythonExe}
                    >
                      浏览
                    </button>
                  </div>
                </SettingRow>
              ) : null}

              <SettingRow
                name="FFmpeg 来源"
                description="system 使用环境变量中的 ffmpeg；local 指定可执行文件路径"
                icon="🎬"
              >
                <div className="driver-select-wrap">
                  <button
                    type="button"
                    className={`driver-option ${localFfmpegMode === 'system' ? 'driver-option--active' : ''}`}
                    onClick={() => setLocalFfmpegMode('system')}
                  >
                    系统 ffmpeg
                  </button>
                  <button
                    type="button"
                    className={`driver-option ${localFfmpegMode === 'local' ? 'driver-option--active' : ''}`}
                    onClick={() => setLocalFfmpegMode('local')}
                  >
                    本地 ffmpeg
                  </button>
                </div>
              </SettingRow>

              {localFfmpegMode === 'local' ? (
                <SettingRow
                  name="FFmpeg 可执行文件"
                  description="指定 ffmpeg 或 ffmpeg.exe 的完整路径"
                  icon="🎬"
                >
                  <div className="workspace-actions">
                    <input
                      className="proxy-input workspace-input"
                      aria-label="FFmpeg 可执行文件路径"
                      value={localFfmpegExePath}
                      onChange={(event) =>
                        setLocalFfmpegExePath(event.target.value)
                      }
                      placeholder="例：C:\tools\ffmpeg\bin\ffmpeg.exe"
                    />
                    <button
                      type="button"
                      className="workspace-button"
                      onClick={handleDetectFfmpeg}
                    >
                      自动检测
                    </button>
                    <button
                      type="button"
                      className="workspace-button"
                      onClick={handleBrowseFfmpegExe}
                    >
                      浏览
                    </button>
                  </div>
                  {detectStatus ? (
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: 12,
                        color: detectStatus.startsWith('未')
                          ? '#ff9b9b'
                          : 'var(--accent)',
                      }}
                    >
                      {detectStatus}
                    </p>
                  ) : null}
                </SettingRow>
              ) : null}

              <SettingRow
                name="禁用代理"
                description="勾选后忽略系统代理；取消勾选时若代理未运行或配置残留，解析、下载和封面可能失败"
                icon="🌐"
              >
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    className="toggle-checkbox"
                    checked={localNoProxy}
                    onChange={(e) => setLocalNoProxy(e.target.checked)}
                  />
                  <span className="toggle-text">
                    {localNoProxy ? '已禁用' : '自动'}
                  </span>
                </label>
              </SettingRow>

              <SettingRow
                name="解析并发数"
                description="批量解析视频列表时同时进行的数量，数值越大解析越快，默认 8"
                icon="⚡"
              >
                <div className="workspace-actions">
                  <input
                    type="number"
                    className="proxy-input workspace-input"
                    aria-label="解析并发数"
                    value={localFetchWorkers}
                    min={1}
                    max={32}
                    onChange={(e) => {
                      const next = Number.parseInt(e.target.value, 10);
                      setLocalFetchWorkers(
                        Number.isNaN(next)
                          ? 8
                          : Math.max(1, Math.min(32, next)),
                      );
                    }}
                  />
                </div>
              </SettingRow>
            </SettingCard>

            <div className="group-title">快捷键</div>

            <SettingCard>
              <SettingRow
                name="全局呼出快捷键"
                description="按下快捷键切换窗口显隐，默认 Ctrl+Shift+Space"
                icon="⌨️"
              >
                <div className="workspace-actions">
                  <span
                    className="proxy-input workspace-input"
                    style={{ userSelect: 'none', cursor: 'default' }}
                  >
                    {formatHotkeyDisplay(hotkey)}
                  </span>
                  {recording ? (
                    <div
                      ref={captureRef}
                      tabIndex={0}
                      className="workspace-button"
                      style={{
                        outline: 'none',
                        minWidth: 96,
                        textAlign: 'center',
                      }}
                      onKeyDown={handleCaptureKeyDown}
                      onBlur={() => {
                        setRecording(false);
                      }}
                    >
                      录制中…
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="workspace-button"
                      onClick={handleStartRecording}
                    >
                      录制快捷键
                    </button>
                  )}
                </div>
                {captureError ? (
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: 12,
                      color: '#ff9b9b',
                    }}
                  >
                    {captureError}
                  </p>
                ) : null}
              </SettingRow>
            </SettingCard>

            <div className="settings-save-row">
              {jobsActive ? (
                <span className="settings-save-warn" role="status">
                  正在解析/下载，保存会重启 serve 并中断当前任务
                </span>
              ) : null}
              <button
                type="button"
                className="settings-save-button"
                onClick={() =>
                  onSave(
                    localDriver,
                    localPythonExePath,
                    localFfmpegMode,
                    localFfmpegExePath,
                    localNoProxy,
                    localDownloadDir,
                    localFetchWorkers,
                  )
                }
              >
                保存并重新检测
              </button>
            </div>

            <div className="footer-space" />
          </div>
        ) : (
          <div
            id="settings-panel-about"
            role="tabpanel"
            aria-labelledby="settings-tab-about"
          >
            <div className="about-card">
              {aboutInfo.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {authDialogOpen ? (
        <div
          className="settings-auth-modal"
          role="dialog"
          aria-modal="true"
          aria-label="扫码登录"
        >
          <div className="settings-auth-modal__panel">
            <div className="settings-auth-modal__title">扫码登录</div>
            <div className="settings-auth-modal__body">
              {authDialogQrDataUrl ? (
                <div className="settings-auth-modal__qr-shell">
                  <img
                    className="settings-auth-modal__qr"
                    src={authDialogQrDataUrl}
                    alt="登录二维码"
                  />
                </div>
              ) : (
                <div className="settings-auth-modal__placeholder">
                  正在生成二维码…
                </div>
              )}
              <p className="settings-auth-modal__status">
                {authDialogStatus || '正在生成二维码…'}
              </p>
            </div>
            <div className="settings-auth-modal__actions">
              <button
                type="button"
                className="workspace-button workspace-button--secondary"
                onClick={onCloseAuthDialog}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatEnvironmentStatus(status: EnvironmentProbe['status']) {
  switch (status) {
    case 'workspace-invalid':
      return '工作目录无效';
    case 'uv-unavailable':
      return 'uv 不可用';
    case 'python-unavailable':
      return 'Python 不可用';
    case 'yutto-unavailable':
      return 'uiya 不可用';
    case 'ffmpeg-unavailable':
      return 'FFmpeg 不可用';
    case 'ready':
      return '就绪';
    default:
      return status;
  }
}

function formatAuthStatus(status: EnvironmentProbe['authState']) {
  switch (status) {
    case 'authenticated':
      return '已登录';
    case 'missing':
      return '未登录';
    case 'invalid':
      return '认证无效';
    case 'unknown':
      return '未知';
    default:
      return status;
  }
}
