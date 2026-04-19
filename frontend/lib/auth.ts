import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import axios from 'axios'

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        try {
          const res = await axios.post(`${API_URL}/identity-engine/login/`, {
            email: credentials.email,
            password: credentials.password,
          })
          const { access, refresh } = res.data
          const userRes = await axios.get(`${API_URL}/identity-engine/me/`, {
            headers: { Authorization: `Bearer ${access}` },
          })
          return {
            ...userRes.data,
            accessToken: access,
            refreshToken: refresh,
          }
        } catch {
          // Return null instead of throwing — NextAuth handles null as "invalid credentials"
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = (user as any).accessToken
        token.refreshToken = (user as any).refreshToken
        token.id = user.id
        token.email = user.email
        token.name = (user as any).username
        token.picture = (user as any).avatar_url
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.user.id = token.id as string
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',   // Redirect errors back to login, not /api/auth/error
  },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET || 'flowstate-fallback-secret',
}
