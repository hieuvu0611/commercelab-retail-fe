/** @jest-environment node */
import { startAlertStream, type StreamStatus } from '../stop-alert-stream'

const encoder = new TextEncoder()

/** A fetch answer whose body the test feeds chunk by chunk and can end or break. */
function liveResponse(status = 200) {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) })
  return {
    response: { ok: status === 200, status, body } as unknown as Response,
    push: (text: string) => {
      try {
        controller.enqueue(encoder.encode(text))
      } catch {
        // The reader already cancelled the stream.
      }
    },
    end: () => controller.close(),
    fail: () => controller.error(new Error('network')),
  }
}

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

describe('startAlertStream', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const setup = (responses: Array<ReturnType<typeof liveResponse> | Error>) => {
    const events: Array<{ event: string; data: string }> = []
    const statuses: StreamStatus[] = []
    const calls: Array<{ url: string; headers: Record<string, string> }> = []
    let token = 'token-1'
    const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> })
      const next = responses.shift()
      if (!next) throw new Error('no more responses')
      if (next instanceof Error) throw next
      return next.response
    })
    const stop = startAlertStream({
      url: '/stream',
      getToken: () => token,
      onEvent: (event) => events.push(event),
      onStatus: (status) => statuses.push(status),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    return { events, statuses, calls, stop, setToken: (value: string) => (token = value) }
  }

  it('sends the bearer token, goes live and passes events on', async () => {
    const live = liveResponse()
    const { events, statuses, calls, stop } = setup([live])
    await flush()
    live.push('event: stop_requested\ndata: {"orderId":"O-1"}\n\n')
    await flush()
    expect(calls[0].headers.Authorization).toBe('Bearer token-1')
    expect(statuses).toEqual(['connecting', 'live'])
    expect(events).toEqual([{ event: 'stop_requested', data: '{"orderId":"O-1"}' }])
    stop()
  })

  it('reconnects with a growing wait after the stream ends or fails, and uses the newest token', async () => {
    const first = liveResponse()
    const { statuses, calls, stop, setToken } = setup([first, new Error('offline'), liveResponse()])
    await flush()
    first.end()
    await flush()
    expect(statuses.at(-1)).toBe('reconnecting')
    setToken('token-2')
    await jest.advanceTimersByTimeAsync(1000)
    await flush()
    expect(calls).toHaveLength(2)
    expect(statuses.at(-1)).toBe('reconnecting')
    await jest.advanceTimersByTimeAsync(1999)
    expect(calls).toHaveLength(2)
    await jest.advanceTimersByTimeAsync(1)
    await flush()
    expect(calls).toHaveLength(3)
    expect(calls[2].headers.Authorization).toBe('Bearer token-2')
    expect(statuses.at(-1)).toBe('live')
    stop()
  })

  it('treats a refused connection as a failure to retry, not as live', async () => {
    const { statuses, calls, stop } = setup([liveResponse(401), liveResponse()])
    await flush()
    expect(statuses).toEqual(['connecting', 'reconnecting'])
    await jest.advanceTimersByTimeAsync(1000)
    await flush()
    expect(calls).toHaveLength(2)
    expect(statuses.at(-1)).toBe('live')
    stop()
  })

  it('reconnects when the connection goes silent past the heartbeat window', async () => {
    const quiet = liveResponse()
    const { statuses, calls, stop } = setup([quiet, liveResponse()])
    await flush()
    await jest.advanceTimersByTimeAsync(46_000)
    await flush()
    expect(statuses).toContain('reconnecting')
    await jest.advanceTimersByTimeAsync(1000)
    await flush()
    expect(calls).toHaveLength(2)
    stop()
  })

  it('stops for good when asked: no more requests, no more events', async () => {
    const live = liveResponse()
    const { events, calls, stop } = setup([live, liveResponse()])
    await flush()
    stop()
    live.push('event: x\ndata: 1\n\n')
    await jest.advanceTimersByTimeAsync(60_000)
    await flush()
    expect(calls).toHaveLength(1)
    expect(events).toEqual([])
  })
})
