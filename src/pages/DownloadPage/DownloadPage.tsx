import { useEffect, useRef, useState } from 'react';
import { fetchCoverImage } from '../../services/runtime/bridge';
import type {
  DownloadOptions,
  QualityOption,
  RuntimeTaskRecord,
  VideoParseGroup,
  VideoParseItem,
} from '../../services/runtime/runtime';
import { collectParseItems } from '../../services/runtime/runtime';
import {
  AUDIO_QUALITY_OPTIONS,
  VIDEO_QUALITY_OPTIONS,
} from '../../services/yutto/quality';
import '../../styles/models.css';

// 解析全部结束后，先让最终列表渲染安定，再发起封面抓取（子进程较重）。
const AUTO_COVER_FETCH_DELAY_MS = 1000;

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
  const {
    requireVideo,
    requireAudio,
    requireCover,
    requireSubtitle,
    requireDanmaku,
  } = opts;
  let hint = '';
  if (requireVideo && requireAudio && requireCover)
    hint = '视频 + 音频 + 封面（封面内嵌，不另存）';
  else if (requireVideo && requireAudio) hint = '视频 + 音频，自动混流';
  else if (requireVideo && requireCover) hint = '仅视频流 + 封面';
  else if (requireAudio && requireCover) hint = '仅音频流 + 封面';
  else if (requireVideo) hint = '仅视频流（无音频）';
  else if (requireAudio) hint = '仅音频流';
  else if (requireCover) hint = '仅封面图片';
  else hint = '请至少选择一种资源类型';
  if (requireSubtitle) hint += '；含字幕';
  if (requireDanmaku) hint += '；含弹幕';
  return hint;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatView(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  return String(n);
}

function qualityLabel(options: QualityOption[], quality: number): string {
  return (
    options.find((option) => option.code === quality)?.label ?? `QN ${quality}`
  );
}

function audioQualityLabel(quality: number): string {
  const label = qualityLabel(AUDIO_QUALITY_OPTIONS, quality);
  return /^\d+$/.test(label) ? `${label} kbps` : label;
}

function saveAction(codec: string): string {
  return codec === 'copy' ? '直接封装' : `转码 ${codec.toUpperCase()}`;
}

