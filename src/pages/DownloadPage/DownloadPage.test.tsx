import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { vi } from 'vitest';
import { fetchCoverImage } from '../../services/runtime/bridge';
import {
  DEFAULT_DOWNLOAD_OPTIONS,
  type VideoParseItem,
} from '../../services/runtime/runtime';
import { DownloadPage } from './DownloadPage';

vi.mock('../../services/runtime/bridge', () => ({
  fetchCoverImage: vi.fn(),
}));

const COVER_URL = 'https://i0.hdslb.com/bfs/archive/test-cover.jpg';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Mimics AppShell's parse flow: one item streams in mid-parse (with its cover
 * link already known), then — once the gate opens — the authoritative rebuild
 * REPLACES the item array before the onParse promise resolves.
 */
function AutoFetchHarness({ gate }: { gate: Promise<void> }) {
  const [parseItems, setParseItems] = useState<VideoParseItem[]>([]);
  const [parseSelected, setParseSelected] = useState<Set<number>>(new Set());

  async function onParse(url: string): Promise<VideoParseItem[]> {
    setParseItems([
      { index: 1, title: '测试视频', url, dir: '', cover: COVER_URL },
    ]);
    await gate;
    const rebuilt = [
      { index: 1, title: '测试视频', url, dir: '', cover: COVER_URL },
    ];
    setParseItems(rebuilt);
    return rebuilt;
  }

  return (
    <DownloadPage
      tasks={[]}
      onDownload={() => undefined}
      onParse={onParse}
      scriptsReady
      parseItems={parseItems}
      parseGroups={[]}
      parseSelected={parseSelected}
      onParseSelectedChange={setParseSelected}
      onClearParseItems={() => setParseItems([])}
      downloadUrl="https://www.bilibili.com/video/BV1xx411c7mD"
      onDownloadUrlChange={() => undefined}
      parseVideoQualities={[]}
      parseAudioQualities={[]}
      downloadOptions={DEFAULT_DOWNLOAD_OPTIONS}
      onDownloadOptionsChange={() => undefined}
      onCancelTask={() => undefined}
      onOpenDownloadsFolder={() => undefined}
    />
  );
}

