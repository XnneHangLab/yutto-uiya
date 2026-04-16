import type { ReactElement } from 'react';
import { HomePage } from '../pages/HomePage/HomePage';
import { ConsolePage } from '../pages/ConsolePage/ConsolePage';
import { DownloadPage } from '../pages/DownloadPage/DownloadPage';
import { CommunityPage } from '../pages/CommunityPage/CommunityPage';
import { TroubleshootingPage } from '../pages/TroubleshootingPage/TroubleshootingPage';
import { SettingsPage } from '../pages/SettingsPage/SettingsPage';
import { VersionsPage } from '../pages/VersionsPage/VersionsPage';
import type { PageId } from '../data/nav';
import type { ConsoleLogEntry } from '../services/launcher/launcher';
import type {
  DownloadOptions,
  EnvironmentProbe,
  ManagedFolderItem,
  QualityOption,
  RuntimeInspection,
  RuntimeDriver,
  RuntimeTaskRecord,
  VideoParseGroup,
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
  onDownload: (url: string, label?: string, itemDir?: string) => void;
  onParse: (url: string) => Promise<VideoParseItem[]>;
  parseItems: VideoParseItem[];
  parseGroups: VideoParseGroup[];
  parseSelected: Set<number>;
  onParseSelectedChange: (next: Set<number>) => void;
  onClearParseItems: () => void;
  downloadUrl: string;
  onDownloadUrlChange: (next: string) => void;
  parseVideoQualities: QualityOption[];
  downloadOptions: DownloadOptions;
  onDownloadOptionsChange: (next: DownloadOptions) => void;
  onCancelTask: (taskId: string) => void;
  onOpenDownloadsFolder: () => void;
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
  authBusy: boolean;
  authDialogOpen: boolean;
  authDialogStatus: string;
  authDialogQrDataUrl: string;
  onStartAuthLogin: () => void;
  onLogoutAuth: () => void;
  onCloseAuthDialog: () => void;
  onSave: (driver: RuntimeDriver, pythonExePath: string, ffmpegMode: 'system' | 'local', ffmpegExePath: string, noProxy: boolean) => void;
  onUvSync: () => Promise<void>;
  onSetAutoScroll: (next: boolean) => void;
  onSetWrapLines: (next: boolean) => void;
  onClearLogs: () => void;
  onExportLogs: () => void;
  hotkey: string;
  onSetHotkey: (shortcut: string) => Promise<void>;
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
          authBusy={options.authBusy}
          authDialogOpen={options.authDialogOpen}
          authDialogStatus={options.authDialogStatus}
          authDialogQrDataUrl={options.authDialogQrDataUrl}
          onStartAuthLogin={options.onStartAuthLogin}
          onLogoutAuth={options.onLogoutAuth}
          onCloseAuthDialog={options.onCloseAuthDialog}
          onSave={options.onSave}
          onUvSync={options.onUvSync}
          hotkey={options.hotkey}
          onSetHotkey={options.onSetHotkey}
        />
      );
    case 'troubleshooting':
      return <TroubleshootingPage />;
    case 'versions':
      return <VersionsPage />;
    case 'models':
      return (
        <DownloadPage
          tasks={options.tasks}
          onDownload={options.onDownload}
          onParse={options.onParse}
          scriptsReady={options.scriptsReady}
          parseItems={options.parseItems}
          parseGroups={options.parseGroups}
          parseSelected={options.parseSelected}
          onParseSelectedChange={options.onParseSelectedChange}
          onClearParseItems={options.onClearParseItems}
          downloadUrl={options.downloadUrl}
          onDownloadUrlChange={options.onDownloadUrlChange}
          parseVideoQualities={options.parseVideoQualities}
          downloadOptions={options.downloadOptions}
          onDownloadOptionsChange={options.onDownloadOptionsChange}
          onCancelTask={options.onCancelTask}
          onOpenDownloadsFolder={options.onOpenDownloadsFolder}
        />
      );
    case 'community':
      return <CommunityPage />;
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
