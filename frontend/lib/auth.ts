import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import axios from 'axios'

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

export const authOptions: NextAuthOptions = {
  providers: [
    // ── Credentials (email + password) ────────────────────────────────────
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        try {
          const res = await axios.post(`${API_URL}/auth/login/`, {
            email: credentials.email,
            password: credentials.password,
          })
          const { access, refresh } = res.data
          const userRes = await axios.get(`${API_URL}/auth/me/`, {
            headers: { Authorization: `Bearer ${access}` },
          })
          return {
            ...userRes.data,
            accessToken: access,
            refreshToken: refresh,
          }
        } catch {
          return null
        }
      },
    }),

    // ── Google OAuth ───────────────────────────────────────────────────────
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'online',
          scope: 'openid email profile',
        },
      },
    }),

    // ── GitHub OAuth ───────────────────────────────────────────────────────
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      scope: 'read:user user:email',
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      // For OAuth providers, exchange the provider access token for our own JWT
      if (account?.provider === 'google' || account?.provider === 'github') {
        try {
          const endpoint = account.provider === 'google'
            ? `${API_URL}/auth/oauth/google/`
            : `${API_URL}/auth/oauth/github/`

          const res = await axios.post(endpoint, {
            access_token: account.access_token,
          })

          // Attach our tokens to the user object so jwt callback can pick them up
          ;(user as any).accessToken  = res.data.access
          ;(user as any).refreshToken = res.data.refresh
          return true
        } catch (e: any) {
          const msg = e?.response?.data?.error || 'OAuth login failed'
          // Return an error URL so NextAuth redirects with ?error=
          return `/login?error=${encodeURIComponent(msg)}`
        }
      }
      return true
    },

    async jwt({ token, user, account }) {
      if (user) {
        token.accessToken  = (user as any).accessToken
        token.refreshToken = (user as any).refreshToken
        token.id           = user.id
        token.email        = user.email
        token.name         = (user as any).username || user.name
        token.picture      = (user as any).avatar_url || user.image
        token.onboarded    = (user as any).onboarding_status?.completed || false
      }
      return token
    },

    async session({ session, token }) {
      session.accessToken  = token.accessToken as string
      session.user.id      = token.id as string
      session.user.name    = token.name as string
      session.user.image   = token.picture as string
      ;(session.user as any).onboarded = token.onboarded
      return session
    },
  },

  pages: {
    signIn: '/login',
    error:  '/login',
  },

  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET || 'flowstate-fallback-secret',
}
