import { expect, test, type Page } from '@playwright/test'

const DESKTOP = { width: 1280, height: 800 }
const MOBILE = { width: 390, height: 844 }

// --color-paper as the browser serialises oklch(97% 0.007 86).
const PAPER_BACKGROUND = /oklch\(0\.97 0\.007 86\)/

async function expectStorefrontLandmarks(page: Page) {
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('link', { name: 'CommerceLab' }).first()).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Categories' })).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search products' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Cart' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('contentinfo')).toBeVisible()
}

for (const [name, viewport] of [
  ['desktop', DESKTOP],
  ['mobile', MOBILE],
] as const) {
  test.describe(`storefront shell (${name})`, () => {
    test.use({ viewport })

    test('renders the header, main and footer landmarks on /', async ({ page }) => {
      await page.goto('/')
      await expectStorefrontLandmarks(page)
      await expect(page.locator('body')).toHaveCSS('background-color', PAPER_BACKGROUND)
    })
  })

  test.describe(`backoffice shell (${name})`, () => {
    test.use({ viewport })

    test('renders the top bar, main area and sidebar navigation on /admin', async ({ page }) => {
      await page.goto('/admin')
      await expect(page.getByRole('banner')).toBeVisible()
      await expect(page.getByRole('main')).toBeVisible()
      await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()

      const sidebar = page.getByRole('navigation', { name: 'Backoffice' })
      if (name === 'mobile') {
        await expect(sidebar).toBeHidden()
        const menu = page.getByRole('button', { name: 'Menu' })
        await menu.click()
        await expect(menu).toHaveAttribute('aria-expanded', 'true')
      }
      await expect(sidebar).toBeVisible()
      await expect(sidebar.getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'aria-current',
        'page'
      )
    })
  })
}

test.describe('keyboard', () => {
  test.use({ viewport: DESKTOP })

  test('Tab reaches every storefront header control in order', async ({ page }) => {
    await page.goto('/')

    const expected = [
      page.getByRole('link', { name: 'Skip to content' }),
      page.getByRole('banner').getByRole('link', { name: 'CommerceLab' }),
      page.getByRole('searchbox', { name: 'Search products' }),
      page.getByRole('button', { name: 'Search' }),
      page.getByRole('link', { name: 'Cart' }),
      page.getByRole('button', { name: 'Account' }),
      page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: 'Backpacks' }),
      page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: 'Bottles' }),
      page
        .getByRole('navigation', { name: 'Categories' })
        .getByRole('link', { name: 'Accessories' }),
    ]

    for (const control of expected) {
      await page.keyboard.press('Tab')
      await expect(control).toBeFocused()
    }
  })

  test('the account menu opens from the keyboard and closes on Escape', async ({ page }) => {
    await page.goto('/')
    const account = page.getByRole('button', { name: 'Account' })

    await account.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(account).toHaveAttribute('aria-expanded', 'false')
    await expect(account).toBeFocused()
  })
})

test.describe('status pages', () => {
  test('/unauthorized explains the problem inside the storefront shell', async ({ page }) => {
    await page.goto('/unauthorized')
    await expect(
      page.getByRole('heading', { level: 1, name: "You don't have access to this page" })
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Staff sign-in' }).first()).toBeVisible()
  })

  test('an unknown storefront path shows the not-found page', async ({ page }) => {
    const response = await page.goto('/no-such-page')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    await expect(page.getByRole('banner')).toBeVisible()
  })

  test('an unbuilt backoffice path stays inside the backoffice shell', async ({ page }) => {
    const response = await page.goto('/admin/orders')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to overview' })).toBeVisible()
  })
})
