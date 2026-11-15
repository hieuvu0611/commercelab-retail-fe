/** @jest-environment node */
import { describe, expect, it, jest } from '@jest/globals'
import { handleRegister } from '../register'
import { IamError, type IamClient } from '../types'

const body = {
  email: 'new@example.com',
  password: 'a-long-enough-password',
  fullName: 'New Person',
}

function iamWith(register: IamClient['register']): IamClient {
  return { register } as IamClient
}

describe('handleRegister', () => {
  it('registers through the identity service and answers 201 without any token', async () => {
    const register = jest.fn<IamClient['register']>().mockResolvedValue(undefined)

    const result = await handleRegister({ body, iam: iamWith(register) })

    expect(result).toEqual({ status: 201, body: { ok: true } })
    expect(register).toHaveBeenCalledWith('new@example.com', 'a-long-enough-password', 'New Person')
  })

  it.each([
    ['an empty body', {}],
    ['a missing name', { email: 'a@example.com', password: 'a-long-enough-password' }],
    ['a wrong type', { email: 5, password: 'x', fullName: 'y' }],
    ['text', 'nope'],
  ])('answers 400 for %s without calling the server', async (_name, bad) => {
    const register = jest.fn<IamClient['register']>()

    const result = await handleRegister({ body: bad, iam: iamWith(register) })

    expect(result.status).toBe(400)
    expect(register).not.toHaveBeenCalled()
  })

  it.each([
    [new IamError(409, 'EMAIL_ALREADY_REGISTERED'), 409, { code: 'EMAIL_ALREADY_REGISTERED' }],
    [new IamError(429, 'TOO_MANY_ATTEMPTS'), 429, { code: 'TOO_MANY_ATTEMPTS' }],
    [new IamError(503, 'DEPENDENCY_UNAVAILABLE'), 503, { code: 'SERVICE_UNAVAILABLE' }],
    [new IamError(500, 'ANYTHING'), 503, { code: 'SERVICE_UNAVAILABLE' }],
    [new TypeError('fetch failed'), 503, { code: 'SERVICE_UNAVAILABLE' }],
  ])('maps %p to %i', async (error, status, expected) => {
    const register = jest.fn<IamClient['register']>().mockRejectedValue(error)

    const result = await handleRegister({ body, iam: iamWith(register) })

    expect(result).toEqual({ status, body: expected })
  })

  it('passes the field errors of a rejected registration through', async () => {
    const register = jest.fn<IamClient['register']>().mockRejectedValue(
      new IamError(422, 'VALIDATION_FAILED', {
        password: ['Password must be at least 10 characters'],
      })
    )

    const result = await handleRegister({ body, iam: iamWith(register) })

    expect(result).toEqual({
      status: 422,
      body: {
        code: 'VALIDATION_FAILED',
        fieldErrors: { password: ['Password must be at least 10 characters'] },
      },
    })
  })
})
