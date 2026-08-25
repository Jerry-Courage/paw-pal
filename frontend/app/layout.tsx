import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import 'katex/dist/katex.min.css'
import { Providers } from './providers'
import { Toaster } from 'sonner'
import NextTopLoader from 'nextjs-toploader'
import { cn } from '@/lib/utils'

const outfit = Outfit({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-outfit',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0d0d0d',
}

export const metadata: Metadata = {
  title: 'Flow State — New Intelligence Tech Era',
  description: 'We transform your actual school material into an interactive learning world — AI study kits, voice tutors, quizzes, and VR classrooms.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Flow State',
    startupImage: '/images/logo-pwa.png',
  },
  icons: {
    icon: '/images/logo-icon.png?v=2',
    apple: '/images/logo-pwa.png?v=2',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'msapplication-TileImage': '/images/logo-pwa.png',
    'msapplication-TileColor': '#0d0d0d',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Flow State" />
        <link rel="apple-touch-icon" href="/images/logo-pwa.png" />
        {/* Material Symbols for the new design system */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body suppressHydrationWarning className={cn(outfit.className, outfit.variable)}>
        <NextTopLoader
          color="#ffb68d"
          initialPosition={0.08}
          crawlSpeed={200}
          height={3}
          crawl={true}
          showSpinner={false}
          easing="ease"
          speed={200}
          shadow="0 0 10px #ffb68d,0 0 5px #ff8a3d"
        />
        <Providers>
          {children}
          <Toaster position="top-right" richColors />
        </Providers>
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js');
              });
            }
          `
        }} />
      </body>
    </html>
  )
}
