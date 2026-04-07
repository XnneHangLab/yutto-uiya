import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ConsolePage } from './ConsolePage';

describe('ConsolePage', () => {
  it('renders the empty console state when no logs exist', () => {
    render(
      <ConsolePage
        runtimeDriver="uv"
        tasks={[]}
        logs={[]}
        autoScroll={true}
        wrapLines={true}
        onSetAutoScroll={() => undefined}
        onSetWrapLines={() => undefined}
        onClearLogs={() => undefined}
        onExportLogs={() => undefined}
      />,
    );

    expect(screen.getByText('尚无运行日志')).toBeInTheDocument();
    expect(
      screen.getByText('开始检查环境或下载资源后，这里会显示结构化事件和原始输出'),
    ).toBeInTheDocument();
    expect(screen.getByText('运行驱动 uv')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部复制' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '导出日志' })).toBeDisabled();
  });

  it('renders runtime queue metadata and triggers toolbar actions', async () => {
    const user = userEvent.setup();
    const onClearLogs = vi.fn();
    const onExportLogs = vi.fn();

    render(
      <ConsolePage
        runtimeDriver="uv"
        tasks={[
          {
            taskId: 'task-1',
            target: 'genie-base',
            label: 'GenieData 基础资源',
            status: 'downloading',
            message: '正在下载',
            progressCurrent: 1,
            progressTotal: 3,
            updatedAt: '1712300001',
          },
        ]}
        logs={[
          {
            id: 'log-1',
            time: '14:30:00',
            kind: 'system',
            text: 'genie-base: 正在下载',
          },
        ]}
        autoScroll={true}
        wrapLines={true}
        onSetAutoScroll={() => undefined}
        onSetWrapLines={() => undefined}
        onClearLogs={onClearLogs}
        onExportLogs={onExportLogs}
      />,
    );

    expect(screen.getByText('运行驱动 uv')).toBeInTheDocument();
    expect(screen.getByText('当前任务 GenieData 基础资源')).toBeInTheDocument();
    expect(screen.getByText('genie-base: 正在下载')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '清空日志' }));
    expect(onClearLogs).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '导出日志' }));
    expect(onExportLogs).toHaveBeenCalled();
  });
});