function renderSelectedMedia(task: RuntimeTaskRecord) {
  const media = task.selectedMedia;
  if (!media) return null;

  return (
    <section className="models-page__media" aria-label="实际下载资源">
      {media.video ? (
        <section className="models-page__media-track" aria-label="实际视频资源">
          <span className="models-page__media-kind">视频</span>
          <span className="models-page__media-spec">
            {qualityLabel(VIDEO_QUALITY_OPTIONS, media.video.quality)}
            <b>{media.video.codec.toUpperCase()}</b>
            <span>
              {media.video.width}×{media.video.height}
            </span>
          </span>
          <span className="models-page__media-action">
            {saveAction(media.video.saveCodec)}
          </span>
        </section>
      ) : null}
      {media.audio ? (
        <section className="models-page__media-track" aria-label="实际音频资源">
          <span className="models-page__media-kind">音频</span>
          <span className="models-page__media-spec">
            {audioQualityLabel(media.audio.quality)}
            <b>{media.audio.codec.toUpperCase()}</b>
          </span>
          <span className="models-page__media-action">
            {saveAction(media.audio.saveCodec)}
          </span>
        </section>
      ) : null}
      {!media.video && !media.audio ? (
        <div className="models-page__media-empty">未选择音视频流</div>
      ) : null}
    </section>
  );
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
  parseAudioQualities: QualityOption[];
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
  parseAudioQualities,
  downloadOptions,
  onDownloadOptionsChange,
  onCancelTask,
  onOpenDownloadsFolder,
}: DownloadPageProps) {
  const [parsing, setParsing] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // item.index → 'loading' | 'error' | data-URL string
  const [covers, setCovers] = useState<
    Map<number, 'loading' | 'error' | string>
  >(new Map());

  const listRef = useRef<HTMLUListElement>(null);
  // `index:coverUrl` of the auto-fetch already scheduled for the current parse
  // round — makes the every-render effect one-shot. Reset on re-parse / URL
  // change / unmount so the next round (or a remount) fetches again.
  const autoFetchKeyRef = useRef<string | null>(null);
  const autoFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest covers map for callbacks that outlive their defining render (the
  // delayed auto-fetch fires ~1s after scheduling).
  const coversRef = useRef(covers);

  const allParseItems = collectParseItems(parseItems, parseGroups);
  const hasParseResults = allParseItems.length > 0;

  useEffect(() => {
    coversRef.current = covers;
  }, [covers]);

  // Auto-expand the latest item and scroll it into view as it arrives during parsing.
  useEffect(() => {
    if (allParseItems.length > 0) {
      setExpandedIndex(allParseItems[allParseItems.length - 1].index);
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allParseItems.length]);

  // Auto-fetch the LAST item's cover (single fetch, looks great for single-
  // video parses and gives a nice preview for the end of a playlist) — but
  // only once parsing is fully over AND the final rebuilt list has rendered.
  // Condition-driven on every commit instead of edge-triggered on the parsing
  // flip: the old one-shot effect could fire on a commit where the
  // authoritative item rebuild hadn't landed yet, silently losing the fetch
  // (no cover, no loading/retry state — nothing). The extra delay lets the
  // freshly rendered list settle before the subprocess-backed fetch starts.
  useEffect(() => {
    if (parsing || allParseItems.length === 0) return;
    const lastItem = allParseItems[allParseItems.length - 1];
    if (!lastItem.cover?.startsWith('http') || covers.has(lastItem.index)) {
      return;
    }
    const key = `${lastItem.index}:${lastItem.cover}`;
    if (autoFetchKeyRef.current === key) return;
    autoFetchKeyRef.current = key;
    autoFetchTimerRef.current = setTimeout(() => {
      autoFetchTimerRef.current = null;
      void handleLoadCover(lastItem);
    }, AUTO_COVER_FETCH_DELAY_MS);
  });

  // A pending auto-fetch dies with the page; resetting the key lets a remount
  // (StrictMode replays included) schedule a fresh one.
  useEffect(
    () => () => {
      if (autoFetchTimerRef.current) {
        clearTimeout(autoFetchTimerRef.current);
        autoFetchTimerRef.current = null;
      }
      autoFetchKeyRef.current = null;
    },
    [],
  );

  function cancelPendingAutoFetch() {
    if (autoFetchTimerRef.current) {
      clearTimeout(autoFetchTimerRef.current);
      autoFetchTimerRef.current = null;
    }
    autoFetchKeyRef.current = null;
  }

  function handleUrlChange(next: string) {
    onDownloadUrlChange(next);
    if (next.trim() !== downloadUrl.trim()) {
      cancelPendingAutoFetch();
      onClearParseItems();
      setExpandedIndex(null);
      setExpandedGroups(new Set());
      setCovers(new Map());
    }
  }

  async function handleParse(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = downloadUrl.trim();
    if (!trimmed) return;
    cancelPendingAutoFetch();
    setParsing(true);
    onClearParseItems();
    setExpandedIndex(null);
    setExpandedGroups(new Set());
    setCovers(new Map());
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
    const allGroupItemsSelected = groupIndexes.every((index) =>
      parseSelected.has(index),
    );
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

  async function handleLoadCover(item: VideoParseItem) {
    // 经 coversRef 读取最新状态：延迟触发的自动抓取闭包早于点击/完成的那次渲染。
    const state = coversRef.current.get(item.index);
    // 'error' 状态允许再次点击重试；loading/已加载则不重复请求。
    if (!item.cover || (state !== undefined && state !== 'error')) return;
    setExpandedIndex(item.index);
    setCovers((prev) => new Map(prev).set(item.index, 'loading'));
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    let dataUrl: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await delay(500);
      try {
        dataUrl = await fetchCoverImage(item.cover);
        break;
      } catch {
        // retry
      }
    }
    if (dataUrl) {
      setCovers((prev) => new Map(prev).set(item.index, dataUrl!));
    } else {
      // 失败要可见：按钮变成重试提示，而不是静默退回「查看封面」。
      setCovers((prev) => new Map(prev).set(item.index, 'error'));
    }
  }

  function renderDetailPanel(item: VideoParseItem) {
    const coverState = covers.get(item.index);
    const coverNode =
      typeof coverState === 'string' &&
      coverState !== 'loading' &&
      coverState !== 'error' ? (
        <img
          className="parse-detail__cover"
          src={coverState}
          alt={item.title}
        />
      ) : null;

    return (
      <div className="parse-detail__content">
        {coverNode}
        <div className="parse-detail__info">
          <p className="parse-detail__title">{item.title}</p>
          {item.uploader ? (
            <p className="parse-detail__uploader">{item.uploader}</p>
          ) : null}
          {item.view || item.duration ? (
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
                <span key={tag} className="parse-detail__tag">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderParseItem(item: VideoParseItem, nested = false) {
    return (
      <li
        key={item.index}
        className={`parse-item${nested ? ' parse-item--nested' : ''}`}
      >
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
          {item.cover?.startsWith('http') ? (
            <button
              type="button"
              className="parse-item__cover-btn"
              disabled={covers.get(item.index) === 'loading'}
              onClick={() => handleLoadCover(item)}
            >
              {covers.get(item.index) === 'loading'
                ? '加载中…'
                : covers.get(item.index) === 'error'
                  ? '加载失败，重试'
                  : covers.get(item.index)
                    ? '封面'
                    : '查看封面'}
            </button>
          ) : null}
          <button
            type="button"
            className={`parse-item__detail-btn${expandedIndex === item.index ? ' parse-item__detail-btn--active' : ''}`}
            onClick={() => handleToggleDetail(item)}
          >
            详情
          </button>
        </div>
        {expandedIndex === item.index ? (
          <div className="parse-item__detail">{renderDetailPanel(item)}</div>
        ) : null}
      </li>
    );
  }

  const allSelected =
    allParseItems.length > 0 && parseSelected.size === allParseItems.length;
  const noneChecked =
    !downloadOptions.requireVideo &&
    !downloadOptions.requireAudio &&
    !downloadOptions.requireCover;

  return (
    <div className="models-page">
      <header className="models-page__header">
        <h1>下载管理</h1>
        <p>输入 Bilibili 视频链接，点击"解析"预览视频列表，选择后下载。</p>
        {!scriptsReady ? (
          <p className="models-page__header-warn">
            运行环境未就绪，暂时无法执行下载。
          </p>
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
                <span className="parse-results__count">
                  {allParseItems.length} 个视频
                </span>
              </span>
              <button
                type="button"
                className="parse-bulk-btn"
                onClick={handleToggleAll}
              >
                {allSelected ? '取消全选' : '全选'}
              </button>
            </div>
            <ul className="parse-results__list" ref={listRef}>
              {parseItems.map((item) => renderParseItem(item))}
              {parseGroups.map((group, groupIndex) => {
                const groupKey = `${group.dir || group.title}-${groupIndex}`;
                const expanded = expandedGroups.has(groupKey);
                const allGroupItemsSelected =
                  group.items.length > 0 &&
                  group.items.every((item) => parseSelected.has(item.index));

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
                        <span className="parse-group__title">
                          {group.title}
                        </span>
                        <span className="parse-group__count">
                          {group.items.length} 个视频
                        </span>
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
                onClick={() =>
                  onDownloadOptionsChange({
                    ...downloadOptions,
                    requireVideo: !downloadOptions.requireVideo,
                  })
                }
              />
            </div>

            <div className="dl-opts-row">
              <div className="dl-opts-text">
                <span className="dl-opts-name">音频</span>
                <span className="dl-opts-desc">
                  下载音频轨道；与视频同时选中时自动混流
                </span>
              </div>
              <button
                type="button"
                className={`dl-switch${downloadOptions.requireAudio ? ' dl-switch--on' : ''}`}
                aria-pressed={downloadOptions.requireAudio}
                onClick={() =>
                  onDownloadOptionsChange({
                    ...downloadOptions,
                    requireAudio: !downloadOptions.requireAudio,
                  })
                }
              />
            </div>

            <div className="dl-opts-row">
              <div className="dl-opts-text">
                <span className="dl-opts-name">封面</span>
                <span className="dl-opts-desc">
                  与视频、音频同时选中时内嵌；单独下载时另存至同目录
                </span>
              </div>
              <button
                type="button"
                className={`dl-switch${downloadOptions.requireCover ? ' dl-switch--on' : ''}`}
                aria-pressed={downloadOptions.requireCover}
                onClick={() =>
                  onDownloadOptionsChange({
                    ...downloadOptions,
                    requireCover: !downloadOptions.requireCover,
                  })
                }
              />
            </div>

            <div className="dl-opts-row">
              <div className="dl-opts-text">
                <span className="dl-opts-name">字幕</span>
                <span className="dl-opts-desc">下载 ass / srt 字幕文件</span>
              </div>
              <button
                type="button"
                className={`dl-switch${downloadOptions.requireSubtitle ? ' dl-switch--on' : ''}`}
                aria-pressed={downloadOptions.requireSubtitle}
                onClick={() =>
                  onDownloadOptionsChange({
                    ...downloadOptions,
                    requireSubtitle: !downloadOptions.requireSubtitle,
                  })
                }
              />
            </div>

            <div className="dl-opts-row">
              <div className="dl-opts-text">
                <span className="dl-opts-name">弹幕</span>
                <span className="dl-opts-desc">下载弹幕文件</span>
              </div>
              <button
                type="button"
                className={`dl-switch${downloadOptions.requireDanmaku ? ' dl-switch--on' : ''}`}
                aria-pressed={downloadOptions.requireDanmaku}
                onClick={() =>
                  onDownloadOptionsChange({
                    ...downloadOptions,
                    requireDanmaku: !downloadOptions.requireDanmaku,
                  })
                }
              />
            </div>

            {downloadOptions.requireVideo && parseVideoQualities.length > 0 ? (
              <div className="dl-opts-row">
                <div className="dl-opts-text">
                  <span className="dl-opts-name">画质</span>
                  <span className="dl-opts-desc">
                    批量下载时尽量满足该画质，不足时自动降级
                  </span>
                </div>
                <select
                  className="dl-opts-select"
                  value={downloadOptions.videoQuality}
                  onChange={(e) =>
                    onDownloadOptionsChange({
                      ...downloadOptions,
                      videoQuality: Number(e.target.value),
                    })
                  }
                >
                  {parseVideoQualities.map((q) => (
                    <option key={q.code} value={q.code}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {downloadOptions.requireVideo ? (
              <div className="dl-opts-row">
                <div className="dl-opts-text">
                  <span className="dl-opts-name">视频编码</span>
                  <span className="dl-opts-desc">
                    优先下载所选编码，不可用时自动回退
                  </span>
                </div>
                <select
                  className="dl-opts-select"
                  aria-label="视频编码"
                  value={downloadOptions.videoCodec}
                  onChange={(e) =>
                    onDownloadOptionsChange({
                      ...downloadOptions,
                      videoCodec: e.target.value as 'auto' | 'av1',
                    })
                  }
                >
                  <option value="auto">自动（兼容优先）</option>
                  <option value="av1">AV1</option>
                </select>
              </div>
            ) : null}

            {downloadOptions.requireAudio && parseAudioQualities.length > 0 ? (
              <div className="dl-opts-row">
                <div className="dl-opts-text">
                  <span className="dl-opts-name">音质</span>
                  <span className="dl-opts-desc">
                    批量下载时尽量满足该音质，不足时自动降级
                  </span>
                </div>
                <select
                  className="dl-opts-select"
                  value={downloadOptions.audioQuality}
                  onChange={(e) =>
                    onDownloadOptionsChange({
                      ...downloadOptions,
                      audioQuality: Number(e.target.value),
                    })
                  }
                >
                  {parseAudioQualities.map((q) => (
                    <option key={q.code} value={q.code}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {downloadOptions.requireAudio && !downloadOptions.requireVideo ? (
              <div className="dl-opts-row">
                <div className="dl-opts-text">
                  <span className="dl-opts-name">音频格式</span>
                  <span className="dl-opts-desc">纯音频下载时的输出格式</span>
                </div>
                <div className="dl-opts-btn-group">
                  {(
                    [
                      { label: 'M4A', value: 'm4a' },
                      { label: 'MP3', value: 'mp3' },
                      { label: 'FLAC', value: 'flac' },
                      { label: 'WAV', value: 'wav' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`dl-opts-btn-group__item${downloadOptions.audioFormat === opt.value ? ' dl-opts-btn-group__item--active' : ''}`}
                      onClick={() =>
                        onDownloadOptionsChange({
                          ...downloadOptions,
                          audioFormat: opt.value,
                        })
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="dl-opts-footer">
              <span className="dl-opts-hint">
                {downloadHint(downloadOptions)}
              </span>
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
              const isActive = [
                'queued',
                'preparing',
                'downloading',
                'verifying',
              ].includes(task.status);
              // 服务端单 worker 串行执行，同一时刻只有一个任务在跑；排队中的
              // 卡片不放动画进度条，否则整批看起来像同时开下。
              const isRunning = [
                'preparing',
                'downloading',
                'verifying',
              ].includes(task.status);
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
                        onClick={() =>
                          onOpenDownloadsFolder(task.saveDir || undefined)
                        }
                      >
                        打开文件夹
                      </button>
                    ) : null}
                  </div>
                  {renderSelectedMedia(task)}
                  {isRunning ? (
                    task.percent !== undefined ? (
                      <>
                        <div className="models-page__task-stage">
                          {task.stageDesc ?? '下载中'} {task.percent}%
                          {task.downloaded && task.totalSize
                            ? ` · ${task.downloaded} / ${task.totalSize}`
                            : ''}
                          {task.speed ? ` · ${task.speed}` : ''}
                        </div>
                        <div className="models-page__progressbar">
                          <div
                            className="models-page__progressbar-fill"
                            style={{ width: `${task.percent}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      // 字节进度未知时报当前阶段（解析中/写入附件/后处理中…）。
                      <>
                        <div className="models-page__task-stage">
                          {`${task.stageDesc ?? taskStatusLabel[task.status] ?? '进行中'}…`}
                        </div>
                        <div className="models-page__indeterminate">
                          <div className="models-page__indeterminate-fill" />
                        </div>
                      </>
                    )
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
