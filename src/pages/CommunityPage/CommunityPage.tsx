import qqGroupImage from '../../assets/community/qq_group.png';

export function CommunityPage() {
  return (
    <div className="placeholder-page">
      <div className="placeholder-card" style={{ textAlign: 'center' }}>
        <h1>交流群</h1>
        <img className="community-qr" src={qqGroupImage} alt="QQ 群二维码" />
        <p className="community-group-number">QQ 群：1080284048</p>
      </div>
    </div>
  );
}
