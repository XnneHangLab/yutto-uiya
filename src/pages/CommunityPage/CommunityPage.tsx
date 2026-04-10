import '../../styles/community.css';
import { openUrl } from '../../services/runtime/bridge';
import qqGroupImage from '../../assets/community/qq_group.png';

interface GroupEntry {
  name: string;
  number: string;
  platform: string;
  qr: string;
}

const groups: GroupEntry[] = [
  {
    name: 'yutto-uiya 交流群',
    number: '1080284048',
    platform: 'QQ',
    qr: qqGroupImage,
  },
];

const REPO_URL = 'https://github.com/XnneHangLab/yutto-uiya';
const BILIBILI_URL = 'https://space.bilibili.com/3461562564086372';

function GitHubIcon() {
  return (
    <svg className="community-link-card__icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function BilibiliIcon() {
  return (
    <svg className="community-link-card__icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1 1.704-1.786l2.254 2.154h5.312l2.254-2.154a1.234 1.234 0 1 1 1.704 1.786zM3.333 7.68c-.789.04-1.431.32-1.933.845-.502.523-.759 1.174-.773 1.96v7.2c.014.787.271 1.438.773 1.96.502.524 1.144.804 1.933.845h17.334c.789-.041 1.431-.321 1.933-.845.502-.522.759-1.173.773-1.96v-7.2c-.014-.786-.271-1.437-.773-1.96-.502-.525-1.144-.805-1.933-.845zm4.667 3.36c.44 0 .84.178 1.133.467l.012.015c.301.292.487.694.487 1.138 0 .892-.72 1.614-1.612 1.614H7.88a1.614 1.614 0 0 1-1.594-1.614c0-.445.183-.845.479-1.138l.017-.015A1.614 1.614 0 0 1 8 11.04zm8 0a1.614 1.614 0 0 1 1.614 1.614 1.614 1.614 0 0 1-1.614 1.614 1.614 1.614 0 0 1-1.614-1.614c0-.44.178-.836.467-1.13l.012-.013A1.61 1.61 0 0 1 16 11.04z" />
    </svg>
  );
}

export function CommunityPage() {
  return (
    <div className="community-page">
      <h2 className="community-section-title">链接</h2>
      <p className="community-hint">源码、Issue 反馈、PR，以及作者的 B 站空间。</p>
      <div className="community-link-cards">
        <button type="button" className="community-link-card" onClick={() => openUrl(REPO_URL)}>
          <GitHubIcon />
          <div className="community-link-card__body">
            <span className="community-link-card__title">XnneHangLab / yutto-uiya</span>
            <span className="community-link-card__desc">github.com/XnneHangLab/yutto-uiya</span>
          </div>
          <span className="community-link-card__arrow">›</span>
        </button>
        <button type="button" className="community-link-card" onClick={() => openUrl(BILIBILI_URL)}>
          <BilibiliIcon />
          <div className="community-link-card__body">
            <span className="community-link-card__title">Korewaxnne</span>
            <span className="community-link-card__desc">space.bilibili.com/3461562564086372</span>
          </div>
          <span className="community-link-card__arrow">›</span>
        </button>
      </div>

      <h2 className="community-section-title">交流群</h2>
      <p className="community-hint">扫码加入，或直接搜索群号添加。有问题、建议或想法欢迎在群内反馈。</p>
      <div className="community-groups">
        {groups.map((g) => (
          <div key={g.number} className="community-group-card">
            <img className="community-group-card__qr" src={g.qr} alt={`${g.name} 二维码`} />
            <div className="community-group-card__meta">
              <span className="community-group-card__badge">{g.platform}</span>
              <span className="community-group-card__name">{g.name}</span>
              <span className="community-group-card__number">{g.number}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