describe('DownloadPage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

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
        parseAudioQualities={[]}
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
    // 合集视频 2 appears in both the list row and its auto-expanded detail panel
    expect(screen.getAllByText('合集视频 2')[0]).toBeInTheDocument();
  });

  it('selects the whole group from the group checkbox', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [parseSelected, setParseSelected] = useState<Set<number>>(
        new Set(),
      );

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
          parseAudioQualities={[]}
          downloadOptions={DEFAULT_DOWNLOAD_OPTIONS}
          onDownloadOptionsChange={() => undefined}
          onCancelTask={() => undefined}
          onOpenDownloadsFolder={() => undefined}
        />
      );
    }

    render(<Harness />);

    await user.click(
      screen.getByRole('checkbox', { name: '选择分组 分组合集' }),
    );
    await user.click(screen.getByRole('button', { name: '展开分组 分组合集' }));

    expect(
      screen.getByRole('checkbox', { name: '选择视频 合集视频 1' }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: '选择视频 合集视频 2' }),
    ).toBeChecked();
    expect(screen.getByRole('button', { name: '下载所选 (2)' })).toBeEnabled();
  });

  it('shows embedded metadata in detail panel without async fetch', async () => {
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
        parseAudioQualities={[]}
        downloadOptions={DEFAULT_DOWNLOAD_OPTIONS}
        onDownloadOptionsChange={() => undefined}
        onCancelTask={() => undefined}
        onOpenDownloadsFolder={() => undefined}
      />,
    );

    // Detail auto-expands for the last parsed item — no click needed.
    expect(screen.getByText('影视飓风')).toBeInTheDocument();
    expect(screen.getByText('用相机拍古诗词')).toBeInTheDocument();
  });

  it('animates only the running task; queued tasks wait without a bar', () => {
    render(
      <DownloadPage
        tasks={[
          {
            taskId: 't1',
            target: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
            label: '正在下载的视频',
            status: 'downloading',
            message: '开始下载',
            progressCurrent: 1,
            progressTotal: 3,
            updatedAt: '1712300001',
            saveDir: '',
          },
          {
            taskId: 't2',
            target: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
            label: '排队等待的视频',
            status: 'queued',
            message: '已进入下载队列',
            progressCurrent: 0,
            progressTotal: 3,
            updatedAt: '1712300001',
            saveDir: '',
          },
        ]}
        onDownload={() => undefined}
        onParse={vi.fn()}
        scriptsReady
        parseItems={[]}
        parseGroups={[]}
        parseSelected={new Set()}
        onParseSelectedChange={() => undefined}
        onClearParseItems={() => undefined}
        downloadUrl=""
        onDownloadUrlChange={() => undefined}
        parseVideoQualities={[]}
        parseAudioQualities={[]}
        downloadOptions={DEFAULT_DOWNLOAD_OPTIONS}
        onDownloadOptionsChange={() => undefined}
        onCancelTask={() => undefined}
        onOpenDownloadsFolder={() => undefined}
      />,
    );

    // 服务端串行执行：动画进度条只属于正在执行的任务，排队中的安静等待。
    expect(screen.getAllByText('详细进度请前往控制台查看')).toHaveLength(1);
    expect(screen.getByText('排队中')).toBeInTheDocument();
    expect(screen.getByText('下载中')).toBeInTheDocument();
    // 排队中的任务仍然可以取消。
    expect(screen.getAllByTitle('取消')).toHaveLength(2);
  });

  it('renders a real progress bar once byte progress is known', () => {
    render(
      <DownloadPage
        tasks={[
          {
            taskId: 't1',
            target: 'https://www.bilibili.com/video/BV1xx411c7mD?p=1',
            label: '正在下载的视频',
            status: 'downloading',
            message: '开始下载',
            progressCurrent: 1,
            progressTotal: 3,
            updatedAt: '1712300001',
            saveDir: '',
            percent: 45,
            downloaded: '45.0 MiB',
            totalSize: '100.0 MiB',
            speed: '2.4 MiB/s',
            stageDesc: '下载中',
          },
        ]}
        onDownload={() => undefined}
        onParse={vi.fn()}
        scriptsReady
        parseItems={[]}
        parseGroups={[]}
        parseSelected={new Set()}
        onParseSelectedChange={() => undefined}
        onClearParseItems={() => undefined}
        downloadUrl=""
        onDownloadUrlChange={() => undefined}
        parseVideoQualities={[]}
        parseAudioQualities={[]}
        downloadOptions={DEFAULT_DOWNLOAD_OPTIONS}
        onDownloadOptionsChange={() => undefined}
        onCancelTask={() => undefined}
        onOpenDownloadsFolder={() => undefined}
      />,
    );

    // 有字节进度时显示真实进度条与速率，不再提示去控制台。
    expect(
      screen.getByText('下载中 45% · 45.0 MiB / 100.0 MiB · 2.4 MiB/s'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('详细进度请前往控制台查看'),
    ).not.toBeInTheDocument();
    const fill = document.querySelector('.models-page__progressbar-fill');
    expect(fill).toHaveStyle({ width: '45%' });
  });

  it('auto-fetches the cover only after parsing is over plus a settle delay', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchCoverImage).mockResolvedValue('data:image/jpeg;base64,Zm9v');

    const gate = deferred();
    render(<AutoFetchHarness gate={gate.promise} />);

    fireEvent.click(screen.getByRole('button', { name: '解析' }));

    // The cover LINK is already known from the streamed item, but parsing is
    // still running — no fetch may happen, however long we wait.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchCoverImage).not.toHaveBeenCalled();

    // Parse finishes (rebuild lands, promise resolves) — still no fetch until
    // the settle delay has passed.
    await act(async () => {
      gate.resolve();
    });
    expect(fetchCoverImage).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchCoverImage).toHaveBeenCalledTimes(1);
    expect(fetchCoverImage).toHaveBeenCalledWith(COVER_URL);
    // Fetched cover renders in the auto-expanded detail panel.
    expect(screen.getByAltText('测试视频')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '封面' })).toBeInTheDocument();
  });

  it('parks the cover button at a visible retry state when every attempt fails', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchCoverImage).mockRejectedValue(new Error('proxy down'));

    const gate = deferred();
    render(<AutoFetchHarness gate={gate.promise} />);

    fireEvent.click(screen.getByRole('button', { name: '解析' }));
    await act(async () => {
      gate.resolve();
    });

    // Settle delay fires the fetch; two 500ms retries follow, all failing.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchCoverImage).toHaveBeenCalledTimes(3);
    const retryButton = screen.getByRole('button', { name: '加载失败，重试' });

    // Clicking the parked button retries and can recover.
    vi.mocked(fetchCoverImage).mockResolvedValue('data:image/jpeg;base64,b2s=');
    fireEvent.click(retryButton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByAltText('测试视频')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '封面' })).toBeInTheDocument();
  });
});
