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
  onSave: (driver: RuntimeDriver, pythonExePath: string) => void;
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
  onSave,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [localDriver, setLocalDriver] = useState<RuntimeDriver>(runtimeDriver);
  const [localPythonExePath, setLocalPythonExePath] = useState(pythonExePath);

  const environmentLabel = environmentProbe
    ? formatEnvironmentStatus(environmentProbe.status)
    : '正在检测';

  const envReady =
    environmentProbe?.status === 'torch-cpu-ready' ||
    environmentProbe?.status === 'torch-gpu-ready';

  const driverDisplayLabel =
    localDriver === 'conda' ? 'conda / 直接 Python' : 'uv';

  async function handleBrowsePythonExe() {
    const picked = await onChoosePythonExe();
    if (picked) {
      setLocalPythonExePath(picked);
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
              <div className="env-info-row">
                <span className="env-info-label">运行驱动</span>
                <span className="env-info-value env-info-mono">{driverDisplayLabel}</span>
              </div>
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
            </SettingCard>

            <div className="settings-save-row">
              <button
                type="button"
                className="settings-save-button"
                onClick={() => onSave(localDriver, localPythonExePath)}
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
    case 'torch-unavailable':
      return 'torch 不可用';
    case 'torch-cpu-ready':
      return 'CPU 就绪';
    case 'torch-gpu-ready':
      return 'GPU 就绪';
    default:
      return status;
  }
}
