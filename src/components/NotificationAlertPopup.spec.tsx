import { describe, expect, it, vi } from 'vitest';
import { makeNotification } from '../../test/factories';
import { renderWithProviders, screen } from '../../test/renderWithProviders';
import NotificationAlertPopup from './NotificationAlertPopup';

describe('NotificationAlertPopup', () => {
  it('renders nothing when there is no notification', () => {
    const { container } = renderWithProviders(
      <NotificationAlertPopup notification={null} onAcknowledge={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the notification title and message', () => {
    renderWithProviders(
      <NotificationAlertPopup
        notification={makeNotification({ title: 'New task', message: 'From: Mia — Swap switch' })}
        onAcknowledge={vi.fn()}
      />,
    );
    expect(screen.getByText('New task')).toBeInTheDocument();
    expect(screen.getByText(/swap switch/i)).toBeInTheDocument();
  });

  it('acknowledges the notification by id when OK is pressed', async () => {
    const onAcknowledge = vi.fn();
    const notification = makeNotification({ id: 'ntf-77' });
    const { user } = renderWithProviders(
      <NotificationAlertPopup notification={notification} onAcknowledge={onAcknowledge} />,
    );
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(onAcknowledge).toHaveBeenCalledWith('ntf-77');
  });

  it('shows the queue hint only when more notifications are waiting', () => {
    const { rerender } = renderWithProviders(
      <NotificationAlertPopup notification={makeNotification()} onAcknowledge={vi.fn()} queueCount={0} />,
    );
    expect(screen.queryByText(/more waiting/i)).not.toBeInTheDocument();

    rerender(<NotificationAlertPopup notification={makeNotification()} onAcknowledge={vi.fn()} queueCount={3} />);
    expect(screen.getByText(/\+3 more waiting/i)).toBeInTheDocument();
  });
});
