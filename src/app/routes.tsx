import type { ReactElement } from 'react';
import { HomePage } from '../pages/HomePage/HomePage';
import { ConsolePage } from '../pages/ConsolePage/ConsolePage';
import { DownloadPage } from '../pages/DownloadPage/DownloadPage';
import { PlaceholderPage } from '../pages/PlaceholderPage/PlaceholderPage';
import { SettingsPage } from '../pages/SettingsPage/SettingsPage';
import type { PageId } from '../data/nav';
import type { ConsoleLogEntry } from '../services/launcher/launcher';
import type {
  EnvironmentProbe,
  ManagedFolderItem,
  RuntimeInspection,
  RuntimeDriver,
  RuntimeTaskRecord,
  VideoParseItem,
} from '../services/runtime/runtime';

interface RenderPageOptions {
  inspection: RuntimeInspection | null;
  tasks: RuntimeTaskRecord[];
  folders: ManagedFolderItem[];
  logs: ConsoleLogEntry[];
  autoScroll: boolean;
  wrapLines: boolean;
  latestMessage: string;
  onOpenModels: () => void;
  onDownload: (url: string) => void;
  onParse: (url: string) => Promise<VideoParseItem[]>;
  parseItems: VideoParseItem[];
  parseSelected: Set<number>;
  onParseSelectedChange: (next: Set<number>) => void;
  onClearParseItems: () => void;
  downloadUrl: string;
  onDownloadUrlChange: (next: string) => void;
  onOpenPath: (pathKey: string) => void;
  runtimeDriver: RuntimeDriver;
  scriptsReady: boolean;
  workspaceLocked: boolean;
  workspaceRoot: string;
  environmentProbe: EnvironmentProbe | null;
  onChooseWorkspaceRoot: () => void;
  onUseRepoWorkspaceRoot: () => void;
  pythonExePath: string;
  onChoosePythonExe: () => Promise<string | null>;
  ffmpegMode: 'system' | 'local';
  ffmpegExePath: string;
  onChooseFfmpegExe: () => Promise<string | null>;
  noProxy: boolean;
  onSave: (driver: RuntimeDriver, pythonExePath: string, ffmpegMode: 'system' | 'local', ffmpegExePath: string, noProxy: boolean) => void;
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
          ffmpegMode={options.ffmpegMode}
          ffmpegExePath={options.ffmpegExePath}
          onChooseFfmpegExe={options.onChooseFfmpegExe}
          noProxy={options.noProxy}
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
        <DownloadPage
          tasks={options.tasks}
          onDownload={options.onDownload}
          onParse={options.onParse}
          scriptsReady={options.scriptsReady}
          parseItems={options.parseItems}
          parseSelected={options.parseSelected}
          onParseSelectedChange={options.onParseSelectedChange}
          onClearParseItems={options.onClearParseItems}
          downloadUrl={options.downloadUrl}
          onDownloadUrlChange={options.onDownloadUrlChange}
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
