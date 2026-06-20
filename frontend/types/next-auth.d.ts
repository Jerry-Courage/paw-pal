import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
    error?: 'RefreshAccessTokenError'
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      onboarded?: boolean
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    error?: 'RefreshAccessTokenError'
    id?: string
    onboarded?: boolean
  }
}
