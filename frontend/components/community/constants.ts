import { Sparkles, Trophy, Calendar } from 'lucide-react'

export const TABS = [
  { id: 'feed', label: 'Nexus Feed', icon: Sparkles },
  { id: 'leaderboard', label: 'Hall of Fame', icon: Trophy },
  { id: 'events', label: 'Live Events', icon: Calendar },
]

export const POST_TYPES = [
  { id: 'general', label: 'General', icon: '💬', color: 'bg-slate-100 text-slate-600' },
  { id: 'question', label: 'Question', icon: '❓', color: 'bg-orange-100 text-orange-600' },
  { id: 'resource', label: 'Resource', icon: '📚', color: 'bg-sky-100 text-sky-600' },
  { id: 'tip', label: 'Study Tip', icon: '💡', color: 'bg-yellow-100 text-yellow-600' },
  { id: 'achievement', label: 'Achievement', icon: '🏆', color: 'bg-emerald-100 text-emerald-600' },
]
