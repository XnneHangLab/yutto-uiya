export type ConsoleLogKind = 'system' | 'stdout' | 'stderr';
export type LaunchState = 'idle' | 'running';

export interface ConsoleLogEntry {
  id: string;
  time: string;
  kind: ConsoleLogKind;
  text: string;
}

export const UNCONFIGURED_COMMAND_LABEL = '未配置命令';

export function getVisibleCommand(command: string | null): string {
  const value = command?.trim();
  return value ? value : UNCONFIGURED_COMMAND_LABEL;
}

function createTimestamp() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

export function createConsoleLog(
  kind: ConsoleLogKind,
  text: string,
): ConsoleLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    time: createTimestamp(),
    kind,
    text,
  };
}

export function formatConsoleExport(logs: ConsoleLogEntry[]) {
  return logs
    .map((entry) => `[${entry.time}] [${entry.kind}] ${entry.text}`)
    .join('\n');
}
