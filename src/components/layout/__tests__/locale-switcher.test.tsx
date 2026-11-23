import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider, LOCALE_COOKIE_NAME, LOCALE_STORAGE_KEY } from '@/i18n'

const mockUsePathname = jest.fn<string, []>()
const signOutMock = jest.fn()

jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'staff-1',
        name: 'Ops Admin',
        email: 'admin@commercelab.vn',
        roles: ['ADMIN'],
        warehouseScopes: ['WH-HCM-01'],
      },
    },
    status: 'authenticated',
  }),
  signOut: (options: unknown) => signOutMock(options),
}))

jest.mock('@/components/notifications/notification-bell', () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}))

import { AccountMenu } from '../account-menu'
import { AdminShell } from '../admin-shell'
import { LocaleSwitcher } from '../locale-switcher'
import { SiteFooter } from '../site-footer'
import { FallbackCategoryNav, HeaderSearchForm } from '../site-header-controls'
import { SkipLink } from '../skip-link'

function resetLocalePersistence() {
  window.localStorage.removeItem(LOCALE_STORAGE_KEY)
  document.cookie = `${LOCALE_COOKIE_NAME}=; path=/; max-age=0`
  document.documentElement.lang = 'en'
}

describe('LocaleSwitcher across Storefront and Backoffice shells', () => {
  beforeEach(() => {
    resetLocalePersistence()
    mockUsePathname.mockReturnValue('/admin')
    signOutMock.mockReset()
  })

  it('switches Storefront header controls, skip link, account menu, and footer between EN and VI', async () => {
    const user = userEvent.setup()
    render(
      <I18nProvider>
        <SkipLink />
        <LocaleSwitcher />
        <HeaderSearchForm />
        <AccountMenu />
        <FallbackCategoryNav />
        <SiteFooter />
      </I18nProvider>
    )

    const enButton = screen.getByRole('button', { name: 'EN' })
    const viButton = screen.getByRole('button', { name: 'VI' })

    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument()
    expect(enButton).toHaveAttribute('aria-pressed', 'true')
    expect(viButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByPlaceholderText('Search products')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Backpacks' }).length).toBeGreaterThan(0)

    await user.click(viButton)

    expect(screen.getByRole('group', { name: 'Ngôn ngữ' })).toBeInTheDocument()
    expect(enButton).toHaveAttribute('aria-pressed', 'false')
    expect(viButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByPlaceholderText('Tìm kiếm sản phẩm')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tìm kiếm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tài khoản' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chuyển tới nội dung chính' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Balo' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Mua sắm' })).toBeInTheDocument()

    await user.click(enButton)

    expect(enButton).toHaveAttribute('aria-pressed', 'true')
    expect(viButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByPlaceholderText('Search products')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument()
  })

  it('switches Backoffice header and all sidebar group and link labels between EN and VI', async () => {
    const user = userEvent.setup()
    render(
      <I18nProvider>
        <AdminShell>
          <div>Dashboard body</div>
        </AdminShell>
      </I18nProvider>
    )

    expect(screen.getByRole('link', { name: 'View shop' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Backoffice' })).toBeInTheDocument()
    expect(screen.getByText('Sales')).toBeInTheDocument()
    expect(screen.getByText('Catalogue')).toBeInTheDocument()
    expect(screen.getByText('Marketing')).toBeInTheDocument()
    expect(screen.getByText('Warehouse')).toBeInTheDocument()
    expect(screen.getByText('Finance')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'OLAP Analytics' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Staff users' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'VI' }))

    expect(screen.getByRole('link', { name: 'Xem cửa hàng' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Quản trị' })).toBeInTheDocument()
    expect(screen.getByText('Bán hàng')).toBeInTheDocument()
    expect(screen.getByText('Danh mục sản phẩm')).toBeInTheDocument()
    expect(screen.getByText('Tiếp thị')).toBeInTheDocument()
    expect(screen.getByText('Kho vận')).toBeInTheDocument()
    expect(screen.getByText('Tài chính')).toBeInTheDocument()
    expect(screen.getByText('Cài đặt')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Phân tích OLAP' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Đơn hàng' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Trả hàng' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Hồ sơ ngoại lệ' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sản phẩm' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Danh mục' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bảng giá' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mã giảm giá' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chiến dịch' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tồn kho' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mua hàng' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vận đơn' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sổ cái' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Phê duyệt' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nhân sự' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(screen.getByRole('link', { name: 'View shop' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Staff users' })).toBeInTheDocument()
  })
})
