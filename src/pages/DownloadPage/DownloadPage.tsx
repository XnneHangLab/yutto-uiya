import { useState } from 'react';
import type { FileProgress, RuntimeTaskRecord, VideoParseItem } from '../../services/runtime/runtime';
import '../../styles/models.css';

const taskStatusLabel: Record<string, string> = {
  queued: '排队中',
  preparing: '准备中',
  downloading: '下载中',
  verifying: '校验中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

interface DownloadPageProps {
  tasks: RuntimeTaskRecord[];
  fileProgress: FileProgress | null;
  onDownload: (url: string) => void;
  onParse: (url: string) => Promise<VideoParseItem[]>;
  scriptsReady: boolean;
}

export function DownloadPage({
  tasks,
  fileProgress,
  onDownload,
  onParse,
  scriptsReady,
}: DownloadPageProps) {
  const [url, setUrl] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseItems, setParseItems] = useState<VideoParseItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function handleUrlChange(next: string) {
    setUrl(next);
    if (next.trim() !== url.trim()) {
      setParseItems([]);
      setSelected(new Set());
    }
  }

  function handleDirectDownload(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onDownload(trimmed);
    setUrl('');
    setParseItems([]);
    setSelected(new Set());
  }

  async function handleParse(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setParsing(true);
    setParseItems([]);
    setSelected(new Set());
    try {
      const items = await onParse(trimmed);
      setParseItems(items);
      setSelected(new Set(items.map((item) => item.index)));
    } finally {
      setParsing(false);
    }
  }

  function handleToggleAll() {
    if (selected.size === parseItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(parseItems.map((item) => item.index)));
    }
  }

  function handleToggleItem(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function handleDownloadSelected() {
    for (const item of parseItems) {
      if (selected.has(item.index)) {
        onDownload(item.url);
      }
    }
    setParseItems([]);
    setSelected(new Set());
    setUrl('');
  }

  const allSelected = parseItems.length > 0 && selected.size === parseItems.length;

  return (
    <div className="models-page">
      <header className="models-page__header">
        <h1>下载管理</h1>
        <p>输入 Bilibili 视频链接。"解析"可预览视频列表后选择下载；"加入队列"直接下载整个链接。</p>
        {!scriptsReady ? (
          <p className="models-page__header-warn">运行环境未就绪，暂时无法执行下载。</p>
        ) : null}
      </header>

      <section>
        <form className="download-form" onSubmit={handleDirectDownload}>
          <input
            className="download-url-input"
            type="url"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://www.bilibili.com/video/BV..."
            disabled={!scriptsReady || parsing}
            aria-label="Bilibili 视频链接"
          />
          <button
            type="button"
            className="download-parse-btn"
            disabled={!scriptsReady || !url.trim() || parsing}
            onClick={handleParse}
          >
            {parsing ? '解析中…' : '解析'}
          </button>
          <button
            type="submit"
            className="download-submit-btn"
            disabled={!scriptsReady || !url.trim() || parsing}
          >
            加入队列
          </button>
        </form>
      </section>

      {parseItems.length > 0 ? (
        <section className="parse-results">
          <div className="parse-results__header">
            <span className="parse-results__title">
              解析结果 <span className="parse-results__count">({parseItems.length} 个视频)</span>
            </span>
            <button
              type="button"
              className="parse-bulk-btn"
              onClick={handleToggleAll}
            >
              {allSelected ? '取消全选' : '全选'}
            </button>
          </div>
          <ul className="parse-results__list">
            {parseItems.map((item) => (
              <li key={item.index} className="parse-item">
                <label className="parse-item__label">
                  <input
                    type="checkbox"
                    className="parse-item__checkbox"
                    checked={selected.has(item.index)}
                    onChange={() => handleToggleItem(item.index)}
                  />
                  <span className="parse-item__index">{item.index}</span>
                  <span className="parse-item__title">{item.title}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="parse-results__actions">
            <button
              type="button"
              className="download-submit-btn"
              disabled={selected.size === 0}
              onClick={handleDownloadSelected}
            >
              下载所选 ({selected.size})
            </button>
          </div>
        </section>
      ) : null}

      <section className="models-page__queue">
        <h2>下载队列</h2>
        {tasks.length === 0 ? (
          <p className="models-page__queue-empty">暂无下载任务</p>
        ) : (
          <div className="models-page__task-list">
            {tasks.map((task) => {
              const fp =
                task.status === 'downloading' && fileProgress?.target === task.target
                  ? fileProgress
                  : null;
              return (
                <div key={task.taskId} className="models-page__task">
                  <div className="models-page__task-info">
                    <div className="models-page__task-label">{task.label}</div>
                    <div className="models-page__task-msg">{task.message}</div>
                  </div>
                  <div className="models-page__task-right">
                    <span
                      className={`models-page__task-status models-page__task-status--${task.status}`}
                    >
                      {taskStatusLabel[task.status] ?? task.status}
                    </span>
                    <span className="models-page__task-progress">
                      {task.progressCurrent} / {task.progressTotal}
                    </span>
                  </div>
                  {fp && (
                    <div className="models-page__file-progress">
                      <div className="models-page__file-progress-bar">
                        <div
                          className="models-page__file-progress-fill"
                          style={{ width: `${fp.percent}%` }}
                        />
                      </div>
                      <div className="models-page__file-progress-meta">
                        <span className="models-page__file-progress-desc">
                          {fp.desc.split('/').pop()}
                        </span>
                        <span className="models-page__file-progress-info">
                          {fp.percent}%
                          {fp.downloaded && fp.total && ` · ${fp.downloaded} / ${fp.total}`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
