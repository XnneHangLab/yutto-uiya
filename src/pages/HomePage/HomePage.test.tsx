import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { HomePage } from './HomePage';
import type { ManagedFolderItem } from '../../services/runtime/runtime';

describe('HomePage', () => {
  const folders: ManagedFolderItem[] = [
    { key: 'workspace', title: '根目录', path: '/repo', icon: '📁' },
    { key: 'downloads', title: '下载目录', path: '/repo/downloads', icon: '⬇' },
  ];

  it('renders managed folders and notice panel', () => {
    render(
      <HomePage
        folders={folders}
        onOpenPath={() => undefined}
        onOpenModels={() => undefined}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'yutto-uiya' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: '文件夹' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: '公告' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开 根目录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打开 下载目录' })).toBeInTheDocument();
    expect(screen.getByText('yutto-uiya v0.0.3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '前往下载' })).toBeInTheDocument();
  });

  it('opens managed paths and navigates to download page through callbacks', async () => {
    const user = userEvent.setup();
    const onOpenPath = vi.fn();
    const onOpenModels = vi.fn();

    render(
      <HomePage
        folders={folders}
        onOpenPath={onOpenPath}
        onOpenModels={onOpenModels}
      />,
    );

    await user.click(screen.getByRole('button', { name: '打开 下载目录' }));
    expect(onOpenPath).toHaveBeenCalledWith('downloads');

    await user.click(screen.getByRole('button', { name: '前往下载' }));
    expect(onOpenModels).toHaveBeenCalledTimes(1);
  });
});
