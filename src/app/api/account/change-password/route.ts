import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'
import { iam } from '@/auth/auth-options'
import { handleChangePassword } from '@/auth/change-password'

// Never cache a credential change.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  const body: unknown = await request.json().catch(() => undefined)
  const result = await handleChangePassword({ token, body, iam })
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
