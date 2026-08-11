'use client'

import { useState, useEffect, useRef } from 'react'
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

const NOTIFICATION_ITEMS = [
  { key: 'study_reminders', label: 'Study reminders', desc: 'Get reminded before scheduled sessions', icon: 'alarm' },
  { key: 'streak_alerts', label: 'Streak alerts', desc: 'Daily nudges to keep your streak alive', icon: 'local_fire_department' },
  { key: 'flashcard_due', label: 'Flashcard due', desc: 'Spaced repetition review reminders', icon: 'style' },
  { key: 'group_activity', label: 'Group activity', desc: 'Messages and updates from your study groups', icon: 'group' },
  { key: 'ai_nudges', label: 'AI nudges', desc: 'Personalised study tips from FlowAI', icon: 'psychology' },
] as const

const DEFAULT_PREFS: Record<string, boolean> = {
  study_reminders: true,
  streak_alerts: true,
  flashcard_due: false,
  group_activity: true,
  ai_nudges: true,
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [activeTab, setActiveTab] = useState('My Profile')
  const [bio, setBio] = useState('')
  const [university, setUniversity] = useState('')
  const [weeklyGoal, setWeeklyGoal] = useState(10)
  const [educationLevel, setEducationLevel] = useState('tertiary')
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>(DEFAULT_PREFS)
  const [isDirty, setIsDirty] = useState(false)

  // Account tab modals
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [showExportConfirm, setShowExportConfirm] = useState(false)

  // Profile query
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
      const prefs = (profileData as any).notification_preferences || {}
      setNotificationPrefs({ ...DEFAULT_PREFS, ...prefs })
      setIsDirty(false)
    }
  }, [profileData])

  // ── Mutations ────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (data: any) => authApi.updateProfile(data),
    onSuccess: () => {
      toast.success('Profile saved!')
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setIsDirty(false)
    },
    onError: () => toast.error('Failed to save profile.'),
  })

  const goalMutation = useMutation({
    mutationFn: (hours: number) => authApi.setWeeklyGoal(hours),
    onSuccess: () => {
      toast.success('Weekly goal updated!')
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
    },
    onError: () => toast.error('Failed to update goal.'),
  })

  const avatarMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('avatar', file)
      return authApi.updateProfile(fd)
    },
    onSuccess: () => {
      toast.success('Avatar updated!')
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      queryClient.invalidateQueries({ queryKey: ['session'] })
    },
    onError: () => toast.error('Failed to upload avatar.'),
  })

  const changePasswordMutation = useMutation({
    mutationFn: ({ current_password, new_password }: { current_password: string; new_password: string }) =>
      authApi.changePassword(current_password, new_password),
    onSuccess: () => {
      toast.success('Password changed successfully!')
      setShowChangePassword(false)
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to change password.')
    },
  })

  const deleteAccountMutation = useMutation({
    mutationFn: (password: string) => authApi.deleteAccount(password),
    onSuccess: () => {
      toast.success('Account deleted. Goodbye!')
      signOut({ callbackUrl: '/login' })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to delete account.')
    },
  })

  const exportDataMutation = useMutation({
    mutationFn: () => authApi.exportData(),
    onSuccess: (response: any) => {
      const blob = new Blob([response.data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `flowstate-data-${(profileData as any)?.username || 'user'}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Data exported!')
      setShowExportConfirm(false)
    },
    onError: () => toast.error('Failed to export data.'),
  })

  // ── Handlers ─────────────────────────────────────────────────
  const handleSave = () => {
    updateMutation.mutate({
      bio,
      university,
      education_level: educationLevel,
      notification_preferences: notificationPrefs,
    })
    goalMutation.mutate(weeklyGoal)
  }

  const handleDiscard = () => {
    if (profileData) {
      setBio((profileData as any).bio || '')
      setUniversity((profileData as any).university || '')
      setWeeklyGoal((profileData as any).weekly_goal_hours || 10)
      setEducationLevel((profileData as any).education_level || 'tertiary')
      const prefs = (profileData as any).notification_preferences || {}
      setNotificationPrefs({ ...DEFAULT_PREFS, ...prefs })
    }
    setIsDirty(false)
  }

  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be under 5MB.')
        return
      }
      avatarMutation.mutate(file)
    }
  }

  const toggleNotification = (key: string) => {
    setNotificationPrefs(prev => ({ ...prev, [key]: !prev[key] }))
    setIsDirty(true)
  }

  const markDirty = () => setIsDirty(true)

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
                <button
                  onClick={handleAvatarClick}
                  className="absolute bottom-1 right-1 bg-secondary-container p-base rounded-full border-2 border-on-secondary shadow-md active:scale-95 transition-transform hover:bg-secondary"
                >
                  <span className="material-symbols-outlined text-on-secondary-container text-[18px]">add_a_photo</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
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
                    onChange={e => { setUniversity(e.target.value); markDirty() }}
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
                onChange={e => { setBio(e.target.value); markDirty() }}
              />
            </div>

            {/* Education Level */}
            <div className="mb-stack-md">
              <label className="text-[13px] font-bold text-primary block mb-base">Education Level</label>
              <div className="flex gap-stack-sm">
                {[
                  { value: 'tertiary', label: 'University / Tertiary', icon: 'school' },
                  { value: 'secondary', label: 'Senior High School', icon: 'account_balance' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => { setEducationLevel(opt.value); markDirty() }}
                    className={cn(
                      'flex-1 flex items-center gap-base px-gutter py-3 rounded-[1rem] border-2 transition-all font-semibold text-[14px]',
                      educationLevel === opt.value
                        ? 'bg-primary-container text-on-primary-container border-primary shadow-[0_4px_0_0_#763300]'
                        : 'bg-surface-container-highest text-on-surface-variant border-outline-variant hover:border-surface-variant-highest'
                    )}
                  >
                    <span className="material-symbols-outlined text-[18px]">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
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
                onChange={e => { setWeeklyGoal(Number(e.target.value)); markDirty() }}
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
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">Education</span>
                  <span className="text-on-surface font-medium">{educationLevel === 'tertiary' ? 'University' : 'SHS'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">Level</span>
                  <span className="text-on-surface font-medium">Level {(profileData as any)?.level?.num || 1}</span>
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
          <p className="text-[14px] text-on-surface-variant">Choose which notifications you&apos;d like to receive.</p>
          {NOTIFICATION_ITEMS.map((item) => (
            <div key={item.key} className="flex items-center justify-between py-3 border-b border-outline-variant/20 last:border-0">
              <div className="flex items-center gap-base">
                <span className="material-symbols-outlined text-primary text-[20px]">{item.icon}</span>
                <div>
                  <p className="font-semibold text-on-surface text-[15px]">{item.label}</p>
                  <p className="text-on-surface-variant text-[13px]">{item.desc}</p>
                </div>
              </div>
              <button
                onClick={() => toggleNotification(item.key)}
                className={cn(
                  'w-12 h-6 rounded-full transition-colors relative flex-shrink-0',
                  notificationPrefs[item.key] ? 'bg-primary-container' : 'bg-surface-container-highest'
                )}
              >
                <div className={cn(
                  'absolute top-1 w-4 h-4 rounded-full bg-on-primary shadow-md transition-all',
                  notificationPrefs[item.key] ? 'right-1' : 'left-1'
                )} />
              </button>
            </div>
          ))}
          <div className="flex justify-end pt-stack-sm">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="px-gutter py-stack-sm bg-primary text-on-primary font-bold rounded-full shadow-[0_4px_0_0_#763300] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save Preferences'}
            </button>
          </div>
        </div>
      )}

      {/* ── Account Tab ───────────────────────────────── */}
      {activeTab === 'Account' && (
        <div className="space-y-stack-md">
          {/* Change Password */}
          <button
            onClick={() => setShowChangePassword(true)}
            className="w-full flex items-center justify-between px-stack-md py-4 rounded-[1.5rem] bg-surface-container-low hover:bg-surface-container transition-all border border-outline-variant/20"
          >
            <div className="flex items-center gap-base">
              <span className="material-symbols-outlined text-primary">lock</span>
              <div className="text-left">
                <p className="text-[15px] font-semibold text-on-surface">Change Password</p>
                <p className="text-[13px] text-on-surface-variant">Update your account password</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </button>

          {/* Connected Accounts */}
          <div className="w-full flex items-center justify-between px-stack-md py-4 rounded-[1.5rem] bg-surface-container-low border border-outline-variant/20">
            <div className="flex items-center gap-base">
              <span className="material-symbols-outlined text-primary">link</span>
              <div className="text-left">
                <p className="text-[15px] font-semibold text-on-surface">Connected Accounts</p>
                <p className="text-[13px] text-on-surface-variant">
                  {(session?.user as any)?.avatar?.includes('google') || (session?.user as any)?.image
                    ? 'Google account connected'
                    : 'No connected accounts'}
                </p>
              </div>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </div>

          {/* Export Data */}
          <button
            onClick={() => setShowExportConfirm(true)}
            className="w-full flex items-center justify-between px-stack-md py-4 rounded-[1.5rem] bg-surface-container-low hover:bg-surface-container transition-all border border-outline-variant/20"
          >
            <div className="flex items-center gap-base">
              <span className="material-symbols-outlined text-primary">download</span>
              <div className="text-left">
                <p className="text-[15px] font-semibold text-on-surface">Export My Data</p>
                <p className="text-[13px] text-on-surface-variant">Download all your data as JSON</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </button>

          {/* Delete Account */}
          <button
            onClick={() => setShowDeleteAccount(true)}
            className="w-full flex items-center justify-between px-stack-md py-4 rounded-[1.5rem] bg-error-container/10 hover:bg-error-container/20 transition-all border border-error/20"
          >
            <div className="flex items-center gap-base">
              <span className="material-symbols-outlined text-error">delete_forever</span>
              <div className="text-left">
                <p className="text-[15px] font-semibold text-error">Delete Account</p>
                <p className="text-[13px] text-on-surface-variant">Permanently delete your account and all data</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-error">chevron_right</span>
          </button>
        </div>
      )}

      {/* ── Save button (Profile + Notifications) ────── */}
      {activeTab === 'My Profile' && (
        <div className="mt-stack-lg flex justify-end gap-stack-md">
          <button
            onClick={handleDiscard}
            className="px-gutter py-stack-sm text-on-surface-variant font-bold hover:text-error transition-colors"
          >
            Discard changes
          </button>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending || goalMutation.isPending}
            className="px-margin-desktop py-stack-sm bg-primary text-on-primary font-bold rounded-full shadow-[0_6px_0_0_#763300] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50"
          >
            {(updateMutation.isPending || goalMutation.isPending) ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      )}

      {/* ── Change Password Modal ────────────────────── */}
      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onSubmit={(current, newPw) => changePasswordMutation.mutate({ current_password: current, new_password: newPw })}
          isLoading={changePasswordMutation.isPending}
        />
      )}

      {/* ── Export Data Confirm ───────────────────────── */}
      {showExportConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-gutter" onClick={() => setShowExportConfirm(false)}>
          <div className="bg-surface-container-low rounded-[1.5rem] p-gutter max-w-sm w-full border border-outline-variant/20 shadow-lg" onClick={e => e.stopPropagation()}>
            <h3 className="text-[20px] font-bold text-on-surface mb-base">Export Data</h3>
            <p className="text-[14px] text-on-surface-variant mb-stack-md">
              Download all your profile data, resources, and progress as a JSON file.
            </p>
            <div className="flex gap-stack-sm justify-end">
              <button onClick={() => setShowExportConfirm(false)} className="px-gutter py-stack-sm text-on-surface-variant font-bold rounded-full hover:bg-surface-container transition-all">Cancel</button>
              <button
                onClick={() => exportDataMutation.mutate()}
                disabled={exportDataMutation.isPending}
                className="px-gutter py-stack-sm bg-primary text-on-primary font-bold rounded-full shadow-[0_4px_0_0_#763300] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50"
              >
                {exportDataMutation.isPending ? 'Exporting…' : 'Export'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Account Modal ──────────────────────── */}
      {showDeleteAccount && (
        <DeleteAccountModal
          onClose={() => setShowDeleteAccount(false)}
          onSubmit={(password) => deleteAccountMutation.mutate(password)}
          isLoading={deleteAccountMutation.isPending}
        />
      )}
    </div>
  )
}

// ── Change Password Modal ────────────────────────────────────────
function ChangePasswordModal({ onClose, onSubmit, isLoading }: {
  onClose: () => void
  onSubmit: (current: string, newPw: string) => void
  isLoading: boolean
}) {
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const handleSubmit = () => {
    setError('')
    if (!current || !newPw) {
      setError('All fields are required.')
      return
    }
    if (newPw.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPw !== confirmPw) {
      setError('Passwords do not match.')
      return
    }
    onSubmit(current, newPw)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-gutter" onClick={onClose}>
      <div className="bg-surface-container-low rounded-[1.5rem] p-gutter max-w-md w-full border border-outline-variant/20 shadow-lg" onClick={e => e.stopPropagation()}>
        <h3 className="text-[20px] font-bold text-on-surface mb-stack-md">Change Password</h3>

        <div className="space-y-stack-sm">
          <div>
            <label className="text-[13px] font-bold text-primary block mb-base">Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                className="w-full bg-surface-container-highest border border-outline-variant focus:border-secondary rounded-full px-gutter py-3 text-[15px] text-on-surface focus:outline-none pr-12"
                placeholder="Enter current password"
                value={current}
                onChange={e => setCurrent(e.target.value)}
              />
              <button onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">{showCurrent ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-[13px] font-bold text-primary block mb-base">New Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                className="w-full bg-surface-container-highest border border-outline-variant focus:border-secondary rounded-full px-gutter py-3 text-[15px] text-on-surface focus:outline-none pr-12"
                placeholder="Enter new password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
              />
              <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">{showNew ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-[13px] font-bold text-primary block mb-base">Confirm New Password</label>
            <input
              type="password"
              className="w-full bg-surface-container-highest border border-outline-variant focus:border-secondary rounded-full px-gutter py-3 text-[15px] text-on-surface focus:outline-none"
              placeholder="Confirm new password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-error text-[13px] mt-base font-semibold">{error}</p>}

        <div className="flex gap-stack-sm justify-end mt-stack-md">
          <button onClick={onClose} className="px-gutter py-stack-sm text-on-surface-variant font-bold rounded-full hover:bg-surface-container transition-all">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-gutter py-stack-sm bg-primary text-on-primary font-bold rounded-full shadow-[0_4px_0_0_#763300] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50"
          >
            {isLoading ? 'Changing…' : 'Change Password'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete Account Modal ────────────────────────────────────────
function DeleteAccountModal({ onClose, onSubmit, isLoading }: {
  onClose: () => void
  onSubmit: (password: string) => void
  isLoading: boolean
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [confirmText, setConfirmText] = useState('')

  const handleSubmit = () => {
    setError('')
    if (!password) {
      setError('Password is required.')
      return
    }
    if (confirmText !== 'DELETE') {
      setError('Type DELETE to confirm.')
      return
    }
    onSubmit(password)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-gutter" onClick={onClose}>
      <div className="bg-surface-container-low rounded-[1.5rem] p-gutter max-w-md w-full border border-error/20 shadow-lg" onClick={e => e.stopPropagation()}>
        <h3 className="text-[20px] font-bold text-error mb-base">Delete Account</h3>
        <p className="text-[14px] text-on-surface-variant mb-stack-md">
          This action is <span className="font-bold text-error">permanent</span>. All your data, resources, progress, and subscription will be deleted forever.
        </p>

        <div className="space-y-stack-sm">
          <div>
            <label className="text-[13px] font-bold text-primary block mb-base">Enter your password</label>
            <input
              type="password"
              className="w-full bg-surface-container-highest border border-outline-variant focus:border-error rounded-full px-gutter py-3 text-[15px] text-on-surface focus:outline-none"
              placeholder="Your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[13px] font-bold text-primary block mb-base">Type <span className="text-error">DELETE</span> to confirm</label>
            <input
              type="text"
              className="w-full bg-surface-container-highest border border-outline-variant focus:border-error rounded-full px-gutter py-3 text-[15px] text-on-surface focus:outline-none"
              placeholder='Type "DELETE"'
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-error text-[13px] mt-base font-semibold">{error}</p>}

        <div className="flex gap-stack-sm justify-end mt-stack-md">
          <button onClick={onClose} className="px-gutter py-stack-sm text-on-surface-variant font-bold rounded-full hover:bg-surface-container transition-all">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-gutter py-stack-sm bg-error text-white font-bold rounded-full shadow-[0_4px_0_0_#7a0000] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50"
          >
            {isLoading ? 'Deleting…' : 'Delete Account'}
          </button>
        </div>
      </div>
    </div>
  )
}
