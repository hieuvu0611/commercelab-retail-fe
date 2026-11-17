import { listExceptionCases } from '@/cases/cases-api'
import { fetchManagementMetrics } from '@/metrics/metrics-api'
import { getNotificationStreamUrl } from '@/notifications/notifications-api'
import { backofficeApi } from '@/services/api/clients'

describe('M0 FE-BE Sync & No Silent Mock Fallbacks', () => {
  const prevMockMode = process.env.NEXT_PUBLIC_MOCK_MODE
  const prevNotiUrl = process.env.NEXT_PUBLIC_NOTIFICATION_API_BASE_URL

  afterEach(() => {
    process.env.NEXT_PUBLIC_MOCK_MODE = prevMockMode
    process.env.NEXT_PUBLIC_NOTIFICATION_API_BASE_URL = prevNotiUrl
    jest.restoreAllMocks()
  })

  it('calls /backoffice/exception-cases and propagates errors when NEXT_PUBLIC_MOCK_MODE=false', async () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'false'
    const spy = jest.spyOn(backofficeApi, 'get').mockRejectedValueOnce(new Error('Network down'))

    await expect(listExceptionCases()).rejects.toThrow('Network down')
    expect(spy).toHaveBeenCalledWith('/backoffice/exception-cases', {
      skipUnauthorizedHandler: true,
      params: undefined,
    })
  })

  it('calls /backoffice/metrics and propagates errors when NEXT_PUBLIC_MOCK_MODE=false', async () => {
    process.env.NEXT_PUBLIC_MOCK_MODE = 'false'
    const spy = jest.spyOn(backofficeApi, 'get').mockRejectedValueOnce(new Error('503 Unavailable'))

    await expect(fetchManagementMetrics('7D')).rejects.toThrow('503 Unavailable')
    expect(spy).toHaveBeenCalledWith('/backoffice/metrics', {
      skipUnauthorizedHandler: true,
      params: { period: '7D' },
    })
  })

  it('builds notification stream URL from NEXT_PUBLIC_NOTIFICATION_API_BASE_URL', () => {
    process.env.NEXT_PUBLIC_NOTIFICATION_API_BASE_URL = 'http://localhost:8089/'
    expect(getNotificationStreamUrl('user-lan')).toBe(
      'http://localhost:8089/api/v1/notifications/user-lan/stream'
    )
  })
})
