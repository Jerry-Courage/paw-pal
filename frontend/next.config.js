/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '8000' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  env: {
    NEXTAUTH_URL: 'http://localhost:5002',
    NEXTAUTH_SECRET: 'flowstate-fallback-secret-2024',
    NEXT_PUBLIC_API_URL: 'http://localhost:8000/api',
  }
}

module.exports = nextConfig
