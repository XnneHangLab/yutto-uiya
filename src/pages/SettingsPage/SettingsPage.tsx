import { useState } from 'react';
import { SettingCard } from '../../components/settings/SettingCard/SettingCard';
import { SettingRow } from '../../components/settings/SettingRow/SettingRow';
import { SettingsTabs } from '../../components/settings/SettingsTabs/SettingsTabs';
import {
  aboutInfo,
  settingsTabs,
  type SettingsTabId,
} from '../../data/settings';
import type {
  EnvironmentProbe,
  RuntimeDriver,
} from '../../services/runtime/runtime';
import '../../styles/settings.css';

interface SettingsPageProps {
  workspaceRoot: string;
  workspaceLocked: boolean;
  environmentProbe: EnvironmentProbe | null;
  onChooseWorkspaceRoot: () => void;
  onUseRepoWorkspaceRoot: () => void;
  runtimeDriver: RuntimeDriver;
  pythonExePath: string;
  onChoosePythonExe: () => Promise<string | null>;
  ffmpegMode: 'system' | 'local';
  ffmpegExePath: string;
  onChooseFfmpegExe: () => Promise<string | null>;
  noProxy: boolean;
  onSave: (driver: RuntimeDriver, pythonExePath: string, ffmpegMode: 'system' | 'local', ffmpegExePath: string, noProxy: boolean) => void;
}

export function SettingsPage({
  workspaceRoot,
  workspaceLocked,
  environmentProbe,
  onChooseWorkspaceRoot,
  onUseRepoWorkspaceRoot,
  runtimeDriver,
  pythonExePath,
  onChoosePythonExe,
  ffmpegMode,
  ffmpegExePath,
  onChooseFfmpegExe,
  noProxy,
  onSave,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [localDriver, setLocalDriver] = useState<RuntimeDriver>(runtimeDriver);
  const [localPythonExePath, setLocalPythonExePath] = useState(pythonExePath);
  const [localFfmpegMode, setLocalFfmpegMode] = useState<'system' | 'local'>(ffmpegMode);
  const [localFfmpegExePath, setLocalFfmpegExePath] = useState(ffmpegExePath);
  const [localNoProxy, setLocalNoProxy] = useState(noProxy);

  const environmentLabel = environmentProbe
    ? formatEnvironmentStatus(environmentProbe.status)
    : '正在检测';

  const envReady = environmentProbe?.status === 'ready';
  const authLabel = environmentProbe
    ? formatAuthStatus(environmentProbe.authState)
    : '正在检测';
  const authReady = environmentProbe?.authState === 'authenticated';

  const driverDisplayLabel =
    localDriver === 'conda' ? 'conda / 直接 Python' : 'uv';

  async function handleBrowsePythonExe() {
    const picked = await onChoosePythonExe();
    if (picked) {
      setLocalPythonExePath(picked);
    }
  }

  async function handleBrowseFfmpegExe() {
    const picked = await onChooseFfmpegExe();
    if (picked) {
      setLocalFfmpegExePath(picked);
      setLocalFfmpegMode('local');
    }
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
                <span className={`env-info-badge ${envReady ? 'env-info-badge--ready' : 'env-info-badge--warn'}`}>
                  {environmentLabel}
                </span>
              </div>
              {environmentProbe?.message ? (
                <div className="env-info-row">
                  <span className="env-info-label">详情</span>
                  <span className="env-info-value">{environmentProbe.message}</span>
                </div>
              ) : null}
              {environmentProbe?.issues && environmentProbe.issues.length > 0 ? (
                <div className="env-info-row env-info-row--issues">
                  <span className="env-info-label">诊断</span>
                  <ul className="env-issues-list">
                    {environmentProbe.issues.map((issue, idx) => (
                      <li key={idx} className="env-issue">{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="env-info-row">
                <span className="env-info-label">运行驱动</span>
                <span className="env-info-value env-info-mono">{driverDisplayLabel}</span>
              </div>
              {environmentProbe ? (
                <div className="env-info-row">
                  <span className="env-info-label">认证状态</span>
                  <span className={`env-info-badge ${authReady ? 'env-info-badge--ready' : 'env-info-badge--warn'}`}>
                    {authLabel}
                  </span>
                </div>
              ) : null}
              {environmentProbe?.authMessage ? (
                <div className="env-info-row">
                  <span className="env-info-label">认证详情</span>
                  <span className="env-info-value">{environmentProbe.authMessage}</span>
                </div>
              ) : null}
              {environmentProbe?.authSource ? (
                <div className="env-info-row">
                  <span className="env-info-label">认证来源</span>
                  <span className="env-info-value env-info-mono">{environmentProbe.authSource}</span>
                </div>
              ) : null}
            </div>

            <div className="group-title">环境配置</div>

            <SettingCard>
              <SettingRow
                name="根目录"
                description={
                  workspaceLocked
                    ? '有任务进行中，暂时锁定'
                    : '模型等资源路径均相对此目录'
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
                    重置为项目目录
                  </button>
                </div>
              </SettingRow>

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

              {localDriver === 'conda' ? (
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
                      onChange={(event) => setLocalPythonExePath(event.target.value)}
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
                      onChange={(event) => setLocalFfmpegExePath(event.target.value)}
                      placeholder="例：C:\tools\ffmpeg\bin\ffmpeg.exe"
                    />
                    <button
                      type="button"
                      className="workspace-button"
                      onClick={handleBrowseFfmpegExe}
                    >
                      浏览
                    </button>
                  </div>
                </SettingRow>
              ) : null}

              <SettingRow
                name="禁用代理"
                description="向 yutto 传递 --proxy no，忽略系统代理环境变量"
                icon="🌐"
              >
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    className="toggle-checkbox"
                    checked={localNoProxy}
                    onChange={(e) => setLocalNoProxy(e.target.checked)}
                  />
                  <span className="toggle-text">{localNoProxy ? '已禁用' : '自动'}</span>
                </label>
              </SettingRow>
            </SettingCard>

            <div className="settings-save-row">
              <button
                type="button"
                className="settings-save-button"
                onClick={() => onSave(localDriver, localPythonExePath, localFfmpegMode, localFfmpegExePath, localNoProxy)}
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
