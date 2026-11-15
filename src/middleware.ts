import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'
import { decideAccess } from '@/auth/guard'

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  const decision = decideAccess(request.nextUrl.pathname, request.nextUrl.search, token)
  if (decision.action === 'redirect') {
    return NextResponse.redirect(new URL(decision.to, request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/account/:path*', '/checkout/:path*', '/admin/:path*'],
}
