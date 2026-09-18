import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../../components/AppShell/AppShell';
import styles from '../../components/AppShell/AppShell.module.css';

function renderShell(overrides: Partial<Parameters<typeof AppShell>[0]> = {}) {
  const onDetailsOpenChange = vi.fn();
  const view = render(
    <AppShell
      mapPanel={<div>Map</div>}
      detailsPanel={<div>Panel content</div>}
      timeline={<div>Timeline</div>}
      detailsOpen={false}
      onDetailsOpenChange={onDetailsOpenChange}
      isMobile={false}
      {...overrides}
    />,
  );
  return { onDetailsOpenChange, ...view };
}

describe('AppShell', () => {
  it('shows a static details aside on desktop without drawer chrome', () => {
    renderShell({ isMobile: false, detailsOpen: false });

    expect(screen.getByRole('complementary', { name: 'Tract details' })).toBeVisible();
    expect(screen.getByText('Panel content')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Show tract details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close details' })).not.toBeInTheDocument();
    expect(document.querySelector(`.${styles.backdrop}`)).not.toBeInTheDocument();
  });

  it('hides the details panel on mobile when the drawer is closed', () => {
    renderShell({ isMobile: true, detailsOpen: false });

    const tab = screen.getByRole('button', { name: 'Show tract details' });
    expect(tab).toBeVisible();
    expect(tab).toHaveAttribute('aria-expanded', 'false');

    const aside = document.getElementById('details-panel');
    expect(aside).toHaveAttribute('aria-hidden', 'true');
    expect(aside).toHaveAttribute('inert');
    expect(screen.queryByRole('button', { name: 'Close details' })).not.toBeInTheDocument();
  });

  it('shows close control and backdrop when the mobile drawer is open', async () => {
    const user = userEvent.setup();
    const { onDetailsOpenChange } = renderShell({ isMobile: true, detailsOpen: true });

    expect(screen.getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Close details' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Tract details' })).toBeVisible();
    expect(screen.getByText('Panel content')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Close details' }));
    expect(onDetailsOpenChange).toHaveBeenCalledWith(false);

    const backdrop = document.querySelector(`.${styles.backdrop}`);
    expect(backdrop).toBeTruthy();
    await user.click(backdrop!);
    expect(onDetailsOpenChange).toHaveBeenCalledWith(false);
  });

  it('toggles the drawer from the edge tab', async () => {
    const user = userEvent.setup();
    const { onDetailsOpenChange } = renderShell({ isMobile: true, detailsOpen: false });

    await user.click(screen.getByRole('button', { name: 'Show tract details' }));
    expect(onDetailsOpenChange).toHaveBeenCalledWith(true);
  });

  it('closes the open mobile drawer on Escape', async () => {
    const user = userEvent.setup();
    const { onDetailsOpenChange } = renderShell({ isMobile: true, detailsOpen: true });

    await user.keyboard('{Escape}');
    expect(onDetailsOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not close on Escape when the drawer is closed or on desktop', async () => {
    const user = userEvent.setup();
    const closed = renderShell({ isMobile: true, detailsOpen: false });
    await user.keyboard('{Escape}');
    expect(closed.onDetailsOpenChange).not.toHaveBeenCalled();
    closed.unmount();

    const desktop = renderShell({ isMobile: false, detailsOpen: true });
    await user.keyboard('{Escape}');
    expect(desktop.onDetailsOpenChange).not.toHaveBeenCalled();
  });
});
