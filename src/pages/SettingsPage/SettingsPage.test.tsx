import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  it('renders settings controls and switches tabs', async () => {
    const user = userEvent.setup();
    const onChooseWorkspaceRoot = vi.fn();
    const onUseRepoWorkspaceRoot = vi.fn();
    const onChoosePythonExe = vi.fn().mockResolvedValue(null);
    const onSave = vi.fn();

    render(
      <SettingsPage
        workspaceRoot="/repo"
        workspaceLocked={false}
        environmentProbe={{
          workspaceRoot: '/repo',
          repoRoot: '/repo',
          status: 'torch-cpu-ready',
          mode: 'cpu',
          torchAvailable: true,
          torchVersion: '2.6.0+cpu',
          cudaAvailable: false,
          issues: [],
          message: 'torch 已就绪: CPU',
        }}
        onChooseWorkspaceRoot={onChooseWorkspaceRoot}
        onUseRepoWorkspaceRoot={onUseRepoWorkspaceRoot}
        runtimeDriver="uv"
        pythonExePath=""
        onChoosePythonExe={onChoosePythonExe}
        onSave={onSave}
      />,
    );

    expect(
      screen.getByRole('tab', { name: '一般设置', selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '一般设置' })).toHaveAttribute(
      'id',
      'settings-tab-general',
    );
    expect(screen.getByRole('tab', { name: '一般设置' })).toHaveAttribute(
      'aria-controls',
      'settings-panel-general',
    );
    expect(screen.getByRole('tabpanel', { name: '一般设置' })).toHaveAttribute(
      'id',
      'settings-panel-general',
    );
    expect(screen.getByLabelText('工作目录路径')).toHaveValue('/repo');
    expect(screen.getByText('CPU 就绪')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '更改目录' }));
    expect(onChooseWorkspaceRoot).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '重置为项目目录' }));
    expect(onUseRepoWorkspaceRoot).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '保存并重新检测' }));
    expect(onSave).toHaveBeenCalledWith('uv', '');

    await user.click(screen.getByRole('tab', { name: '关于' }));
    expect(screen.getByRole('tabpanel', { name: '关于' })).toHaveAttribute(
      'id',
      'settings-panel-about',
    );
    expect(
      screen.getByText('这里仅仅只是一个占位，这里还什么都没有 ...'),
    ).toBeInTheDocument();
  });

  it('disables workspace switching while queue is active', () => {
    render(
      <SettingsPage
        workspaceRoot="/repo"
        workspaceLocked
        environmentProbe={{
          workspaceRoot: '/repo',
          repoRoot: '/repo',
          status: 'torch-unavailable',
          mode: null,
          torchAvailable: false,
          torchVersion: null,
          cudaAvailable: false,
          issues: ['No module named torch'],
          message: 'torch 不可用',
        }}
        onChooseWorkspaceRoot={() => undefined}
        onUseRepoWorkspaceRoot={() => undefined}
        runtimeDriver="uv"
        pythonExePath=""
        onChoosePythonExe={vi.fn().mockResolvedValue(null)}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '更改目录' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重置为项目目录' })).toBeDisabled();
  });

  it('shows python exe path input when conda driver is selected', async () => {
    const user = userEvent.setup();

    render(
      <SettingsPage
        workspaceRoot="/repo"
        workspaceLocked={false}
        environmentProbe={null}
        onChooseWorkspaceRoot={() => undefined}
        onUseRepoWorkspaceRoot={() => undefined}
        runtimeDriver="uv"
        pythonExePath=""
        onChoosePythonExe={vi.fn().mockResolvedValue(null)}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Python 可执行文件路径')).not.toBeInTheDocument();

    const driverRow = screen.getByText('Python 运行方式').closest('.setting-row');
    expect(driverRow).not.toBeNull();
    expect(within(driverRow as HTMLElement).getByText('🐍')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'conda' }));

    expect(screen.getByLabelText('Python 可执行文件路径')).toBeInTheDocument();

    const pythonExeRow = screen.getByText('Python 可执行文件').closest('.setting-row');
    expect(pythonExeRow).not.toBeNull();
    expect(within(pythonExeRow as HTMLElement).getByText('🐍')).toBeInTheDocument();
  });
});
