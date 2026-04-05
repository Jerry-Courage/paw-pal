'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { authApi } from '@/lib/api'
import { User, Bell, Shield, Palette, Upload, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getInitials } from '@/lib/utils'
import ThemeToggle from '@/components/ui/ThemeToggle'

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'security', label: 'Security', icon: Shield },
]

export default function SettingsPage() {
  const [tab, setTab] = useState('profile')
  const { data: session } = useSession()

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Manage your account and preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          {tab === 'profile' && <ProfileSettings />}
          {tab === 'notifications' && <NotificationSettings />}
          {tab === 'appearance' && <AppearanceSettings />}
          {tab === 'security' && <SecuritySettings />}
        </div>
      </div>
    </div>
  )
}

function ProfileSettings() {
  const { data: session } = useSession()
  const [saved, setSaved] = useState(false)

  // Load real profile data from backend
  const { data: profileData } = useQuery({
    queryKey: ['profile'],
    queryFn: () => authApi.me().then(r => r.data),
  })

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    username: '',
    bio: '',
    university: '',
    weekly_goal_hours: 10,
  })

  // Populate form once profile loads
  useEffect(() => {
    if (profileData) {
      setForm({
        first_name: profileData.first_name || '',
        last_name: profileData.last_name || '',
        username: profileData.username || '',
        bio: profileData.bio || '',
        university: profileData.university || '',
        weekly_goal_hours: profileData.weekly_goal_hours || 10,
      })
    }
  }, [profileData])

  const mutation = useMutation({
    mutationFn: () => authApi.updateProfile(form),
    onSuccess: () => {
      setSaved(true)
      toast.success('Profile updated!')
      setTimeout(() => setSaved(false), 2000)
    },
    onError: () => toast.error('Failed to update profile.'),
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const name = profileData?.first_name
    ? `${profileData.first_name} ${profileData.last_name || ''}`.trim()
    : session?.user?.name || session?.user?.email || 'User'

  return (
    <div className="card p-6 space-y-6">
      <h2 className="font-semibold text-gray-900 dark:text-white">Profile Information</h2>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="w-20 h-20 bg-sky-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">
            {getInitials(name)}
          </div>
          <button className="absolute bottom-0 right-0 w-7 h-7 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Upload className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{name}</p>
          <p className="text-sm text-gray-400">{session?.user?.email}</p>
          <button className="text-xs text-sky-500 hover:underline mt-1">Change avatar</button>
        </div>
      </div>

      {/* Form */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">First Name</label>
          <input value={form.first_name} onChange={set('first_name')} placeholder="First name" className="input" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Last Name</label>
          <input value={form.last_name} onChange={set('last_name')} placeholder="Last name" className="input" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Username</label>
          <input value={form.username} onChange={set('username')} placeholder="username" className="input" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">University</label>
          <input value={form.university} onChange={set('university')} placeholder="e.g. MIT" className="input" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Bio</label>
          <textarea value={form.bio} onChange={set('bio')} placeholder="Tell us about yourself..." className="input resize-none" rows={3} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Weekly Study Goal (hours)</label>
          <input
            type="number" min={1} max={100}
            value={form.weekly_goal_hours}
            onChange={(e) => setForm((f) => ({ ...f, weekly_goal_hours: Number(e.target.value) }))}
            className="input"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="btn-primary flex items-center gap-2"
        >
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
          {mutation.isPending ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

function NotificationSettings() {
  const [settings, setSettings] = useState({
    study_reminders: true,
    group_messages: true,
    ai_nudges: true,
    community_posts: false,
    deadline_alerts: true,
    weekly_summary: true,
  })

  const toggle = (k: string) => setSettings((s) => ({ ...s, [k]: !s[k as keyof typeof s] }))

  const items = [
    { key: 'study_reminders', label: 'Study Reminders', sub: 'Get notified when a study session is about to start' },
    { key: 'group_messages', label: 'Group Messages', sub: 'Notifications for new messages in your groups' },
    { key: 'ai_nudges', label: 'AI Nudges', sub: 'FlowAI suggestions and study tips' },
    { key: 'community_posts', label: 'Community Posts', sub: 'New posts from people you follow' },
    { key: 'deadline_alerts', label: 'Deadline Alerts', sub: 'Reminders 24h and 1h before deadlines' },
    { key: 'weekly_summary', label: 'Weekly Summary', sub: 'Your weekly study stats and achievements' },
  ]

  return (
    <div className="card p-6">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-5">Notification Preferences</h2>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between py-3 border-b border-gray-50 dark:border-gray-800 last:border-0">
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{item.sub}</div>
            </div>
            <button
              onClick={() => toggle(item.key)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                settings[item.key as keyof typeof settings] ? 'bg-sky-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                settings[item.key as keyof typeof settings] ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function AppearanceSettings() {
  return (
    <div className="card p-6 space-y-6">
      <h2 className="font-semibold text-gray-900 dark:text-white">Appearance</h2>

      <div className="flex items-center justify-between py-3 border-b border-gray-50 dark:border-gray-800">
        <div>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Dark Mode</div>
          <div className="text-xs text-gray-400 mt-0.5">Switch between light and dark theme</div>
        </div>
        <ThemeToggle />
      </div>

      <div>
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Accent Color</div>
        <div className="flex gap-3">
          {['bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-500', 'bg-pink-500'].map((c) => (
            <button key={c} className={`w-8 h-8 rounded-full ${c} ring-2 ring-offset-2 ring-transparent hover:ring-gray-300 dark:hover:ring-gray-600 transition-all first:ring-sky-500`} />
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Font Size</div>
        <div className="flex gap-2">
          {['Small', 'Medium', 'Large'].map((s, i) => (
            <button key={s} className={`px-4 py-2 rounded-lg text-sm border transition-colors ${i === 1 ? 'border-sky-500 bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function SecuritySettings() {
  const [form, setForm] = useState({ current: '', new_pass: '', confirm: '' })
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="card p-6 space-y-6">
      <h2 className="font-semibold text-gray-900 dark:text-white">Security</h2>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Current Password</label>
          <input type="password" value={form.current} onChange={set('current')} placeholder="••••••••" className="input" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">New Password</label>
          <input type="password" value={form.new_pass} onChange={set('new_pass')} placeholder="••••••••" className="input" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Confirm New Password</label>
          <input type="password" value={form.confirm} onChange={set('confirm')} placeholder="••••••••" className="input" />
        </div>
        <button className="btn-primary text-sm">Update Password</button>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800 pt-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Connected Accounts</h3>
        {[
          { name: 'Google', icon: '🌐', connected: false },
          { name: 'GitHub', icon: '🐙', connected: false },
        ].map((a) => (
          <div key={a.name} className="flex items-center justify-between py-3 border-b border-gray-50 dark:border-gray-800 last:border-0">
            <div className="flex items-center gap-3">
              <span className="text-xl">{a.icon}</span>
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{a.name}</div>
                <div className="text-xs text-gray-400">{a.connected ? 'Connected' : 'Not connected'}</div>
              </div>
            </div>
            <button className={a.connected ? 'btn-secondary text-xs' : 'btn-primary text-xs'}>
              {a.connected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800 pt-5">
        <h3 className="text-sm font-semibold text-red-500 mb-2">Danger Zone</h3>
        <p className="text-xs text-gray-400 mb-3">Once you delete your account, there is no going back.</p>
        <button className="text-sm text-red-500 border border-red-200 dark:border-red-900 px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
          Delete Account
        </button>
      </div>
    </div>
  )
}
