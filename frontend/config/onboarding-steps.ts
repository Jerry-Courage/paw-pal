import { Step } from 'react-joyride'

export type TourType = 'welcome' | 'library' | 'planner' | 'workspace' | 'community' | 'assignments'

export const TOUR_STEPS: Record<TourType, Step[]> = {
  welcome: [
    {
      target: '#tour-welcome',
      title: 'Welcome to FlowState!',
      content: 'Your journey to hyper-focused studying starts here. This is your personal mission control, where you can see your focus stats and study streaks.',
      placement: 'bottom' as const,
      disableBeacon: true,
    },
    {
      target: '#tour-analytics',
      title: 'Study Analytics',
      content: 'Track your weekly goals, daily focus time, and flashcard mastery. FlowState uses data to keep you on track for your exams.',
      placement: 'left' as const,
    },
    {
      target: '#tour-quick-actions',
      title: 'Fast-Track Actions',
      content: 'Upload files, start group sessions, or jump into an AI chat instantly from these quick-access cards.',
      placement: 'top' as const,
    },
    {
      target: '.ai-assistant-orb',
      title: 'Meet Flow',
      content: 'This is Flow, your AI study companion. You can talk to him anytime. Try clicking him or just speak aloud to start a hands-free study session.',
      placement: 'left' as const,
    }
  ],
  library: [
    {
      target: '#tour-library-upload',
      title: 'Global Knowledge Base',
      content: 'Upload PDFs, YouTube links, or lecture notes. Our AI will automatically index them and build a custom study kit for you.',
      placement: 'bottom' as const,
      disableBeacon: true,
    },
    {
      target: '#tour-library-flashcards',
      title: 'Magic Flashcards',
      content: 'Generate smart flashcards from your documents with one click. We use spaced repetition to ensure you never forget what you learn.',
      placement: 'right' as const,
    }
  ],
  planner: [
    {
      target: '#tour-planner-calendar',
      title: 'Adaptive Scheduling',
      content: 'Plan your study blocks here. FlowState will remind you when it\'s time to focus and helps you manage your deadlines.',
      placement: 'bottom' as const,
      disableBeacon: true,
    }
  ],
  workspace: [
    {
      target: '#tour-workspace-create',
      title: 'Project Command Center',
      content: 'Create collaborative workspaces for your projects. You can prompt FlowAI to write papers, summarize long readings, or brainstorm ideas with you.',
      placement: 'bottom' as const,
      disableBeacon: true,
    },
    {
      target: '#tour-workspace-list',
      title: 'Your Knowledge Hubs',
      content: 'Tackle complex assignments by organizing them into distinct workspaces. Everything is synced in real-time for you and your team.',
      placement: 'top' as const,
    }
  ],
  community: [
    {
      target: '#tour-community-tabs',
      title: 'Live Study Network',
      content: 'Study is better together. Explore live study rooms, participate in academic challenges, or check the global leaderboard.',
      placement: 'bottom' as const,
      disableBeacon: true,
    },
    {
      target: '#tour-community-feed',
      title: 'Knowledge Feed',
      content: 'Share resources, ask questions to the community, and see what fellow students are learning in real-time.',
      placement: 'right' as const,
    }
  ],
  assignments: [
    {
      target: '#tour-assignments-new',
      title: 'AI Assignments',
      content: 'Upload your assignment prompts here. FlowAI will analyze the requirements and help you synthesize a high-quality initial draft.',
      placement: 'bottom' as const,
      disableBeacon: true,
    },
    {
      target: '#tour-assignments-list',
      title: 'Objective Tracking',
      content: 'Keep track of all your academic tasks. You can view progress, AI processing status, and final outputs all in one place.',
      placement: 'top' as const,
    }
  ]
}
