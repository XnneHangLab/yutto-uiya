import type { ConsoleLogEntry } from '../../services/launcher/launcher';
import {
  getQueueSummary,
  type RuntimeDriver,
  type RuntimeTaskRecord,
} from '../../services/runtime/runtime';
import '../../styles/console.css';

interface ConsolePageProps {
  runtimeDriver: RuntimeDriver;
  tasks: RuntimeTaskRecord[];
  logs: ConsoleLogEntry[];
  autoScroll: boolean;
  wrapLines: boolean;
  onSetAutoScroll: (next: boolean) => void;
  onSetWrapLines: (next: boolean) => void;
  onClearLogs: () => void;
  onExportLogs: () => void;
}

export function ConsolePage({
  runtimeDriver,
  tasks,
  logs,
  autoScroll,
  wrapLines,
  onSetAutoScroll,
  onSetWrapLines,
  onClearLogs,
  onExportLogs,
}: ConsolePageProps) {
  const queueSummary = getQueueSummary(tasks);
  const queueState = queueSummary.activeTask ? 'running' : 'idle';
  const activeTaskLabel = queueSummary.activeTask
    ? `当前任务 ${queueSummary.activeTask.label}`
    : '当前没有活动任务';
  const lastLog = logs[logs.length - 1];

  function handleCopyAll() {
    const text = logs.map((e) => e.text).join('\n');
    void navigator.clipboard?.writeText(text);
  }

  return (
    <div className="console-page">
      <header className="console-toolbar">
        <div className="console-toolbar__status">
          <span className={`console-status console-status--${queueState}`}>
            {queueSummary.activeTask ? queueSummary.activeTask.status : 'idle'}
          </span>
          <div className="console-toolbar__meta">
            <span className="console-toolbar__label">运行驱动 {runtimeDriver}</span>
            <span className="console-command">{activeTaskLabel}</span>
          </div>
        </div>

        <div className="console-toolbar__actions">
          <button type="button" onClick={onClearLogs}>
            清空日志
          </button>
          <button type="button" onClick={handleCopyAll} disabled={logs.length === 0}>
            全部复制
          </button>
          <button type="button" onClick={onExportLogs} disabled={logs.length === 0}>
            导出日志
          </button>
          <button
            type="button"
            aria-pressed={autoScroll}
            onClick={() => onSetAutoScroll(!autoScroll)}
          >
            自动滚动
          </button>
          <button
            type="button"
            aria-pressed={wrapLines}
            onClick={() => onSetWrapLines(!wrapLines)}
          >
            换行
          </button>
        </div>
      </header>

      <section className={`console-log-panel${wrapLines ? ' is-wrap' : ''}`}>
        {logs.length === 0 ? (
          <div className="console-empty">
            <h2>尚无运行日志</h2>
            <p>开始检查环境或下载资源后，这里会显示结构化事件和原始输出</p>
          </div>
        ) : (
          <div className="console-log-list">
            {logs.map((entry) => (
              <div key={entry.id} className={`console-log console-log--${entry.kind}`}>
                <span className="console-log__time">{entry.time}</span>
                <pre className="console-log__text">{entry.text}</pre>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="console-footer">
        <span>日志条数 {logs.length}</span>
        <span>队列任务 {queueSummary.queueLength}</span>
        <span>最后更新时间 {lastLog ? lastLog.time : '暂无'}</span>
        <span>{autoScroll ? '自动滚动开启' : '自动滚动关闭'}</span>
      </footer>
    </div>
  );
}
