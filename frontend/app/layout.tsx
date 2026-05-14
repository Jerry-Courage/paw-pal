import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
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
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0d0d0d',
}

export const metadata: Metadata = {
  title: 'NITE Mind — New Intelligence Tech Era',
  description: 'Transform PDFs, YouTube videos, and class notes into interactive lessons with the power of NITE Mind AI.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NITE Mind',
    startupImage: '/images/logo-icon.png',
  },
  icons: {
    icon: '/images/logo-icon.png',
    apple: '/images/logo-icon.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'msapplication-TileImage': '/images/logo-icon.png',
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
        <meta name="apple-mobile-web-app-title" content="NITE Mind" />
        <link rel="apple-touch-icon" href="/images/logo-icon.png" />
      </head>
      <body suppressHydrationWarning className={cn(outfit.className, outfit.variable)}>
        <NextTopLoader
          color="#8b5cf6"
          initialPosition={0.08}
          crawlSpeed={200}
          height={3}
          crawl={true}
          showSpinner={false}
          easing="ease"
          speed={200}
          shadow="0 0 10px #8b5cf6,0 0 5px #8b5cf6"
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
