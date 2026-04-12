import { useState } from 'react';
import type {
  VideoParseGroup,
  DownloadOptions,
  QualityOption,
  RuntimeTaskRecord,
  VideoParseItem,
} from '../../services/runtime/runtime';
import { collectParseItems } from '../../services/runtime/runtime';
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
  if (requireVideo && requireAudio && requireCover) return '视频 + 音频 + 封面（封面另存同目录）';
  if (requireVideo && requireAudio) return '视频 + 音频，自动混流';
  if (requireVideo && requireCover) return '仅视频流 + 封面';
  if (requireAudio && requireCover) return '仅音频流 + 封面';
  if (requireVideo) return '仅视频流（无音频）';
  if (requireAudio) return '仅音频流';
  if (requireCover) return '仅封面图片';
  return '请至少选择一种资源类型';
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatView(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  return String(n);
}


interface DownloadPageProps {
  tasks: RuntimeTaskRecord[];
  onDownload: (url: string, label?: string, itemDir?: string) => void;
  onParse: (url: string) => Promise<VideoParseItem[]>;
  scriptsReady: boolean;
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
  onOpenDownloadsFolder: (relativePath?: string) => void;
}

export function DownloadPage({
  tasks,
  onDownload,
  onParse,
  scriptsReady,
  parseItems,
  parseGroups,
  parseSelected,
  onParseSelectedChange,
  onClearParseItems,
  downloadUrl,
  onDownloadUrlChange,
  parseVideoQualities,
  downloadOptions,
  onDownloadOptionsChange,
  onCancelTask,
  onOpenDownloadsFolder,
}: DownloadPageProps) {
  const [parsing, setParsing] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const allParseItems = collectParseItems(parseItems, parseGroups);
  const hasParseResults = allParseItems.length > 0;

  function handleUrlChange(next: string) {
    onDownloadUrlChange(next);
    if (next.trim() !== downloadUrl.trim()) {
      onClearParseItems();
      setExpandedIndex(null);
      setExpandedGroups(new Set());
    }
  }

  async function handleParse(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = downloadUrl.trim();
    if (!trimmed) return;
    setParsing(true);
    onClearParseItems();
    setExpandedIndex(null);
    setExpandedGroups(new Set());
    try {
      await onParse(trimmed);
    } finally {
      setParsing(false);
    }
  }

  function handleToggleAll() {
    if (parseSelected.size === allParseItems.length) {
      onParseSelectedChange(new Set());
    } else {
      onParseSelectedChange(new Set(allParseItems.map((item) => item.index)));
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
    for (const item of allParseItems) {
      if (parseSelected.has(item.index)) {
        onDownload(item.url, item.title, item.dir || undefined);
      }
    }
  }

  function handleToggleGroup(group: VideoParseGroup) {
    const groupIndexes = group.items.map((item) => item.index);
    const allGroupItemsSelected = groupIndexes.every((index) => parseSelected.has(index));
    const next = new Set(parseSelected);

    if (allGroupItemsSelected) {
      groupIndexes.forEach((index) => next.delete(index));
    } else {
      groupIndexes.forEach((index) => next.add(index));
    }

    onParseSelectedChange(next);
  }

  function handleToggleGroupExpanded(groupKey: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }

  function handleToggleDetail(item: VideoParseItem) {
    setExpandedIndex(expandedIndex === item.index ? null : item.index);
  }

  function renderDetailPanel(item: VideoParseItem) {
    return (
      <div className="parse-detail__content">
        {item.cover ? (
          <img
            className="parse-detail__cover"
            src={item.cover}
            alt={item.title}
          />
        ) : null}
        <div className="parse-detail__info">
          <p className="parse-detail__title">{item.title}</p>
          {item.uploader ? <p className="parse-detail__uploader">{item.uploader}</p> : null}
          {(item.view || item.duration) ? (
            <p className="parse-detail__stats">
              {item.view ? `${formatView(item.view)} 次播放` : ''}
              {item.view && item.duration ? ' · ' : ''}
              {item.duration ? formatDuration(item.duration) : ''}
            </p>
          ) : null}
          {item.description ? (
            <p className="parse-detail__desc">{item.description}</p>
          ) : null}
          {item.tags && item.tags.length > 0 ? (
            <div className="parse-detail__tags">
              {item.tags.map((tag) => (
                <span key={tag} className="parse-detail__tag">{tag}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderParseItem(item: VideoParseItem, nested = false) {
    return (
      <li key={item.index} className={`parse-item${nested ? ' parse-item--nested' : ''}`}>
        <div className="parse-item__row">
          <label className="parse-item__label">
            <input
              type="checkbox"
              className="parse-item__checkbox"
              checked={parseSelected.has(item.index)}
              aria-label={`选择视频 ${item.title}`}
              onChange={() => handleToggleItem(item.index)}
            />
            <span className="parse-item__index">{item.index}</span>
            <span className="parse-item__title">{item.title}</span>
          </label>
          <button
            type="button"
            className={`parse-item__detail-btn${expandedIndex === item.index ? ' parse-item__detail-btn--active' : ''}`}
            onClick={() => handleToggleDetail(item)}
          >
            详情
          </button>
        </div>
        {expandedIndex === item.index ? (
          <div className="parse-item__detail">
            {renderDetailPanel(item)}
          </div>
        ) : null}
      </li>
    );
  }

  const allSelected = allParseItems.length > 0 && parseSelected.size === allParseItems.length;
  const noneChecked = !downloadOptions.requireVideo && !downloadOptions.requireAudio && !downloadOptions.requireCover;

  return (
    <div className="models-page">
      <header className="models-page__header">
        <h1>下载管理</h1>
        <p>输入 Bilibili 视频链接，点击"解析"预览视频列表，选择后下载。</p>
        {!scriptsReady ? (
          <p className="models-page__header-warn">运行环境未就绪，暂时无法执行下载。</p>
        ) : null}
      </header>

      <section>
        <form className="download-form" onSubmit={handleParse}>
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
            type="submit"
            className="download-parse-btn"
            disabled={!scriptsReady || !downloadUrl.trim() || parsing}
          >
            {parsing ? '解析中…' : '解析'}
          </button>
        </form>
      </section>

      {hasParseResults ? (
        <>
          <section className="parse-results">
            <div className="parse-results__header">
              <span className="parse-results__title">
                解析结果
                <span className="parse-results__count">{allParseItems.length} 个视频</span>
              </span>
              <button type="button" className="parse-bulk-btn" onClick={handleToggleAll}>
                {allSelected ? '取消全选' : '全选'}
              </button>
            </div>
            <ul className="parse-results__list">
              {parseItems.map((item) => renderParseItem(item))}
              {parseGroups.map((group, groupIndex) => {
                const groupKey = `${group.dir || group.title}-${groupIndex}`;
                const expanded = expandedGroups.has(groupKey);
                const allGroupItemsSelected = group.items.length > 0
                  && group.items.every((item) => parseSelected.has(item.index));

                return (
                  <li key={groupKey} className="parse-group">
                    <div className="parse-group__header">
                      <label className="parse-group__label">
                        <input
                          type="checkbox"
                          className="parse-item__checkbox"
                          checked={allGroupItemsSelected}
                          aria-label={`选择分组 ${group.title}`}
                          onChange={() => handleToggleGroup(group)}
                        />
                        <span className="parse-group__title">{group.title}</span>
                        <span className="parse-group__count">{group.items.length} 个视频</span>
                      </label>
                      <button
                        type="button"
                        className={`parse-group__toggle${expanded ? ' parse-group__toggle--expanded' : ''}`}
                        aria-label={`${expanded ? '收起' : '展开'}分组 ${group.title}`}
                        onClick={() => handleToggleGroupExpanded(groupKey)}
                      >
                        {expanded ? '收起' : '展开'}
                      </button>
                    </div>
                    {expanded ? (
                      <ul className="parse-group__items">
                        {group.items.map((item) => renderParseItem(item, true))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="dl-opts-card">
            <header className="dl-opts-header">
              <span className="dl-opts-header__title">下载选项</span>
            </header>

            <div className="dl-opts-row">
              <div className="dl-opts-text">
                <span className="dl-opts-name">视频</span>
                <span className="dl-opts-desc">下载视频画面</span>
              </div>
              <button
                type="button"
                className={`dl-switch${downloadOptions.requireVideo ? ' dl-switch--on' : ''}`}
                aria-pressed={downloadOptions.requireVideo}
                onClick={() => onDownloadOptionsChange({ ...downloadOptions, requireVideo: !downloadOptions.requireVideo })}
              />
            </div>

            <div className="dl-opts-row">
              <div className="dl-opts-text">
                <span className="dl-opts-name">音频</span>
                <span className="dl-opts-desc">下载音频轨道；与视频同时选中时自动混流</span>
              </div>
              <button
                type="button"
                className={`dl-switch${downloadOptions.requireAudio ? ' dl-switch--on' : ''}`}
                aria-pressed={downloadOptions.requireAudio}
                onClick={() => onDownloadOptionsChange({ ...downloadOptions, requireAudio: !downloadOptions.requireAudio })}
              />
            </div>

            <div className="dl-opts-row">
              <div className="dl-opts-text">
                <span className="dl-opts-name">封面</span>
                <span className="dl-opts-desc">下载封面图片，另存至同目录</span>
              </div>
              <button
                type="button"
                className={`dl-switch${downloadOptions.requireCover ? ' dl-switch--on' : ''}`}
                aria-pressed={downloadOptions.requireCover}
                onClick={() => onDownloadOptionsChange({ ...downloadOptions, requireCover: !downloadOptions.requireCover })}
              />
            </div>

            {downloadOptions.requireVideo && parseVideoQualities.length > 0 ? (
              <div className="dl-opts-row">
                <div className="dl-opts-text">
                  <span className="dl-opts-name">画质</span>
                  <span className="dl-opts-desc">批量下载时尽量满足该画质，不足时自动降级</span>
                </div>
                <select
                  className="dl-opts-select"
                  value={downloadOptions.videoQuality}
                  onChange={(e) =>
                    onDownloadOptionsChange({ ...downloadOptions, videoQuality: Number(e.target.value) })
                  }
                >
                  {parseVideoQualities.map((q) => (
                    <option key={q.code} value={q.code}>{q.label}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="dl-opts-footer">
              <span className="dl-opts-hint">{downloadHint(downloadOptions)}</span>
              <button
                type="button"
                className="download-submit-btn"
                disabled={parseSelected.size === 0 || noneChecked || parsing}
                onClick={handleDownloadSelected}
              >
                下载所选 ({parseSelected.size})
              </button>
            </div>
          </section>
        </>
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
                    <span className={`models-page__task-status models-page__task-status--${task.status}`}>
                      {taskStatusLabel[task.status] ?? task.status}
                    </span>
                    <span className="models-page__task-progress">
                      {task.progressCurrent} / {task.progressTotal}
                    </span>
                    {isActive ? (
                      <button
                        type="button"
                        className="models-page__task-cancel"
                        onClick={() => onCancelTask(task.taskId)}
                        title="取消"
                      >
                        ✕
                      </button>
                    ) : null}
                    {task.status === 'completed' ? (
                      <button
                        type="button"
                        className="models-page__task-open-folder"
                        onClick={() => onOpenDownloadsFolder(task.saveDir || undefined)}
                      >
                        打开文件夹
                      </button>
                    ) : null}
                  </div>
                  {isActive ? (
                    <>
                      <div className="models-page__task-console-hint">
                        详细进度请前往控制台查看
                      </div>
                      <div className="models-page__indeterminate">
                        <div className="models-page__indeterminate-fill" />
                      </div>
                    </>
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
