import { useState } from 'react';
import {
  type FaqImage,
  type FaqItem,
  faqCategories,
} from '../../data/troubleshooting';
import { openUrl } from '../../services/runtime/bridge';
import '../../styles/troubleshooting.css';

const channels = ['GitHub Issues', '交流群', '私信'];

const totalCount = faqCategories.reduce(
  (sum, cat) => sum + cat.items.length,
  0,
);

function FaqThumb({
  image,
  onZoom,
}: {
  image: FaqImage;
  onZoom: (src: string) => void;
}) {
  return (
    <div className="faq-thumb-wrap">
      <span className="faq-thumb-label">{image.label}</span>
      <img
        className="faq-thumb"
        src={image.src}
        alt={image.label}
        role="button"
        tabIndex={0}
        onClick={() => onZoom(image.src)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onZoom(image.src);
        }}
      />
    </div>
  );
}

function FaqCard({
  item,
  expanded,
  onToggle,
  onZoom,
}: {
  item: FaqItem;
  expanded: boolean;
  onToggle: () => void;
  onZoom: (src: string) => void;
}) {
  function handleOpenVideo() {
    if (!item.video) return;
    const url = `https://www.bilibili.com/video/${item.video.bvid}`;
    void openUrl(url);
  }

  return (
    <div className={`faq-card ${expanded ? 'faq-card--expanded' : ''}`}>
      <button
        type="button"
        className="faq-header"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="faq-header-content">
          <span className="faq-title">{item.title}</span>
          {!expanded && <span className="faq-preview">{item.symptom}</span>}
        </div>
        <span className="faq-chevron">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="faq-body">
          <div className="faq-grid">
            <div className="faq-cell">
              <span className="faq-label">现象</span>
              <p className="faq-text">{item.symptom}</p>
              {item.symptomImage && (
                <FaqThumb image={item.symptomImage} onZoom={onZoom} />
              )}
            </div>
            {item.cause ? (
              <div className="faq-cell">
                <span className="faq-label">原因</span>
                <p className="faq-text">{item.cause}</p>
              </div>
            ) : (
              <div />
            )}
            <div className="faq-cell">
              <span className="faq-label">解决</span>
              <ol className="faq-steps">
                {item.steps.map((step, i) => (
                  <li key={`${item.id}-step-${i}`}>{step}</li>
                ))}
              </ol>
              {item.stepsImage && (
                <FaqThumb image={item.stepsImage} onZoom={onZoom} />
              )}
            </div>
            {item.video ? (
              <div className="faq-cell faq-cell--video">
                <span className="faq-label">参考</span>
                <button
                  type="button"
                  className="faq-video-btn"
                  onClick={handleOpenVideo}
                >
                  <span className="faq-video-icon">▶</span>
                  <span className="faq-video-text">
                    {item.video.title}
                    {item.video.timestamp ? ` ${item.video.timestamp}` : ''}
                  </span>
                </button>
              </div>
            ) : (
              <div />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TroubleshootingPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <div className="troubleshooting-page">
      <h2 className="troubleshooting-section-title">疑难解答</h2>
      <div className="troubleshooting-meta">
        <span className="troubleshooting-count">共 {totalCount} 条收录</span>
        <div className="troubleshooting-channels">
          {channels.map((c) => (
            <span key={c} className="troubleshooting-channel">
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="faq-categories">
        {faqCategories.map((cat) => (
          <section key={cat.id} className="faq-category">
            <div className="faq-category-header">
              <span className="faq-category-icon">{cat.icon}</span>
              <span className="faq-category-label">{cat.label}</span>
              <span className="faq-category-count">{cat.items.length}</span>
            </div>
            <div className="faq-list">
              {cat.items.map((item) => (
                <FaqCard
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => toggleExpand(item.id)}
                  onZoom={setZoomSrc}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {zoomSrc && (
        <div
          className="faq-zoom-overlay"
          role="button"
          tabIndex={0}
          onClick={() => setZoomSrc(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') setZoomSrc(null);
          }}
        >
          <img className="faq-zoom-img" src={zoomSrc} alt="" />
        </div>
      )}
    </div>
  );
}
