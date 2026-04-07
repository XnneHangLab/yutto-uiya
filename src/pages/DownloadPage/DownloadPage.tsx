import { useState } from 'react';
import type { FileProgress, RuntimeTaskRecord } from '../../services/runtime/runtime';
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
  scriptsReady: boolean;
}

export function DownloadPage({
  tasks,
  fileProgress,
  onDownload,
  scriptsReady,
}: DownloadPageProps) {
  const [url, setUrl] = useState('');

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onDownload(trimmed);
    setUrl('');
  }

  return (
    <div className="models-page">
      <header className="models-page__header">
        <h1>下载管理</h1>
        <p>输入 Bilibili 视频链接，任务自动进入串行队列。</p>
        {!scriptsReady ? (
          <p className="models-page__header-warn">运行环境未就绪，暂时无法执行下载。</p>
        ) : null}
      </header>

      <section>
        <form className="download-form" onSubmit={handleSubmit}>
          <input
            className="download-url-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.bilibili.com/video/BV..."
            disabled={!scriptsReady}
            aria-label="Bilibili 视频链接"
          />
          <button
            type="submit"
            className="download-submit-btn"
            disabled={!scriptsReady || !url.trim()}
          >
            加入下载队列
          </button>
        </form>
      </section>

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
