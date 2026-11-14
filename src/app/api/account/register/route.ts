import { NextResponse, type NextRequest } from 'next/server'
import { iam } from '@/auth/auth-options'
import { handleRegister } from '@/auth/register'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => undefined)
  const result = await handleRegister({ body, iam })
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
