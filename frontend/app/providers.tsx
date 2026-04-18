'use client'

import { SessionProvider } from 'next-auth/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { AudioProvider } from '@/context/AudioContext'
import FloatingMiniPlayer from '@/components/ui/FloatingMiniPlayer'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { 
      queries: { 
        staleTime: 60 * 1000,
        retry: (failureCount, error: any) => {
          // Immediately fail without retrying if the server gives a Rate Limit (429) or Unauthorized (401) 
          if (error?.response?.status === 429 || error?.response?.status === 401) {
            return false
          }
          // Otherwise, only retry once
          return failureCount < 1
        }
      } 
    },
  }))

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AudioProvider>
            {children}
            <FloatingMiniPlayer />
          </AudioProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
