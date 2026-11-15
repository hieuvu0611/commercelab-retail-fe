import { createMockAddressState, handleAddressMock } from '../mock-addresses'
import type { Address } from '@/types/checkout'

const state = createMockAddressState()
const call = (method: string, path: string, body?: unknown, userId: string | null = 'u1') =>
  handleAddressMock({ method, path, body }, userId, state)
const data = <T>(response: ReturnType<typeof call>) => (response?.body as { data: T }).data

const VALID = {
  recipient: 'Lan Nguyen',
  phone: '+84 901 234 567',
  line1: '12 Nguyen Hue',
  ward: 'Ben Nghe',
  district: 'District 1',
  province: 'Ho Chi Minh City',
}

describe('mock address book', () => {
  it('ignores other paths and needs sign-in', () => {
    expect(call('GET', '/carts/me')).toBeNull()
    expect(call('GET', '/users/me/addresses', undefined, null)?.status).toBe(401)
  })

  it('makes the first address the default and normalises the phone', () => {
    const first = data<Address>(call('POST', '/users/me/addresses', VALID))
    expect(first).toMatchObject({ isDefault: true, phone: '+84901234567' })
    const second = data<Address>(
      call('POST', '/users/me/addresses', { ...VALID, line1: '5 Le Loi' })
    )
    expect(second.isDefault).toBe(false)
  })

  it('moves the default when another address is saved as default, and when the default is deleted', () => {
    const [a, b] = data<Address[]>(call('GET', '/users/me/addresses'))
    expect(a.isDefault).toBe(true)
    call('PUT', `/users/me/addresses/${b.id}`, { ...VALID, line1: '5 Le Loi', isDefault: true })
    let list = data<Address[]>(call('GET', '/users/me/addresses'))
    expect(list.filter((address) => address.isDefault).map((address) => address.id)).toEqual([b.id])
    call('DELETE', `/users/me/addresses/${b.id}`)
    list = data<Address[]>(call('GET', '/users/me/addresses'))
    expect(list).toHaveLength(1)
    expect(list[0].isDefault).toBe(true)
  })

  it('validates every field and reports them all', () => {
    const response = call('POST', '/users/me/addresses', {
      recipient: '',
      phone: '12',
      line1: 'x'.repeat(201),
    })
    expect(response?.status).toBe(400)
    expect(Object.keys((response?.body as { errors: object }).errors).sort()).toEqual([
      'district',
      'line1',
      'phone',
      'province',
      'recipient',
      'ward',
    ])
  })

  it('keeps address books private and answers 404 for another user or an unknown id', () => {
    const own = data<Address[]>(call('GET', '/users/me/addresses'))[0]
    expect(data<Address[]>(call('GET', '/users/me/addresses', undefined, 'u2'))).toEqual([])
    expect(call('GET', `/users/me/addresses/${own.id}`, undefined, 'u2')?.status).toBe(404)
    expect(call('DELETE', '/users/me/addresses/nope')?.body).toMatchObject({
      code: 'ADDRESS_NOT_FOUND',
    })
  })

  it('allows at most 10 addresses', () => {
    for (let i = 0; i < 12; i += 1) call('POST', '/users/me/addresses', VALID, 'u3')
    expect(data<Address[]>(call('GET', '/users/me/addresses', undefined, 'u3'))).toHaveLength(10)
    expect(call('POST', '/users/me/addresses', VALID, 'u3')?.body).toMatchObject({
      code: 'ADDRESS_LIMIT_REACHED',
    })
  })
})
