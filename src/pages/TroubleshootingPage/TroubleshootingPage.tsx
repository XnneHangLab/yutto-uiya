import { useState } from 'react';
import { faqItems } from '../../data/troubleshooting';
import '../../styles/troubleshooting.css';

const channels = ['GitHub Issues', '交流群', '私信'];

export function TroubleshootingPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <div className="troubleshooting-page">
      <h2 className="troubleshooting-section-title">疑难解答</h2>
      <p className="troubleshooting-desc">
        常见问题与解法汇总，点击展开查看详情。
        <br />
        有其他问题可以通过以下渠道反馈：
      </p>
      <div className="troubleshooting-channels">
        {channels.map((c) => (
          <span key={c} className="troubleshooting-channel">
            {c}
          </span>
        ))}
      </div>

      <p className="troubleshooting-sub-title">问题收录（{faqItems.length}）</p>

      <div className="faq-list">
        {faqItems.map((item) => {
          const expanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              className={`faq-card ${expanded ? 'faq-card--expanded' : ''}`}
            >
              <button
                type="button"
                className="faq-header"
                onClick={() => toggleExpand(item.id)}
                aria-expanded={expanded}
              >
                <span className="faq-title">{item.title}</span>
                <span className="faq-chevron">{expanded ? '−' : '+'}</span>
              </button>
              {expanded && (
                <div className="faq-body">
                  <div className="faq-section">
                    <span className="faq-label">现象</span>
                    <p className="faq-text">{item.symptom}</p>
                  </div>
                  {item.cause && (
                    <div className="faq-section">
                      <span className="faq-label">原因</span>
                      <p className="faq-text">{item.cause}</p>
                    </div>
                  )}
                  <div className="faq-section">
                    <span className="faq-label">解决</span>
                    <ol className="faq-steps">
                      {item.steps.map((step, i) => (
                        <li key={`${item.id}-step-${i}`}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
