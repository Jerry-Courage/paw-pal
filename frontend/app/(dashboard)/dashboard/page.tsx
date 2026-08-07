'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { aiApi, authApi, paymentsApi } from '@/lib/api'
import { toast } from 'sonner'
import { usePricing } from '@/hooks/usePricing'
import SecondaryDashboard from '@/components/dashboard/SecondaryDashboard'
import UniDashboard from '@/components/dashboard/UniDashboard'

export default function DashboardPage() {
  const { data: session } = useSession()
  const { data: profileData } = useQuery({ queryKey: ['profile'], queryFn: () => authApi.me().then(r => r.data) })
  const { refetch: refetchSub } = useQuery({ queryKey: ['subscription-status'], queryFn: () => paymentsApi.getStatus().then(r => r.data), staleTime: 60000 })

  // Handle payment return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reference = params.get('reference')
    const payment = params.get('payment')
    if (reference && payment === 'success') {
      window.history.replaceState({}, document.title, window.location.pathname)
      paymentsApi.verify(reference).then(res => {
        if (res.data.success) { toast.success('Payment confirmed! You\'re now Premium 🎉'); refetchSub() }
      }).catch(() => {})
    }
  }, [refetchSub])

  // SHS students get a completely different dashboard
  if (profileData?.education_level === 'secondary') {
    return (
      <div className="px-margin-mobile md:px-margin-desktop py-stack-lg max-w-6xl mx-auto space-y-stack-md">
        <SecondaryDashboard profileData={profileData} />
      </div>
    )
  }

  // University students get simplified dashboard
  return (
    <div className="px-margin-mobile md:px-margin-desktop py-stack-lg max-w-6xl mx-auto space-y-stack-md">
      <UniDashboard />
    </div>
  )
}
