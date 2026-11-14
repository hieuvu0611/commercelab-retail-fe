import { NextRequest, NextResponse } from 'next/server'
import { handleMockApi } from '@/auth/mock-api'
import { isMockModeAllowed } from '@/auth/mock-guard'

// The mock backend only exists in mock mode (and never in a production build unless explicitly allowed).
async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!isMockModeAllowed())
    return NextResponse.json(
      { message: 'Not found', code: 'NOT_FOUND', status: 404 },
      { status: 404 }
    )

  const { path } = await context.params
  const body: unknown =
    request.method === 'GET' ? undefined : await request.json().catch(() => undefined)
  const result = handleMockApi({
    method: request.method,
    path: `/${path.join('/')}`,
    authorization: request.headers.get('authorization'),
    body,
  })
  return NextResponse.json(result.body, { status: result.status })
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE }
