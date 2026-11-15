import { NextRequest, NextResponse } from 'next/server'
import { getMockState, userIdFromAccessToken } from '@/auth/mock-iam'
import { isMockModeAllowed } from '@/auth/mock-guard'
import {
  eventPayload,
  getMockCancellationState,
  openAlertsFor,
  streamAccess,
  type MockStopEvent,
} from '@/orders/mock-cancellation'

// The mock notification service: the stop-packing alert stream of one warehouse (P7-T04), server-sent events. Mock mode only.
export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 15_000
const REFUSALS = {
  401: { code: 'UNAUTHORIZED', message: 'A valid access token is required' },
  403: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action' },
} as const

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ warehouseId: string }> }
) {
  if (!isMockModeAllowed())
    return NextResponse.json(
      { message: 'Not found', code: 'NOT_FOUND', status: 404 },
      { status: 404 }
    )

  const { warehouseId } = await context.params
  const [scheme, token] = (request.headers.get('authorization') ?? '').split(' ')
  const userId = scheme === 'Bearer' && token ? userIdFromAccessToken(token) : null
  const user = userId ? getMockState().users.get(userId) : undefined
  const access = streamAccess(
    user?.isActive ? { roles: user.roles, warehouseScopes: user.warehouseScopes } : null,
    warehouseId
  )
  if (access !== 200)
    return NextResponse.json({ ...REFUSALS[access], status: access }, { status: access })

  const state = getMockCancellationState()
  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      const onEvent = (event: MockStopEvent) => {
        if (event.alert.warehouseId === warehouseId) send(event.type, eventPayload(event))
      }
      const heartbeat = setInterval(
        () => controller.enqueue(encoder.encode(': ping\n\n')),
        HEARTBEAT_MS
      )
      cleanup = () => {
        clearInterval(heartbeat)
        state.listeners.delete(onEvent)
        try {
          controller.close()
        } catch {
          // Already closed by the client.
        }
      }

      send('connected', { warehouseId })
      // A late subscriber gets every alert that is still open.
      for (const alert of openAlertsFor(state, warehouseId))
        send('stop_requested', eventPayload({ type: 'stop_requested', alert }))
      state.listeners.add(onEvent)
      request.signal.addEventListener('abort', cleanup)
    },
    cancel: () => cleanup(),
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
