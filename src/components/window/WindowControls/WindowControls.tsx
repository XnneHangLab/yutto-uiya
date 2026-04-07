import {
  closeWindow,
  minimizeWindow,
  toggleMaximizeWindow,
} from '../../../services/desktop/window';

export function WindowControls() {
  return (
    <div className="window-btns" role="group" aria-label="窗口控制">
      <button
        type="button"
        className="window-btn"
        aria-label="最小化窗口"
        onClick={() => void minimizeWindow()}
      >
        —
      </button>
      <button
        type="button"
        className="window-btn"
        aria-label="切换最大化窗口"
        onClick={() => void toggleMaximizeWindow()}
      >
        □
      </button>
      <button
        type="button"
        className="window-btn window-btn--close"
        aria-label="关闭窗口"
        onClick={() => void closeWindow()}
      >
        ×
      </button>
    </div>
  );
}
