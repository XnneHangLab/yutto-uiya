import '../../styles/troubleshooting.css';

const channels = ['GitHub Issues', '交流群', '私信'];

export function TroubleshootingPage() {
  return (
    <div className="troubleshooting-page">
      <h2 className="troubleshooting-section-title">疑难解答</h2>
      <p className="troubleshooting-desc">
        后续会把常见问题与解法汇总在这里，方便自助排查。<br />
        现阶段有问题可以通过以下渠道反馈：
      </p>
      <div className="troubleshooting-channels">
        {channels.map((c) => (
          <span key={c} className="troubleshooting-channel">{c}</span>
        ))}
      </div>
      <p className="troubleshooting-sub-title">当前问题收录</p>
      <div className="troubleshooting-empty">暂未收到反馈，问题收录为 0</div>
    </div>
  );
}
