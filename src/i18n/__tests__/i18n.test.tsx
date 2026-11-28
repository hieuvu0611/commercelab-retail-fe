import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEFAULT_LOCALE,
  I18nProvider,
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  en,
  isLocale,
  translate,
  useI18n,
  vi,
} from '@/i18n'

function Consumer() {
  const { locale, setLocale, t } = useI18n()
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="label">{t('header.cart')}</span>
      <span data-testid="interpolated">{t('header.cartWithCount', { count: 4 })}</span>
      <button type="button" onClick={() => setLocale('vi')}>
        Set VI
      </button>
      <button type="button" onClick={() => setLocale('en')}>
        Set EN
      </button>
    </div>
  )
}

function clearLocalePersistence() {
  window.localStorage.removeItem(LOCALE_STORAGE_KEY)
  document.cookie = `${LOCALE_COOKIE_NAME}=; path=/; max-age=0`
  document.documentElement.lang = 'en'
}

describe('i18n dictionaries and provider', () => {
  beforeEach(() => {
    clearLocalePersistence()
  })

  it('maintains 100% key parity and non-empty values between en and vi dictionaries', () => {
    const enKeys = Object.keys(en).sort()
    const viKeys = Object.keys(vi).sort()

    expect(viKeys).toEqual(enKeys)
    for (const key of enKeys as Array<keyof typeof en>) {
      expect(en[key].trim().length).toBeGreaterThan(0)
      expect(vi[key].trim().length).toBeGreaterThan(0)
    }
  })

  it('validates supported locale codes with isLocale', () => {
    expect(isLocale('en')).toBe(true)
    expect(isLocale('vi')).toBe(true)
    expect(isLocale('fr')).toBe(false)
    expect(isLocale(null)).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })

  it('interpolates placeholder parameters in both English and Vietnamese', () => {
    expect(translate('en', 'header.cartWithCount', { count: 3 })).toBe('Cart, 3 items')
    expect(translate('vi', 'header.cartWithCount', { count: 3 })).toBe('Giỏ hàng, 3 sản phẩm')
    expect(translate('en', 'footer.copyright', { year: 2026 })).toBe('© 2026 CommerceLab Retail')
    expect(translate('en', 'header.allCategory', { name: 'backpacks' })).toBe('All backpacks')
    expect(translate('vi', 'header.allCategory', { name: 'balo' })).toBe('Tất cả balo')
  })

  it('returns safe English defaults and no-op setLocale outside I18nProvider', async () => {
    const user = userEvent.setup()
    render(<Consumer />)

    expect(screen.getByTestId('locale')).toHaveTextContent(DEFAULT_LOCALE)
    expect(screen.getByTestId('label')).toHaveTextContent('Cart')
    expect(screen.getByTestId('interpolated')).toHaveTextContent('Cart, 4 items')

    await user.click(screen.getByRole('button', { name: 'Set VI' }))

    expect(screen.getByTestId('locale')).toHaveTextContent('en')
    expect(screen.getByTestId('label')).toHaveTextContent('Cart')
  })

  it('switches locales, persists to localStorage and cookie, and updates document lang', async () => {
    const user = userEvent.setup()
    render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>
    )

    expect(screen.getByTestId('locale')).toHaveTextContent('en')
    expect(document.documentElement.lang).toBe('en')

    await user.click(screen.getByRole('button', { name: 'Set VI' }))

    expect(screen.getByTestId('locale')).toHaveTextContent('vi')
    expect(screen.getByTestId('label')).toHaveTextContent('Giỏ hàng')
    expect(screen.getByTestId('interpolated')).toHaveTextContent('Giỏ hàng, 4 sản phẩm')
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('vi')
    expect(document.cookie).toContain(`${LOCALE_COOKIE_NAME}=vi`)
    expect(document.documentElement.lang).toBe('vi')

    await user.click(screen.getByRole('button', { name: 'Set EN' }))

    expect(screen.getByTestId('locale')).toHaveTextContent('en')
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(document.cookie).toContain(`${LOCALE_COOKIE_NAME}=en`)
    expect(document.documentElement.lang).toBe('en')
  })

  it('hydrates a persisted Vietnamese preference from localStorage on mount', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'vi')

    render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('vi')
      expect(screen.getByTestId('label')).toHaveTextContent('Giỏ hàng')
      expect(document.documentElement.lang).toBe('vi')
    })
  })

  it('falls back to reading a persisted Vietnamese preference from cookie', async () => {
    document.cookie = `${LOCALE_COOKIE_NAME}=vi; path=/`

    render(
      <I18nProvider>
        <Consumer />
      </I18nProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('locale')).toHaveTextContent('vi')
      expect(document.documentElement.lang).toBe('vi')
    })
  })
})
