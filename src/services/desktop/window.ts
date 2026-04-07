import { getCurrentWindow } from '@tauri-apps/api/window';

type DesktopWindow = ReturnType<typeof getCurrentWindow>;
type WindowAction = (appWindow: DesktopWindow) => Promise<void>;

async function runWindowAction(action: WindowAction) {
  try {
    const appWindow = getCurrentWindow();
    await action(appWindow);
  } catch {
    return;
  }
}

export function minimizeWindow() {
  return runWindowAction((appWindow) => appWindow.minimize());
}

export function toggleMaximizeWindow() {
  return runWindowAction((appWindow) => appWindow.toggleMaximize());
}

export function closeWindow() {
  return runWindowAction((appWindow) => appWindow.close());
}
