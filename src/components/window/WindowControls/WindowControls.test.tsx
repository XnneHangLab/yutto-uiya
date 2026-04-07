import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WindowControls } from './WindowControls';
import {
  closeWindow,
  minimizeWindow,
  toggleMaximizeWindow,
} from '../../../services/desktop/window';

vi.mock('../../../services/desktop/window', () => ({
  minimizeWindow: vi.fn(async () => undefined),
  toggleMaximizeWindow: vi.fn(async () => undefined),
  closeWindow: vi.fn(async () => undefined),
}));

describe('WindowControls', () => {
  it('calls the desktop service when the buttons are clicked', async () => {
    const user = userEvent.setup();

    render(<WindowControls />);

    await user.click(screen.getByRole('button', { name: '最小化窗口' }));
    await user.click(screen.getByRole('button', { name: '切换最大化窗口' }));
    await user.click(screen.getByRole('button', { name: '关闭窗口' }));

    expect(minimizeWindow).toHaveBeenCalledTimes(1);
    expect(toggleMaximizeWindow).toHaveBeenCalledTimes(1);
    expect(closeWindow).toHaveBeenCalledTimes(1);
  });
});
