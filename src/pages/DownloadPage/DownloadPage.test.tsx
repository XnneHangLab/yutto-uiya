import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { DownloadPage } from './DownloadPage';
import { DEFAULT_DOWNLOAD_OPTIONS } from '../../services/runtime/runtime';

describe('DownloadPage', () => {
  it('renders grouped parse results collapsed by default and expands on demand', async () => {
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
            title: '单个视频',
            url: 'https://www.bilibili.com/video/BV1xx411c7mD',
            dir: '',
          },
        ]}
        parseGroups={[
          {
            title: '分组合集',
            dir: '分组合集',
            items: [
              {
                index: 2,
                title: '合集视频 1',
                url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
                dir: '分组合集',
              },
              {
                index: 3,
                title: '合集视频 2',
                url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
                dir: '分组合集',
              },
            ],
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

    expect(screen.getByText('单个视频')).toBeInTheDocument();
    expect(screen.getByText('分组合集')).toBeInTheDocument();
    expect(screen.getByText('2 个视频')).toBeInTheDocument();
    expect(screen.queryByText('合集视频 1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '展开分组 分组合集' }));

    expect(screen.getByText('合集视频 1')).toBeInTheDocument();
    expect(screen.getByText('合集视频 2')).toBeInTheDocument();
  });

  it('selects the whole group from the group checkbox', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [parseSelected, setParseSelected] = useState<Set<number>>(new Set());

      return (
        <DownloadPage
          tasks={[]}
          onDownload={() => undefined}
          onParse={vi.fn()}
          scriptsReady
          parseItems={[]}
          parseGroups={[
            {
              title: '分组合集',
              dir: '分组合集',
              items: [
                {
                  index: 2,
                  title: '合集视频 1',
                  url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
                  dir: '分组合集',
                },
                {
                  index: 3,
                  title: '合集视频 2',
                  url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
                  dir: '分组合集',
                },
              ],
            },
          ]}
          parseSelected={parseSelected}
          onParseSelectedChange={setParseSelected}
          onClearParseItems={() => undefined}
          downloadUrl=""
          onDownloadUrlChange={() => undefined}
          parseVideoQualities={[]}
          downloadOptions={DEFAULT_DOWNLOAD_OPTIONS}
          onDownloadOptionsChange={() => undefined}
          onCancelTask={() => undefined}
          onOpenDownloadsFolder={() => undefined}
        />
      );
    }

    render(<Harness />);

    await user.click(screen.getByRole('checkbox', { name: '选择分组 分组合集' }));
    await user.click(screen.getByRole('button', { name: '展开分组 分组合集' }));

    expect(screen.getByRole('checkbox', { name: '选择视频 合集视频 1' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '选择视频 合集视频 2' })).toBeChecked();
    expect(screen.getByRole('button', { name: '下载所选 (2)' })).toBeEnabled();
  });

  it('shows embedded metadata in detail panel without async fetch', async () => {
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
            title: '不是AI，我用相机实拍了40首古诗词里的中国',
            url: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
            dir: '',
            uploader: '影视飓风',
            description: '用相机拍古诗词',
            duration: 754,
            view: 1200000,
          },
        ]}
        parseGroups={[]}
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

    await user.click(screen.getByRole('button', { name: '详情' }));

    expect(screen.getByText('影视飓风')).toBeInTheDocument();
    expect(screen.getByText('用相机拍古诗词')).toBeInTheDocument();
  });
});
