import { ModelCard, type ModelSpec } from '../../components/models/ModelCard/ModelCard';
import type {
  EnvironmentProbe,
  FileProgress,
  RuntimeInspection,
  RuntimeTaskRecord,
} from '../../services/runtime/runtime';
import '../../styles/models.css';

const MODEL_SPECS: ModelSpec[] = [
  {
    key: 'genie-base',
    title: 'Genie-TTS 基础资源',
    description: 'XnneHangLab 自研语音合成引擎所需的基础模型包，支持 CPU 与 GPU 环境。',
    icon: '🧠',
    tags: ['CPU', 'GPU'],
    requiresGpu: false,
  },
  {
    key: 'luming-genie-tts-v2-pro-plus',
    title: '路鸣 Genie-TTS v2 Pro+',
    description: '路鸣角色 Genie-TTS 角色模型包，CPU 推理，需配合 Genie-TTS 基础资源使用。',
    icon: '🎤',
    tags: ['CPU'],
    requiresGpu: false,
  },
  {
    key: 'gsv-lite',
    title: 'GSV-Lite 数据包',
    description: '包含 HuBERT、Roberta、G2P 及 SV 共四项子资源，仅 GPU 环境可用。',
    icon: '🎙',
    tags: ['GPU'],
    requiresGpu: true,
  },
  {
    key: 'qwen-tts-0.6b',
    title: 'Qwen3-TTS 0.6B',
    description: '千问语音合成轻量版，仅 GPU 环境可用。',
    icon: '🔊',
    tags: ['GPU', '≥ 8GB'],
    requiresGpu: true,
  },
  {
    key: 'qwen-tts-1.7b',
    title: 'Qwen3-TTS 1.7B',
    description: '千问语音合成标准版，仅 GPU 环境可用。',
    icon: '🔊',
    tags: ['GPU', '12~16GB'],
    requiresGpu: true,
  },
];

const taskStatusLabel: Record<string, string> = {
  queued: '排队中',
  preparing: '准备中',
  downloading: '下载中',
  verifying: '校验中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

interface ModelsPageProps {
  inspection: RuntimeInspection | null;
  environmentProbe: EnvironmentProbe | null;
  tasks: RuntimeTaskRecord[];
  fileProgress: FileProgress | null;
  onDownloadGenieBase: () => void;
  onDownloadGsvLite: () => void;
  onDownloadQwenTts06b: () => void;
  onDownloadQwenTts17b: () => void;
  onDownloadLumingGenieTts: () => void;
  scriptsReady: boolean;
}

export function ModelsPage({
  inspection,
  environmentProbe,
  tasks,
  fileProgress,
  onDownloadGenieBase,
  onDownloadGsvLite,
  onDownloadQwenTts06b,
  onDownloadQwenTts17b,
  onDownloadLumingGenieTts,
  scriptsReady,
}: ModelsPageProps) {
  const gpuReady =
    inspection?.environment.mode === 'gpu' ||
    environmentProbe?.status === 'torch-gpu-ready';

  function handleDownload(key: string) {
    if (key === 'genie-base') {
      onDownloadGenieBase();
    } else if (key === 'luming-genie-tts-v2-pro-plus') {
      onDownloadLumingGenieTts();
    } else if (key === 'gsv-lite') {
      onDownloadGsvLite();
    } else if (key === 'qwen-tts-0.6b') {
      onDownloadQwenTts06b();
    } else if (key === 'qwen-tts-1.7b') {
      onDownloadQwenTts17b();
    }
  }

  return (
    <div className="models-page">
      <header className="models-page__header">
        <h1>模型管理</h1>
        <p>按需下载运行时所需的模型资源，下载任务自动进入串行队列。</p>
        {!scriptsReady ? (
          <p className="models-page__header-warn">运行环境未就绪，暂时无法执行下载。</p>
        ) : null}
      </header>

      <section>
        <h2 className="models-page__section-title">资源包</h2>
        <div className="models-page__cards">
          {MODEL_SPECS.map((spec) => (
            <ModelCard
              key={spec.key}
              spec={spec}
              status={inspection?.resources[spec.key]?.status ?? null}
              scriptsReady={scriptsReady}
              gpuReady={gpuReady}
              onDownload={() => handleDownload(spec.key)}
            />
          ))}
        </div>
      </section>

      <section className="models-page__queue">
        <h2>下载队列</h2>
        {tasks.length === 0 ? (
          <p className="models-page__queue-empty">暂无下载任务</p>
        ) : (
          <div className="models-page__task-list">
            {tasks.map((task) => {
              const fp =
                task.status === 'downloading' && fileProgress?.target === task.target
                  ? fileProgress
                  : null;
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
                  </div>
                  {fp && (
                    <div className="models-page__file-progress">
                      <div className="models-page__file-progress-bar">
                        <div
                          className="models-page__file-progress-fill"
                          style={{ width: `${fp.percent}%` }}
                        />
                      </div>
                      <div className="models-page__file-progress-meta">
                        <span className="models-page__file-progress-desc">
                          {fp.desc.split('/').pop()}
                        </span>
                        <span className="models-page__file-progress-info">
                          {fp.percent}%
                          {fp.downloaded && fp.total && ` · ${fp.downloaded} / ${fp.total}`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
