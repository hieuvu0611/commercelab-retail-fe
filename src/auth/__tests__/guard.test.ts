import { describe, expect, it } from '@jest/globals'
import { decideAccess, isStaff } from '../guard'
import { REFRESH_ERROR } from '../types'

const customer = {
  user: {
    id: 'u1',
    name: 'Lan',
    email: 'lan@example.com',
    roles: ['CUSTOMER'],
    warehouseScopes: [],
  },
}
const staff = {
  user: {
    id: 's1',
    name: 'Wh',
    email: 'wh@commercelab.vn',
    roles: ['WAREHOUSE_STAFF'],
    warehouseScopes: ['WH-HCM-01'],
  },
}
const admin = {
  user: {
    id: 'a1',
    name: 'Admin',
    email: 'a@commercelab.vn',
    roles: ['ACCESS_ADMIN'],
    warehouseScopes: [],
  },
}
const dualRole = {
  user: {
    id: 'd1',
    name: 'Both',
    email: 'b@commercelab.vn',
    roles: ['CUSTOMER', 'SUPPORT_AGENT'],
    warehouseScopes: [],
  },
}

const allow = { action: 'allow' }

describe('isStaff', () => {
  it('is true for any role other than CUSTOMER', () => {
    expect(isStaff(staff.user)).toBe(true)
    expect(isStaff(dualRole.user)).toBe(true)
    expect(isStaff(customer.user)).toBe(false)
    expect(isStaff({ ...customer.user, roles: [] })).toBe(false)
    expect(isStaff(undefined)).toBe(false)
  })
})

describe('/account guard', () => {
  it('sends a signed-out visitor to sign in and remembers where they were going', () => {
    expect(decideAccess('/account', '', null)).toEqual({
      action: 'redirect',
      to: '/login?callbackUrl=%2Faccount',
    })
    expect(decideAccess('/account/security', '?tab=1', null)).toEqual({
      action: 'redirect',
      to: '/login?callbackUrl=%2Faccount%2Fsecurity%3Ftab%3D1',
    })
  })

  it('treats a failed session like a signed-out one', () => {
    expect(decideAccess('/account', '', { error: REFRESH_ERROR })).toMatchObject({
      action: 'redirect',
    })
    expect(decideAccess('/account', '', { ...customer, error: REFRESH_ERROR })).toMatchObject({
      action: 'redirect',
    })
  })

  it('lets any signed-in user in', () => {
    expect(decideAccess('/account', '', customer)).toEqual(allow)
    expect(decideAccess('/account/security', '', staff)).toEqual(allow)
  })

  it('does not treat look-alike paths as the account area', () => {
    expect(decideAccess('/accounts', '', null)).toEqual(allow)
    expect(decideAccess('/accountant', '', null)).toEqual(allow)
  })
})

describe('/admin guard', () => {
  it('sends a signed-out visitor to the staff sign-in page', () => {
    expect(decideAccess('/admin', '', null)).toEqual({
      action: 'redirect',
      to: '/admin/login?callbackUrl=%2Fadmin',
    })
    expect(decideAccess('/admin/users', '?page=2', null)).toEqual({
      action: 'redirect',
      to: '/admin/login?callbackUrl=%2Fadmin%2Fusers%3Fpage%3D2',
    })
  })

  it('sends a signed-in customer to the no-access page, not to a sign-in loop', () => {
    expect(decideAccess('/admin', '', customer)).toEqual({
      action: 'redirect',
      to: '/unauthorized',
    })
    expect(decideAccess('/admin/users', '', customer)).toEqual({
      action: 'redirect',
      to: '/unauthorized',
    })
  })

  it('lets staff of any kind in', () => {
    expect(decideAccess('/admin', '', staff)).toEqual(allow)
    expect(decideAccess('/admin/orders', '', admin)).toEqual(allow)
    expect(decideAccess('/admin', '', dualRole)).toEqual(allow)
  })

  it('never guards the staff sign-in page itself (that would be a redirect loop)', () => {
    expect(decideAccess('/admin/login', '', null)).toEqual(allow)
    expect(decideAccess('/admin/login', '?callbackUrl=%2Fadmin', customer)).toEqual(allow)
  })

  it('does not treat look-alike paths as the backoffice', () => {
    expect(decideAccess('/administrator', '', null)).toEqual(allow)
  })
})

describe('everything else', () => {
  it.each(['/', '/login', '/register', '/unauthorized', '/c/backpacks', '/search'])(
    'leaves %s public',
    (path) => {
      expect(decideAccess(path, '', null)).toEqual(allow)
    }
  )
})
