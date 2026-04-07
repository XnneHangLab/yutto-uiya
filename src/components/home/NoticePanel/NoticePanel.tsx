interface NoticePanelProps {
  notices: string[];
  onOpenModels: () => void;
  onLaunchWebui: () => void;
  webuiRunning: boolean;
}

export function NoticePanel({ notices, onOpenModels, onLaunchWebui, webuiRunning }: NoticePanelProps) {
  return (
    <aside className="notice">
      <h2>公告</h2>

      {notices.map((notice) => (
        <p key={notice}>{notice}</p>
      ))}

      <button
        type="button"
        className="run-btn"
        data-state={webuiRunning ? 'running' : 'ready'}
        disabled={webuiRunning}
        onClick={onLaunchWebui}
      >
        {webuiRunning ? '运行中…' : '一键启动'}
      </button>
    </aside>
  );
}
