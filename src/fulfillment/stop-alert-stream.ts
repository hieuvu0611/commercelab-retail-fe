import { createSseParser, type SseMessage } from './sse-parser'

export type StreamStatus = 'connecting' | 'live' | 'reconnecting'

/** The service sends a heartbeat comment well inside this; a silent connection is treated as dead. */
const IDLE_MS = 45_000
const BASE_WAIT_MS = 1_000
const MAX_WAIT_MS = 30_000

/**
 * The warehouse's alert stream (P7-T04): GET /notifications/warehouse/{warehouseId}/stream with the Bearer token.
 * Through the gateway in a real deployment, through the in-app mock in mock mode.
 */
export function stopAlertStreamUrl(warehouseId: string): string {
  const base =
    process.env.NEXT_PUBLIC_MOCK_MODE === 'true'
      ? '/mock-api'
      : (process.env.NEXT_PUBLIC_API_BASE_URL ?? '')
  return `${base}/notifications/warehouse/${encodeURIComponent(warehouseId)}/stream`
}

interface Options {
  url: string
  /** Read again for every connection, so a refreshed token is used after a reconnect. */
  getToken: () => string | null
  onEvent: (message: SseMessage) => void
  onStatus: (status: StreamStatus) => void
  fetchImpl?: typeof fetch
}

/**
 * Keeps one authenticated event stream open until stopped. A refused, failed, ended or silent connection is retried with
 * a growing wait (1 s, 2 s ... 30 s); the service replays the open alerts on every new connection. Returns the stop function.
 */
export function startAlertStream(options: Options): () => void {
  const { url, getToken, onEvent, onStatus, fetchImpl = fetch } = options
  let isStopped = false
  let attempt = 0
  let controller: AbortController | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let waitTimer: ReturnType<typeof setTimeout> | undefined

  async function connectOnce(): Promise<void> {
    controller = new AbortController()
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    try {
      const token = getToken()
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'text/event-stream',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!response.ok || !response.body) throw new Error(`stream refused: ${response.status}`)
      attempt = 0
      if (!isStopped) onStatus('live')

      reader = response.body.getReader()
      const active = reader
      const decoder = new TextDecoder()
      const parse = createSseParser()
      const arm = () => {
        clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          controller?.abort()
          void active.cancel().catch(() => undefined)
        }, IDLE_MS)
      }
      arm()
      while (!isStopped) {
        const { done, value } = await active.read()
        if (done) break
        arm()
        for (const message of parse(decoder.decode(value, { stream: true })))
          if (!isStopped) onEvent(message)
      }
    } catch {
      // Any failure ends this connection; the loop below reconnects.
    } finally {
      clearTimeout(idleTimer)
      reader = null
    }
  }

  async function run(): Promise<void> {
    while (!isStopped) {
      await connectOnce()
      if (isStopped) return
      onStatus('reconnecting')
      const wait = Math.min(BASE_WAIT_MS * 2 ** attempt, MAX_WAIT_MS)
      attempt += 1
      await new Promise<void>((resolve) => {
        waitTimer = setTimeout(resolve, wait)
      })
    }
  }

  onStatus('connecting')
  void run()
  return () => {
    isStopped = true
    clearTimeout(waitTimer)
    controller?.abort()
    void reader?.cancel().catch(() => undefined)
  }
}
