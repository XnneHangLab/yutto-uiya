import type { ResourceStatus } from '../../../services/runtime/runtime';
import '../../../styles/model-card.css';

export interface ModelSpec {
  key: string;
  title: string;
  description: string;
  icon: string;
  tags: string[];
  requiresGpu: boolean;
}

interface ModelCardProps {
  spec: ModelSpec;
  status: ResourceStatus | null;
  scriptsReady: boolean;
  gpuReady: boolean;
  onDownload: () => void;
}

const statusLabel: Record<ResourceStatus, string> = {
  ready: '已就绪',
  partial: '部分缺失',
  missing: '未下载',
};

const statusMod: Record<ResourceStatus, string> = {
  ready: 'ready',
  partial: 'partial',
  missing: 'missing',
};

export function ModelCard({
  spec,
  status,
  scriptsReady,
  gpuReady,
  onDownload,
}: ModelCardProps) {
  const blocked = spec.requiresGpu && !gpuReady;
  const canDownload = scriptsReady && !blocked;
  const currentStatus = status ?? null;

  return (
    <article className="model-card">
      <div className="model-card__left">
        <span className="model-card__icon" aria-hidden="true">
          {spec.icon}
        </span>
        <div className="model-card__text">
          <h3 className="model-card__title">{spec.title}</h3>
          <p className="model-card__desc">{spec.description}</p>
          <div className="model-card__tags">
            {spec.tags.map((tag) => (
              <span key={tag} className="model-card__tag">
                {tag}
              </span>
            ))}
            {blocked ? (
              <span className="model-card__tag model-card__tag--locked">
                需要 GPU 环境
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="model-card__right">
        {currentStatus ? (
          <span
            className={`model-card__status model-card__status--${statusMod[currentStatus]}`}
          >
            {statusLabel[currentStatus]}
          </span>
        ) : (
          <span className="model-card__status model-card__status--unknown">
            未检测
          </span>
        )}
        <button
          type="button"
          className="model-card__btn"
          onClick={onDownload}
          disabled={!canDownload}
          title={
            blocked
              ? '仅 GPU 环境可下载'
              : !scriptsReady
              ? '运行环境未就绪'
              : undefined
          }
        >
          下载
        </button>
      </div>
    </article>
  );
}
