import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ModelsPage } from './ModelsPage';

describe('ModelsPage', () => {
  it('renders model cards and queue entries', async () => {
    const user = userEvent.setup();
    const onDownloadGenieBase = vi.fn();
    const onDownloadGsvLite = vi.fn();

    render(
      <ModelsPage
        inspection={{
          managedPaths: [
            { key: 'workspace', path: '/repo' },
          ],
          downloadDir: '/repo/downloads',
          sessData: false,
          ffmpegPath: 'ffmpeg',
          noProxy: false,
        }}
        environmentProbe={null}
        tasks={[
          {
            taskId: 'task-1',
            target: 'genie-base',
            label: 'GenieData 基础资源',
            status: 'downloading',
            message: '正在下载',
            progressCurrent: 1,
            progressTotal: 3,
            updatedAt: '1712300000',
            saveDir: '',
          },
        ]}
        onDownloadGenieBase={onDownloadGenieBase}
        onDownloadGsvLite={onDownloadGsvLite}
        onDownloadQwenTts06b={() => undefined}
        onDownloadQwenTts17b={() => undefined}
        onDownloadLumingGenieTts={() => undefined}
        scriptsReady
      />,
    );

    expect(screen.getByRole('heading', { name: '模型管理' })).toBeInTheDocument();
    expect(screen.getByText('Genie-TTS 基础资源')).toBeInTheDocument();
    expect(screen.getByText('GSV-Lite 数据包')).toBeInTheDocument();
    expect(screen.getByText('正在下载')).toBeInTheDocument();
    expect(screen.getAllByText('未检测').length).toBeGreaterThan(0);

    const downloadBtns = screen.getAllByRole('button', { name: '下载' });
    await user.click(downloadBtns[0]);
    expect(onDownloadGenieBase).toHaveBeenCalledTimes(1);
  });

  it('disables all download buttons when scripts are not ready', () => {
    render(
      <ModelsPage
        inspection={null}
        environmentProbe={null}
        tasks={[]}
        onDownloadGenieBase={() => undefined}
        onDownloadGsvLite={() => undefined}
        onDownloadQwenTts06b={() => undefined}
        onDownloadQwenTts17b={() => undefined}
        onDownloadLumingGenieTts={() => undefined}
        scriptsReady={false}
      />,
    );

    const downloadBtns = screen.getAllByRole('button', { name: '下载' });
    for (const btn of downloadBtns) {
      expect(btn).toBeDisabled();
    }
    expect(screen.getByText('运行环境未就绪，暂时无法执行下载。')).toBeInTheDocument();
  });

  it('disables gsv-lite download in cpu mode', () => {
    render(
      <ModelsPage
        inspection={null}
        environmentProbe={null}
        tasks={[]}
        onDownloadGenieBase={() => undefined}
        onDownloadGsvLite={() => undefined}
        onDownloadQwenTts06b={() => undefined}
        onDownloadQwenTts17b={() => undefined}
        onDownloadLumingGenieTts={() => undefined}
        gpuReady={false}
        scriptsReady
      />,
    );

    const downloadBtns = screen.getAllByRole('button', { name: '下载' });
    expect(downloadBtns[0]).not.toBeDisabled(); // genie-base (cpu ok)
    expect(downloadBtns[1]).not.toBeDisabled(); // luming-genie-tts (cpu ok)
    expect(downloadBtns[2]).toBeDisabled();     // gsv-lite (gpu only)
  });
});
