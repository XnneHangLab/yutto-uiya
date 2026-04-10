import '../../styles/versions.css';

interface VersionTimelineEntry {
  version: string;
  badge: string;
  title: string;
  summary: string;
}

const CURRENT_VERSION = {
  version: 'v2.0.0',
  channel: '稳定版',
  summary: '桌面端启动页已移除重复版本号展示，版本信息集中到本页维护。',
};

const VERSION_TIMELINE: VersionTimelineEntry[] = [
  {
    version: 'v2.0.0',
    badge: '当前',
    title: '版本信息集中展示',
    summary: '版本号从启动页收拢到版本管理页，后续历史版本会继续沿着这条时间线追加。',
  },
];

export function VersionsPage() {
  return (
    <div className="versions-page">
      <section className="versions-current-card">
        <div className="versions-current-card__glow" />
        <div className="versions-current-card__body">
          <div className="versions-current-card__main">
            <p className="versions-current-card__eyebrow">当前版本</p>
            <h1>{CURRENT_VERSION.version}</h1>
            <p className="versions-current-card__summary">{CURRENT_VERSION.summary}</p>
          </div>

          <div className="versions-current-card__meta">
            <span className="versions-badge">{CURRENT_VERSION.channel}</span>
            <div className="versions-stat-grid">
              <div className="versions-stat-card">
                <span className="versions-stat-card__label">版本状态</span>
                <strong className="versions-stat-card__value">当前</strong>
              </div>
              <div className="versions-stat-card">
                <span className="versions-stat-card__label">时间线记录</span>
                <strong className="versions-stat-card__value">
                  {VERSION_TIMELINE.length.toString().padStart(2, '0')}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="versions-timeline-card">
        <div className="versions-section-head">
          <div>
            <p className="versions-section-head__eyebrow">版本时间线</p>
            <h2>版本时间线</h2>
          </div>
          <span className="versions-section-head__count">
            {VERSION_TIMELINE.length} 条记录
          </span>
        </div>

        <div className="versions-timeline">
          {VERSION_TIMELINE.map((entry) => (
            <article key={entry.version} className="versions-timeline__item">
              <div className="versions-timeline__rail">
                <span className="versions-timeline__dot" />
              </div>

              <div className="versions-timeline__content">
                <div className="versions-timeline__top">
                  <span className="versions-timeline__version">{entry.version}</span>
                  <span className="versions-timeline__badge">{entry.badge}</span>
                </div>
                <h3>{entry.title}</h3>
                <p>{entry.summary}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
