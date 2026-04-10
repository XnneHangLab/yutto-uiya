import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { DownloadPage } from './DownloadPage';
import { DEFAULT_DOWNLOAD_OPTIONS } from '../../services/runtime/runtime';

vi.mock('../../services/runtime/bridge', () => ({
  fetchVideoMeta: vi.fn().mockResolvedValue({
    title: '不是AI，我用相机实拍了40首古诗词里的中国',
    cover: '',
    description: 'desc',
    uploader: 'up',
    pubdate: 0,
    duration: 12,
    view: 34,
    like: 5,
  }),
}));

describe('DownloadPage', () => {
  it('keeps parse title after opening details', async () => {
    const user = userEvent.setup();

    render(
      <DownloadPage
        tasks={[]}
        onDownload={() => undefined}
        onParse={vi.fn()}
        scriptsReady
        parseItems={[
          {
            index: 1,
            title: 'mmexport1768031333059',
            url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
            dir: '',
          },
        ]}
        parseSelected={new Set([1])}
        onParseSelectedChange={() => undefined}
        onClearParseItems={() => undefined}
        downloadUrl=""
        onDownloadUrlChange={() => undefined}
        parseVideoQualities={[]}
        downloadOptions={DEFAULT_DOWNLOAD_OPTIONS}
        onDownloadOptionsChange={() => undefined}
        onCancelTask={() => undefined}
        onOpenDownloadsFolder={() => undefined}
      />,
    );

    expect(screen.getByText('mmexport1768031333059')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '详情' }));

    await waitFor(() =>
      expect(
        screen.getByText('不是AI，我用相机实拍了40首古诗词里的中国'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('mmexport1768031333059')).toBeInTheDocument();
  });
});
