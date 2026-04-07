interface NoticePanelProps {
  notices: string[];
  onOpenModels: () => void;
}

export function NoticePanel({ notices, onOpenModels }: NoticePanelProps) {
  return (
    <aside className="notice">
      <h2>公告</h2>

      {notices.map((notice) => (
        <p key={notice}>{notice}</p>
      ))}

      <button
        type="button"
        className="run-btn"
        onClick={onOpenModels}
      >
        前往下载
      </button>
    </aside>
  );
}
