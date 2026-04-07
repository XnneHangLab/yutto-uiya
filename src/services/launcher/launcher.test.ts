import {
  createConsoleLog,
  formatConsoleExport,
  getVisibleCommand,
} from './launcher';

describe('launcher helpers', () => {
  it('falls back to 未配置命令 when no command is configured', () => {
    expect(getVisibleCommand(null)).toBe('未配置命令');
    expect(getVisibleCommand('')).toBe('未配置命令');
    expect(
      getVisibleCommand('uv run python -m xnnehanglab_tts.cli inspect-runtime'),
    ).toBe('uv run python -m xnnehanglab_tts.cli inspect-runtime');
  });

  it('creates timestamped console logs', () => {
    const log = createConsoleLog('system', '已进入下载队列');

    expect(log.kind).toBe('system');
    expect(log.text).toBe('已进入下载队列');
    expect(log.time.length).toBeGreaterThan(0);
  });

  it('formats logs for export', () => {
    const output = formatConsoleExport([
      {
        id: 'log-1',
        time: '2026-04-05 15:00:00',
        kind: 'system',
        text: '已进入下载队列',
      },
    ]);

    expect(output).toContain('[system]');
    expect(output).toContain('已进入下载队列');
  });
});
