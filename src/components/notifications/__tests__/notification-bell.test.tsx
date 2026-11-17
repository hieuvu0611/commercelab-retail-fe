import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationBell } from '../notification-bell'
import { getMockNotificationState } from '@/notifications/mock-notifications'

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('NotificationBell (P11-T06)', () => {
  const prevMockMode = process.env.NEXT_PUBLIC_MOCK_MODE

  beforeAll(() => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'true'
  })

  afterAll(() => {
    process.env.NEXT_PUBLIC_MOCK_MODE = prevMockMode
  })

  beforeEach(() => {
    // Reset mock state
    const s = getMockNotificationState()
    s.items.set('test-user', [
      {
        notificationId: 'N-1',
        eventId: 'E-1',
        recipientId: 'test-user',
        channel: 'IN_APP',
        category: 'ORDER_CONFIRMED',
        title: 'Order Confirmed',
        message: 'Your order O-001 is being packed',
        isRead: false,
        createdAt: new Date().toISOString(),
      },
    ])
  })

  it('renders the notification bell and displays the unread badge', async () => {
    renderWithClient(<NotificationBell recipientId="test-user" />)

    const bellBtn = screen.getByRole('button', { name: /Notifications/i })
    expect(bellBtn).toBeInTheDocument()

    await waitFor(() => {
      const badge = screen.getByTestId('notification-badge')
      expect(badge).toHaveTextContent('1')
    })
  })

  it('opens dialog on click and displays notification list', async () => {
    renderWithClient(<NotificationBell recipientId="test-user" />)

    const bellBtn = screen.getByRole('button', { name: /Notifications/i })
    fireEvent.click(bellBtn)

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Notification inbox/i })).toBeInTheDocument()
      expect(screen.getByText('Order Confirmed')).toBeInTheDocument()
      expect(screen.getByText('Your order O-001 is being packed')).toBeInTheDocument()
    })
  })

  it('marks all notifications as read when clicking "Mark all read"', async () => {
    renderWithClient(<NotificationBell recipientId="test-user" />)

    const bellBtn = screen.getByRole('button', { name: /Notifications/i })
    fireEvent.click(bellBtn)

    await waitFor(() => {
      expect(screen.getByText('Mark all read')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Mark all read'))

    await waitFor(() => {
      expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument()
    })
  })
})
