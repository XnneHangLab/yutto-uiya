import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import '../styles/tokens.css';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the launcher shell controls', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: '帮助' })).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: '窗口控制' }),
    ).toBeInTheDocument();
  });

  it('applies day theme from storage to launcher root', () => {
    localStorage.setItem('xnnehanglab.theme', 'day');

    const { container } = render(<App />);
    const launcherRoot = container.querySelector('.launcher-root');
    const navHome = screen.getAllByRole('button', { name: '一键启动' })[0];
    const navStyles = getComputedStyle(navHome);
    const rootStyles = getComputedStyle(launcherRoot as Element);

    expect(launcherRoot).toHaveAttribute(
      'data-theme',
      'day',
    );
    expect(rootStyles.getPropertyValue('--text').trim()).toBe('#182231');
    expect(navStyles.color).toBe('var(--text)');
  });

  it('applies day input colors in settings page', async () => {
    const user = userEvent.setup();
    localStorage.setItem('xnnehanglab.theme', 'day');

    render(<App />);

    await user.click(screen.getByRole('button', { name: '设置' }));

    expect(screen.getByLabelText('工作目录路径')).toBeInTheDocument();
    const launcherRoot = document.querySelector('.launcher-root');
    const rootStyles = getComputedStyle(launcherRoot as Element);

    expect(rootStyles.getPropertyValue('--input-bg').trim()).toBe('#fcfeff');
    expect(rootStyles.getPropertyValue('--input-text').trim()).toBe('#182231');
  });
});
