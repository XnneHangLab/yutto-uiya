import { render, screen } from '@testing-library/react';
import { Topbar } from './Topbar';

describe('Topbar', () => {
  it('marks the title area as a tauri drag region', () => {
    render(<Topbar title="UI 复刻预览" />);

    const dragNode = screen
      .getByText('UI 复刻预览')
      .closest('[data-tauri-drag-region]');

    expect(dragNode).not.toBeNull();
  });
});
