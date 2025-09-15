import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  
  // DEVELOPMENT ONLY: Skip auth check
  if (process.env.NODE_ENV === 'development') {
    return res
  }
  
  // Prendi il token dai cookie
  const token = req.cookies.get('sb-access-token')

  if (!token && req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return res
}

export const config = {
  matcher: ['/dashboard/:path*']
}