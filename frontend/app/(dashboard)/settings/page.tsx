'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/api'
import { useSession, signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const TABS = ['My Profile', 'Notifications', 'Account']

const WEEKLY_QUOTES = [
  "Every minute counts, Buddy!",
  "You're doing great, Champ!",
  "Whoa, a real Study Pro!",
  "Look at those goals fly!",
  "Focus Master in training!",
  "Unstoppable Learner!",
  "Flow state activated!"
]

export default function SettingsPage() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('My Profile')
  const [bio, setBio] = useState('')
  const [university, setUniversity] = useState('')
  const [weeklyGoal, setWeeklyGoal] = useState(10)
  const [educationLevel, setEducationLevel] = useState('tertiary')

  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.me().then(r => r.data),
  })

  useEffect(() => {
    if (profileData) {
      setBio((profileData as any).bio || '')
      setUniversity((profileData as any).university || '')
      setWeeklyGoal((profileData as any).weekly_goal_hours || 10)
      setEducationLevel((profileData as any).education_level || 'tertiary')
    }
  }, [profileData])

  const updateMutation = useMutation({
    mutationFn: (data: any) => authApi.updateProfile(data),
    onSuccess: () => { toast.success('Profile saved!'); queryClient.invalidateQueries({ queryKey: ['profile'] }) },
    onError: () => toast.error('Failed to save profile.'),
  })

  const goalMutation = useMutation({
    mutationFn: (hours: number) => authApi.setWeeklyGoal(hours),
    onSuccess: () => { toast.success('Weekly goal updated!'); queryClient.invalidateQueries({ queryKey: ['analytics'] }) },
    onError: () => toast.error('Failed to update goal.'),
  })

  const handleSave = () => {
    updateMutation.mutate({ bio, university, education_level: educationLevel })
    goalMutation.mutate(weeklyGoal)
  }

  const name = session?.user?.name || 'Student'
  const email = session?.user?.email || ''
  const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const quoteIdx = Math.floor((weeklyGoal / 20) * (WEEKLY_QUOTES.length - 1))

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-stack-lg max-w-4xl mx-auto">

      {/* Header */}
      <div className="mb-stack-lg">
        <h2 className="text-[32px] font-bold text-primary mb-base">Profile &amp; Settings</h2>
        <p className="text-on-surface-variant text-[16px]">Make FlowState yours!</p>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-stack-sm mb-stack-lg no-scrollbar pb-base">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'whitespace-nowrap px-gutter py-stack-sm rounded-full font-bold text-[14px] transition-all',
              activeTab === tab
                ? 'bg-primary-container text-on-primary-container shadow-[0_4px_0_0_#763300]'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── My Profile Tab ────────────────────────────── */}
      {activeTab === 'My Profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          {/* Profile Card */}
          <div className="lg:col-span-7 bg-surface-container-low p-gutter rounded-[1.5rem] shadow-md border-b-4 border-surface-container-highest">
            <div className="flex flex-col md:flex-row items-center gap-gutter mb-stack-md">
              {/* Avatar */}
              <div className="relative group">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-primary shadow-[0_8px_0_0_#763300] overflow-hidden bg-surface-container-highest flex items-center justify-center">
                  {(session?.user as any)?.avatar ? (
                    <img src={(session?.user as any).avatar} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[48px] font-bold text-primary">{initials}</span>
                  )}
                </div>
                <button className="absolute bottom-1 right-1 bg-secondary-container p-base rounded-full border-2 border-on-secondary shadow-md active:scale-95 transition-transform">
                  <span className="material-symbols-outlined text-on-secondary-container text-[18px]">add_a_photo</span>
                </button>
              </div>

              {/* Name & bio */}
              <div className="flex-1 w-full space-y-stack-sm">
                <div>
                  <label className="text-[13px] font-bold text-primary block mb-base">Full Name</label>
                  <div className="w-full bg-surface-container-highest border border-outline-variant rounded-full px-gutter py-stack-sm text-[16px] text-on-surface-variant">{name}</div>
                  <p className="text-[11px] text-on-surface-variant mt-1 pl-2">Name is tied to your login — contact support to change.</p>
                </div>
                <div>
                  <label className="text-[13px] font-bold text-primary block mb-base">University / School</label>
                  <input
                    className="w-full bg-surface-container-highest border border-outline-variant focus:border-secondary rounded-full px-gutter py-stack-sm text-[16px] text-on-surface focus:outline-none transition-all"
                    placeholder="e.g. University of Ghana"
                    value={university}
                    onChange={e => setUniversity(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Bio */}
            <div className="mb-stack-md">
              <label className="text-[13px] font-bold text-primary block mb-base">Bio</label>
              <textarea
                className="w-full h-24 bg-surface-container-highest border border-outline-variant focus:border-secondary rounded-[1.5rem] px-gutter py-3 text-[15px] text-on-surface focus:outline-none transition-all resize-none"
                placeholder="Tell your study squad a bit about yourself..."
                value={bio}
                onChange={e => setBio(e.target.value)}
              />
            </div>

            {/* Weekly goal slider */}
            <div className="bg-surface-container p-gutter rounded-[1.5rem] border-2 border-outline-variant/30">
              <div className="flex justify-between items-end mb-stack-sm">
                <div>
                  <label className="text-[13px] font-bold text-primary block">My Weekly Goal</label>
                  <span className="text-[36px] font-bold text-on-surface">{weeklyGoal}<span className="text-[16px] text-on-surface-variant"> hours</span></span>
                </div>
                <div className="hidden md:block bg-tertiary-container/20 p-stack-sm rounded-[1rem] border-l-4 border-tertiary max-w-[180px]">
                  <p className="text-[13px] italic text-tertiary">&quot;{WEEKLY_QUOTES[quoteIdx]}&quot;</p>
                </div>
              </div>
              <input
                type="range" min={1} max={20} value={weeklyGoal}
                onChange={e => setWeeklyGoal(Number(e.target.value))}
                className="w-full accent-primary-container h-3 rounded-full appearance-none cursor-pointer bg-surface-container-highest"
              />
              <div className="flex justify-between mt-base text-[11px] text-on-surface-variant uppercase tracking-widest font-bold">
                <span>1 hr</span><span>10 hrs</span><span>20 hrs</span>
              </div>
            </div>
          </div>

          {/* Account info sidebar */}
          <div className="lg:col-span-5 space-y-stack-md">
            <div className="bg-surface-container-low p-gutter rounded-[1.5rem] border border-outline-variant/20">
              <h3 className="text-[16px] font-bold text-on-surface mb-stack-md">Account Info</h3>
              <div className="space-y-stack-sm text-[14px]">
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">Email</span>
                  <span className="text-on-surface font-medium truncate max-w-[160px]">{email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">Member since</span>
                  <span className="text-on-surface font-medium">{profileData?.created_at ? new Date(profileData.created_at).getFullYear() : '2025'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">Study streak</span>
                  <span className="text-primary font-bold">{profileData?.study_streak || 0} days 🔥</span>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-low p-gutter rounded-[1.5rem] border border-outline-variant/20">
              <h3 className="text-[16px] font-bold text-on-surface mb-stack-md">Danger Zone</h3>
              <button onClick={() => signOut({ callbackUrl: '/login' })} className="w-full flex items-center gap-base px-stack-sm py-3 rounded-[1rem] text-error hover:bg-error-container/10 transition-all font-semibold text-[14px]">
                <span className="material-symbols-outlined text-[18px]">logout</span>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notifications Tab ─────────────────────────── */}
      {activeTab === 'Notifications' && (
        <div className="bg-surface-container-low rounded-[1.5rem] p-gutter border border-outline-variant/20 space-y-stack-md">
          <h3 className="text-[18px] font-bold text-on-surface">Notification Preferences</h3>
          {[
            { label: 'Study reminders', desc: 'Get reminded before scheduled sessions', default: true },
            { label: 'Streak alerts', desc: 'Daily nudges to keep your streak alive', default: true },
            { label: 'Flashcard due', desc: 'Spaced repetition review reminders', default: false },
            { label: 'Group activity', desc: 'Messages and updates from your study groups', default: true },
            { label: 'AI nudges', desc: 'Personalised study tips from FlowAI', default: true },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-outline-variant/20 last:border-0">
              <div>
                <p className="font-semibold text-on-surface text-[15px]">{item.label}</p>
                <p className="text-on-surface-variant text-[13px]">{item.desc}</p>
              </div>
              <button
                className={cn('w-12 h-6 rounded-full transition-colors relative', item.default ? 'bg-primary-container' : 'bg-surface-container-highest')}
              >
                <div className={cn('absolute top-1 w-4 h-4 rounded-full bg-on-primary shadow-md transition-all', item.default ? 'right-1' : 'left-1')} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Account Tab ───────────────────────────────── */}
      {activeTab === 'Account' && (
        <div className="bg-surface-container-low rounded-[1.5rem] p-gutter border border-outline-variant/20 space-y-stack-md">
          <h3 className="text-[18px] font-bold text-on-surface">Account Settings</h3>
          <div className="space-y-3">
            <button className="w-full flex items-center justify-between px-stack-md py-4 rounded-[1rem] bg-surface-container hover:bg-surface-container-high transition-all">
              <span className="text-[15px] font-semibold text-on-surface">Change Password</span>
              <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
            </button>
            <button className="w-full flex items-center justify-between px-stack-md py-4 rounded-[1rem] bg-surface-container hover:bg-surface-container-high transition-all">
              <span className="text-[15px] font-semibold text-on-surface">Connected Accounts</span>
              <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
            </button>
            <button className="w-full flex items-center justify-between px-stack-md py-4 rounded-[1rem] bg-surface-container hover:bg-surface-container-high transition-all">
              <span className="text-[15px] font-semibold text-on-surface">Export My Data</span>
              <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
            </button>
            <button className="w-full flex items-center justify-between px-stack-md py-4 rounded-[1rem] bg-error-container/10 hover:bg-error-container/20 transition-all">
              <span className="text-[15px] font-semibold text-error">Delete Account</span>
              <span className="material-symbols-outlined text-error">chevron_right</span>
            </button>
          </div>
        </div>
      )}

      {/* Save button */}
      {activeTab === 'My Profile' && (
        <div className="mt-stack-lg flex justify-end gap-stack-md">
          <button className="px-gutter py-stack-sm text-on-surface-variant font-bold hover:text-error transition-colors">Discard changes</button>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending || goalMutation.isPending}
            className="px-margin-desktop py-stack-sm bg-primary text-on-primary font-bold rounded-full shadow-[0_6px_0_0_#763300] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50"
          >
            {(updateMutation.isPending || goalMutation.isPending) ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      )}
    </div>
  )
}
