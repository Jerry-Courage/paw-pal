import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Proxy route for media files from Django backend.
 * Usage: /api/proxy?url=http://localhost:8000/media/...
 * Adds auth header automatically.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'url param required' }, { status: 400 })
  }

  // Only allow proxying from our backend
  const allowed = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:8000'
  if (!url.startsWith(allowed)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const session = await getServerSession(authOptions)
  const headers: Record<string, string> = {}
  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`
  }

  try {
    const res = await fetch(url, { headers })
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch file' }, { status: res.status })
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 })
  }
}
