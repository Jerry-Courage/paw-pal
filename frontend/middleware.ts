import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/login',
    },
  }
)

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/ai/:path*',
    '/library/:path*',
    '/planner/:path*',
    '/groups/:path*',
    '/community/:path*',
    '/assignments/:path*',
    '/workspace/:path*',
    '/learn/:path*',
    '/rankings/:path*',
    '/marketplace/:path*',
    '/onboarding/:path*',
    '/settings/:path*',
    '/upgrade/:path*',
  ],
}
