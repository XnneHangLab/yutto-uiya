import { useState } from 'react';
import type { DownloadOptions, QualityOption, RuntimeTaskRecord, VideoParseItem } from '../../services/runtime/runtime';
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

function downloadHint(opts: DownloadOptions): string {
  const { requireVideo, requireAudio, requireCover } = opts;
  if (requireVideo && requireAudio && requireCover) return '视频 + 音频 + 封面（另存同目录）';
  if (requireVideo && requireAudio) return '视频 + 音频，自动混流';
  if (requireVideo && requireCover) return '仅视频流 + 封面';
  if (requireAudio && requireCover) return '仅音频流 + 封面';
  if (requireVideo) return '仅视频流（无音频）';
  if (requireAudio) return '仅音频流';
  if (requireCover) return '仅封面图片';
  return '请至少选择一种资源类型';
}

interface DownloadPageProps {
  tasks: RuntimeTaskRecord[];
  onDownload: (url: string) => void;
  onParse: (url: string) => Promise<VideoParseItem[]>;
  scriptsReady: boolean;
  parseItems: VideoParseItem[];
  parseSelected: Set<number>;
  onParseSelectedChange: (next: Set<number>) => void;
  onClearParseItems: () => void;
  downloadUrl: string;
  onDownloadUrlChange: (next: string) => void;
  parseVideoQualities: QualityOption[];
  downloadOptions: DownloadOptions;
  onDownloadOptionsChange: (next: DownloadOptions) => void;
}

export function DownloadPage({
  tasks,
  onDownload,
  onParse,
  scriptsReady,
  parseItems,
  parseSelected,
  onParseSelectedChange,
  onClearParseItems,
  downloadUrl,
  onDownloadUrlChange,
  parseVideoQualities,
  downloadOptions,
  onDownloadOptionsChange,
}: DownloadPageProps) {
  const [parsing, setParsing] = useState(false);

  function handleUrlChange(next: string) {
    onDownloadUrlChange(next);
    if (next.trim() !== downloadUrl.trim()) {
      onClearParseItems();
    }
  }

  function handleDirectDownload(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = downloadUrl.trim();
    if (!trimmed) return;
    onDownload(trimmed);
    onDownloadUrlChange('');
    onClearParseItems();
  }

  async function handleParse(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = downloadUrl.trim();
    if (!trimmed) return;
    setParsing(true);
    onClearParseItems();
    try {
      await onParse(trimmed);
    } finally {
      setParsing(false);
    }
  }

  function handleToggleAll() {
    if (parseSelected.size === parseItems.length) {
      onParseSelectedChange(new Set());
    } else {
      onParseSelectedChange(new Set(parseItems.map((item) => item.index)));
    }
  }

  function handleToggleItem(index: number) {
    const next = new Set(parseSelected);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    onParseSelectedChange(next);
  }

  function handleDownloadSelected() {
    for (const item of parseItems) {
      if (parseSelected.has(item.index)) {
        onDownload(item.url);
      }
    }
    // Do NOT clear parse list or URL — user may want to download more
  }

  const allSelected = parseItems.length > 0 && parseSelected.size === parseItems.length;
  const noneChecked = !downloadOptions.requireVideo && !downloadOptions.requireAudio && !downloadOptions.requireCover;

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
            value={downloadUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://www.bilibili.com/video/BV..."
            disabled={!scriptsReady || parsing}
            aria-label="Bilibili 视频链接"
          />
          <button
            type="button"
            className="download-parse-btn"
            disabled={!scriptsReady || !downloadUrl.trim() || parsing}
            onClick={handleParse}
          >
            {parsing ? '解析中…' : '解析'}
          </button>
          <button
            type="submit"
            className="download-submit-btn"
            disabled={!scriptsReady || !downloadUrl.trim() || parsing}
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
                    checked={parseSelected.has(item.index)}
                    onChange={() => handleToggleItem(item.index)}
                  />
                  <span className="parse-item__index">{item.index}</span>
                  <span className="parse-item__title">{item.title}</span>
                </label>
              </li>
            ))}
          </ul>

          <div className="download-options">
            <div className="download-options__row">
              <span className="download-options__label">资源类型</span>
              <label className="download-options__check">
                <input
                  type="checkbox"
                  checked={downloadOptions.requireVideo}
                  onChange={(e) => onDownloadOptionsChange({ ...downloadOptions, requireVideo: e.target.checked })}
                />
                视频
              </label>
              <label className="download-options__check">
                <input
                  type="checkbox"
                  checked={downloadOptions.requireAudio}
                  onChange={(e) => onDownloadOptionsChange({ ...downloadOptions, requireAudio: e.target.checked })}
                />
                音频
              </label>
              <label className="download-options__check">
                <input
                  type="checkbox"
                  checked={downloadOptions.requireCover}
                  onChange={(e) => onDownloadOptionsChange({ ...downloadOptions, requireCover: e.target.checked })}
                />
                封面
              </label>
            </div>
            {downloadOptions.requireVideo && parseVideoQualities.length > 0 ? (
              <div className="download-options__row">
                <span className="download-options__label">画质</span>
                <select
                  className="download-options__quality-select"
                  value={downloadOptions.videoQuality}
                  onChange={(e) => onDownloadOptionsChange({ ...downloadOptions, videoQuality: Number(e.target.value) })}
                >
                  {parseVideoQualities.map((q) => (
                    <option key={q.code} value={q.code}>{q.label}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <p className="download-options__hint">{downloadHint(downloadOptions)}</p>
          </div>

          <div className="parse-results__actions">
            <button
              type="button"
              className="download-submit-btn"
              disabled={parseSelected.size === 0 || noneChecked}
              onClick={handleDownloadSelected}
            >
              下载所选 ({parseSelected.size})
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
              const isActive = ['queued', 'preparing', 'downloading', 'verifying'].includes(task.status);
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
                  {isActive ? (
                    <div className="models-page__indeterminate">
                      <div className="models-page__indeterminate-fill" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
