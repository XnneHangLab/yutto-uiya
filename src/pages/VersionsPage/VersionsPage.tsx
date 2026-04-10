import '../../styles/versions.css';

interface VersionTimelineEntry {
  date: string;
  version: string;
  badge: string;
  title: string;
  summary?: string;
}

const CURRENT_VERSION = {
  version: 'v2.0.0',
  date: '2026-4-11',
  channel: '稳定版',
  summary: '将前端由 streamlit 迁移至 tauri',
};

const VERSION_TIMELINE: VersionTimelineEntry[] = [
  {
    date: '2026-4-11',
    version: 'v2.0.0',
    badge: '当前',
    title: '将前端由 streamlit 迁移至 tauri',
  },
];

export function VersionsPage() {
  return (
    <div className="versions-page">
      <section className="versions-current-card">
        <div className="versions-current-card__body">
          <div className="versions-current-card__main">
            <p className="versions-current-card__label">当前版本</p>
            <h1>{CURRENT_VERSION.version}</h1>
            <p className="versions-current-card__summary">{CURRENT_VERSION.summary}</p>
          </div>

          <div className="versions-current-card__meta">
            <div className="versions-stat-grid">
              <div className="versions-stat-card">
                <span className="versions-stat-card__label">发布日期</span>
                <strong className="versions-stat-card__value">{CURRENT_VERSION.date}</strong>
              </div>
              <div className="versions-stat-card">
                <span className="versions-stat-card__label">版本状态</span>
                <strong className="versions-stat-card__value">{CURRENT_VERSION.channel}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="versions-timeline-card">
        <div className="versions-section-head">
          <h2>版本时间线</h2>
          <p>将来会存留历史版本，并按时间继续追加在这里。</p>
        </div>

        <div className="versions-timeline">
          {VERSION_TIMELINE.map((entry) => (
            <article key={entry.version} className="versions-timeline__item">
              <div className="versions-timeline__rail">
                <span className="versions-timeline__dot" />
              </div>

              <div className="versions-timeline__content">
                <div className="versions-timeline__top">
                  <span className="versions-timeline__date">{entry.date}</span>
                  <span className="versions-timeline__version">{entry.version}</span>
                  <span className="versions-timeline__badge">{entry.badge}</span>
                </div>
                <p className="versions-timeline__title">{entry.title}</p>
                {entry.summary ? <p>{entry.summary}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
