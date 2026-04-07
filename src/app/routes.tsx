import type { ReactElement } from 'react';
import { HomePage } from '../pages/HomePage/HomePage';
import { ConsolePage } from '../pages/ConsolePage/ConsolePage';
import { ModelsPage } from '../pages/ModelsPage/ModelsPage';
import { PlaceholderPage } from '../pages/PlaceholderPage/PlaceholderPage';
import { SettingsPage } from '../pages/SettingsPage/SettingsPage';
import type { PageId } from '../data/nav';
import type { ConsoleLogEntry } from '../services/launcher/launcher';
import type {
  EnvironmentProbe,
  FileProgress,
  ManagedFolderItem,
  RuntimeInspection,
  RuntimeDriver,
  RuntimeTaskRecord,
} from '../services/runtime/runtime';

interface RenderPageOptions {
  inspection: RuntimeInspection | null;
  tasks: RuntimeTaskRecord[];
  fileProgress: FileProgress | null;
  folders: ManagedFolderItem[];
  logs: ConsoleLogEntry[];
  autoScroll: boolean;
  wrapLines: boolean;
  latestMessage: string;
  onOpenModels: () => void;
  onDownloadGenieBase: () => void;
  onDownloadGsvLite: () => void;
  onDownloadQwenTts06b: () => void;
  onDownloadQwenTts17b: () => void;
  onDownloadLumingGenieTts: () => void;
  onOpenPath: (pathKey: string) => void;
  onLaunchWebui: () => void;
  webuiRunning: boolean;
  runtimeDriver: RuntimeDriver;
  runtimeMode: string;
  scriptsReady: boolean;
  workspaceLocked: boolean;
  workspaceRoot: string;
  environmentProbe: EnvironmentProbe | null;
  onChooseWorkspaceRoot: () => void;
  onUseRepoWorkspaceRoot: () => void;
  pythonExePath: string;
  onChoosePythonExe: () => Promise<string | null>;
  onSave: (driver: RuntimeDriver, pythonExePath: string) => void;
  onSetAutoScroll: (next: boolean) => void;
  onSetWrapLines: (next: boolean) => void;
  onClearLogs: () => void;
  onExportLogs: () => void;
}

export function renderPage(
  pageId: PageId,
  options: RenderPageOptions,
): ReactElement {
  switch (pageId) {
    case 'home':
      return (
        <HomePage
          folders={options.folders}
          onOpenPath={options.onOpenPath}
          onOpenModels={options.onOpenModels}
          onLaunchWebui={options.onLaunchWebui}
          webuiRunning={options.webuiRunning}
        />
      );
    case 'settings':
      return (
        <SettingsPage
          workspaceRoot={options.workspaceRoot}
          workspaceLocked={options.workspaceLocked}
          environmentProbe={options.environmentProbe}
          onChooseWorkspaceRoot={options.onChooseWorkspaceRoot}
          onUseRepoWorkspaceRoot={options.onUseRepoWorkspaceRoot}
          runtimeDriver={options.runtimeDriver}
          pythonExePath={options.pythonExePath}
          onChoosePythonExe={options.onChoosePythonExe}
          onSave={options.onSave}
        />
      );
    case 'advanced':
      return (
        <PlaceholderPage
          title="高级选项"
          description="预留更细粒度的运行参数与后端切换入口。"
        />
      );
    case 'troubleshooting':
      return (
        <PlaceholderPage
          title="疑难解答"
          description="预留更细粒度的运行诊断与修复入口。"
        />
      );
    case 'versions':
      return (
        <PlaceholderPage
          title="版本管理"
          description="预留运行时版本切换和回滚能力。"
        />
      );
    case 'models':
      return (
        <ModelsPage
          inspection={options.inspection}
          environmentProbe={options.environmentProbe}
          tasks={options.tasks}
          fileProgress={options.fileProgress}
          onDownloadGenieBase={options.onDownloadGenieBase}
          onDownloadGsvLite={options.onDownloadGsvLite}
          onDownloadQwenTts06b={options.onDownloadQwenTts06b}
          onDownloadQwenTts17b={options.onDownloadQwenTts17b}
          onDownloadLumingGenieTts={options.onDownloadLumingGenieTts}
          scriptsReady={options.scriptsReady}
        />
      );
    case 'tools':
      return (
        <PlaceholderPage
          title="小工具"
          description="预留下载修复、目录清理和附加操作入口。"
        />
      );
    case 'community':
      return (
        <PlaceholderPage
          title="交流群"
          description="预留社区入口和外链跳转。"
        />
      );
    case 'console':
      return (
        <ConsolePage
          runtimeDriver={options.runtimeDriver}
          tasks={options.tasks}
          logs={options.logs}
          autoScroll={options.autoScroll}
          wrapLines={options.wrapLines}
          onSetAutoScroll={options.onSetAutoScroll}
          onSetWrapLines={options.onSetWrapLines}
          onClearLogs={options.onClearLogs}
          onExportLogs={options.onExportLogs}
        />
      );
    default: {
      const exhaustiveCheck: never = pageId;
      throw new Error(`Unhandled page id: ${exhaustiveCheck}`);
    }
  }
}
