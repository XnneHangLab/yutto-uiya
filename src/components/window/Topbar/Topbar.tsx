import { WindowControls } from '../WindowControls/WindowControls';

interface TopbarProps {
  title?: string;
}

export function Topbar({ title }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-title" data-tauri-drag-region>
        {title ? <span data-tauri-drag-region>{title}</span> : null}
      </div>
      <div className="topbar-right">
        <button type="button" className="topbar-help" aria-label="帮助">
          ?
        </button>
        <WindowControls />
      </div>
    </header>
  );
}
