'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function ResourceError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[ResourcePage]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
      <span className="material-symbols-outlined text-error text-[56px]">error</span>
      <h1 className="text-[22px] font-bold text-on-surface">Something went wrong</h1>
      <p className="text-on-surface-variant text-[14px] max-w-sm">
        We couldn&apos;t load this Source just now. Your saved Source has not been deleted.
      </p>
      <div className="flex gap-3 mt-2">
        <button
          onClick={() => reset()}
          className="px-5 py-2.5 bg-primary-container text-on-primary-container font-bold text-[14px] rounded-[1rem] hover:brightness-110 transition-all"
        >
          Try Again
        </button>
        <Link
          href="/library"
          className="px-5 py-2.5 bg-surface-container-high text-on-surface font-bold text-[14px] rounded-[1rem] border border-outline-variant hover:border-primary transition-all"
        >
          Back to Library
        </Link>
      </div>
    </div>
  )
}
