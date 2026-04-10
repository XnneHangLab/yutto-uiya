import '../../styles/community.css';
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

export function CommunityPage() {
  return (
    <div className="community-page">
      <p className="community-hint">扫码加入，或搜索群号直接添加</p>
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
