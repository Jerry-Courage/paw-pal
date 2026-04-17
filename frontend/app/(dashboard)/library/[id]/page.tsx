'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { libraryApi } from '@/lib/api'
import {
  ArrowLeft, Sparkles, HelpCircle, Loader2,
  Brain, Map, X, RotateCcw, Save, Wand2, BookOpen,
  PanelBottomOpen, ChevronDown, Radio,
  PanelRightOpen, PanelRightClose
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'

// Components
import RichNotesViewer from '@/components/library/RichNotesViewer'
import StudyCompanionSidebar from '@/components/library/StudyCompanionSidebar'
import PracticeTest from '@/components/library/PracticeTest'
import MCQQuizContainer from '@/components/library/MCQQuiz'
import PodcastPlayer from '@/components/library/PodcastPlayer'
import ExpandableMobileHUD from '@/components/ui/ExpandableMobileHUD'
import MusicGeneratorModal from '@/components/library/MusicGeneratorModal'
import MathSolverModal from '@/components/library/MathSolverModal'
import MindMapContent from '@/components/library/MindMapContent'

import FlashcardGeneratorModal from '@/components/library/FlashcardGeneratorModal'

const PDFViewer = dynamic(() => import('@/components/library/PDFViewer'), { ssr: false })

export default function ResourcePage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const [tab, setTab] = useState<'notes' | 'original'>('notes')
  const [showQuiz, setShowQuiz] = useState(false)
  const [showMindMap, setShowMindMap] = useState(false)
  const [showPractice, setShowPractice] = useState(false)
  const [showPodcast, setShowPodcast] = useState(false)
  const [currentTheme, setCurrentTheme] = useState('theme-slate')
  const [showMusic, setShowMusic] = useState(false)
  const [showMath, setShowMath] = useState(false)
  const [showFlashcards, setShowFlashcards] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false) 
  const [mindMapData, setMindMapData] = useState<any>(null)
  const [practiceData, setPracticeData] = useState<any>(null)
  const [isCompanionVisible, setIsCompanionVisible] = useState(true)
  const [generatingTool, setGeneratingTool] = useState<string | null>(null)
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [selectedProblem, setSelectedProblem] = useState('')

  const qc = useQueryClient()

  const { data: resource, isLoading, refetch } = useQuery({
    queryKey: ['resource', id],
    queryFn: () => libraryApi.getResource(id).then((r) => r.data),
    refetchInterval: (query) => {
      const data = query.state.data as any
      return (data?.status === 'processing' || !data?.has_study_kit) ? 5000 : false
    }
  })

  // High-Performance Subject Detection
  const isMathMode = useMemo(() => {
    if (!resource?.title) return false
    const title = resource.title.toLowerCase()
    const mathKeywords = ['math', 'calculus', 'ebs301', 'algebra', 'physics', 'stats', 'geometry', 'matrix']
    return mathKeywords.some(kw => title.includes(kw))
  }, [resource?.title])

  const saveNotesMutation = useMutation({
    mutationFn: (updatedNotes: any) => libraryApi.updateResource(id, { ai_notes_json: updatedNotes }),
    onSuccess: () => {
      toast.success('Notes saved!')
      qc.invalidateQueries({ queryKey: ['resource', id] })
    }
  })

  const handleOpenQuiz = () => setShowQuiz(true)

  const handleOpenMindMap = async () => {
    if (mindMapData) { setShowMindMap(true); return }
    setGeneratingTool('mindmap')
    try {
      const res = await libraryApi.generateMindMap(id)
      setMindMapData(res.data)
      setShowMindMap(true)
    } catch {
      toast.error('Failed to generate mind map.')
    } finally {
      setGeneratingTool(null)
    }
  }

  const handleOpenPractice = async () => {
    setGeneratingTool('practice')
    try {
      const res = await libraryApi.generatePracticeQuestions(id, 'medium', 5)
      setPracticeData(res.data.questions || res.data)
      setShowPractice(true)
    } catch {
      toast.error('Failed to generate practice session.')
    } finally {
      setGeneratingTool(null)
    }
  }

  const handleOpenFlashcards = () => {
    setShowFlashcards(true)
  }

  const handleOpenMath = (prob?: string) => {
    setSelectedProblem(prob || '')
    setShowMath(true)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-[80vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center animate-bounce">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Entering Study Center...</p>
      </div>
    </div>
  )

  if (!resource) return (
    <div className="flex flex-col items-center justify-center h-[80vh] text-center p-6">
      <X className="w-12 h-12 text-rose-500 mb-4" />
      <h1 className="text-2xl font-black text-slate-900 dark:text-white">Resource Not Found</h1>
      <p className="text-slate-500 mt-2">The document you're looking for doesn't exist.</p>
      <Link href="/library" className="btn-primary mt-6">Back to Library</Link>
    </div>
  )

  const hasNotes = resource.has_study_kit && resource.ai_notes_json && Object.keys(resource.ai_notes_json).length > 0

  return (
    <div className={cn(
      "flex flex-col lg:flex-row h-[calc(100dvh-64px)] -m-4 md:-m-6 overflow-hidden bg-slate-50 dark:bg-slate-950 transition-colors duration-500",
      currentTheme
    )}>

      {/* ── Main Content Area: The Material ─────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 overflow-hidden relative transition-all duration-700 ease-in-out">
        
        {/* Top Navigation Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link href="/library" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all shrink-0">
              <ArrowLeft className="w-5 h-5 text-slate-500" />
            </Link>
            <div className="min-w-0">
              <div className="hidden sm:block text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-0.5">FlowState Matrix</div>
              <h1 className="text-sm sm:text-lg font-black text-slate-900 dark:text-white truncate">{resource.title}</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
              {(['notes', 'original'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'px-3 sm:px-4 py-1.5 sm:py-2 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all',
                    tab === t 
                      ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' 
                      : 'text-slate-400 hover:text-slate-600'
                  )}
                >
                  {t === 'notes' ? 'Notes' : (resource.resource_type === 'video' ? 'Video' : 'PDF')}
                </button>
              ))}
            </div>
            
            <Link href={`/api/library/resources/${id}/export/anki//`} className="hidden sm:flex p-2.5 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 rounded-2xl transition-all" title="Export Anki">
              <Save className="w-5 h-5" />
            </Link>
            <button 
              onClick={() => {
                toast.promise(libraryApi.refetchTranscript(id), {
                  loading: 'Re-extracting authentic content...',
                  success: 'Authentic signal found! Regenerating Study Kit...',
                  error: 'Failed to trigger recovery.'
                })
              }} 
              className="hidden sm:flex p-2.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-2xl transition-all"
              title="Re-Analyze Material (High Fidelity)"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button onClick={() => refetch()} className="p-2 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-2xl transition-all" title="Refresh">
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button 
              onClick={() => setIsCompanionVisible(!isCompanionVisible)} 
              className="hidden lg:flex p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary rounded-2xl transition-all"
              title={isCompanionVisible ? "Hide Companion" : "Show Companion"}
            >
              {isCompanionVisible ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* The Scrollable Learning Canvas */}
        <div className="flex-1 overflow-y-auto scrollbar-hide bg-slate-50/50 dark:bg-slate-950/50 relative">
          {tab === 'notes' ? (
            !hasNotes ? (
              <div className="flex flex-col items-center justify-center h-full p-12 text-center space-y-8">
                <div className="w-24 h-24 bg-primary/10 rounded-[2.5rem] flex items-center justify-center animate-pulse">
                  <Sparkles className="w-12 h-12 text-primary" />
                </div>
                <div className="max-w-md">
                  <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-4">Generating Matrix</h2>
                  <p className="text-slate-500 font-medium leading-relaxed italic">FlowAI is extracting deep concepts and formalizing the math logic...</p>
                </div>
              </div>
            ) : (
              <RichNotesViewer
                notes={resource.ai_notes_json}
                isEditing={isEditingNotes}
                setIsEditing={setIsEditingNotes}
                isMathMode={isMathMode}
                onSave={(updated) => {
                  saveNotesMutation.mutate(updated)
                  setIsEditingNotes(false)
                }}
                onOpenMath={handleOpenMath}
              />
            )
          ) : (
            <div className="h-full">
              {resource.resource_type === 'pdf' && resource.file_url ? (
                <PDFViewer fileUrl={resource.file_url} title={resource.title} />
              ) : resource.resource_type === 'video' && resource.url ? (
                <div className="h-full flex flex-col p-6 space-y-4">
                  <div className="flex-1 bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-100 dark:border-slate-800 relative group">
                    <iframe
                      src={`https://www.youtube.com/embed/${resource.url.includes('v=') ? resource.url.split('v=')[1].split('&')[0] : resource.url.split('youtu.be/')[1]?.split('?')[0]}`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider mb-2">Original Context</h3>
                    <p className="text-xs text-slate-500 italic">You are currently viewing the synchronized source video. The Study Kit below was generated from this timestamped transcript.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-12 text-center">
                  <BookOpen className="w-12 h-12 text-slate-300 mb-4" />
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Preview Not Available</h2>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Fixed Sidebar: Traditional Support Desk ─────────────────────────── */}
      {isCompanionVisible && (
        <div className="hidden lg:flex border-l border-slate-100 dark:border-slate-800 flex-shrink-0 w-[400px] animate-in slide-in-from-right duration-300">
          <StudyCompanionSidebar
            resourceId={id}
            resourceTitle={resource.title}
            hasNotes={hasNotes}
            onOpenQuiz={handleOpenQuiz}
            onOpenFlashcards={handleOpenFlashcards}
            onOpenMindMap={handleOpenMindMap}
            onOpenPractice={handleOpenPractice}
            onOpenMusic={() => setShowMusic(true)}
            onOpenPodcast={() => setShowPodcast(true)}
            onOpenMath={() => handleOpenMath()}
            isGenerating={generatingTool}
            currentTheme={currentTheme}
            onThemeChange={(t) => setCurrentTheme(t)}
          />
        </div>
      )}

      {/* ── Mobile Sidebar Drawer ─────────────────────────────────── */}
      {showSidebar && (
        <div className="lg:hidden fixed inset-0 z-[90] flex">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSidebar(false)} />
          <div className="relative ml-auto w-[90vw] max-w-sm h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <span className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> FlowAI Study Tools
              </span>
              <button onClick={() => setShowSidebar(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <StudyCompanionSidebar
                resourceId={id}
                resourceTitle={resource.title}
                hasNotes={hasNotes}
                onOpenQuiz={() => { setShowSidebar(false); handleOpenQuiz() }}
                onOpenFlashcards={() => { setShowSidebar(false); handleOpenFlashcards() }}
                onOpenMindMap={() => { setShowSidebar(false); handleOpenMindMap() }}
                onOpenPractice={() => { setShowSidebar(false); handleOpenPractice() }}
                onOpenMusic={() => { setShowSidebar(false); setShowMusic(true) }}
                onOpenPodcast={() => { setShowSidebar(false); setShowPodcast(true) }}
                onOpenMath={() => { setShowSidebar(false); handleOpenMath() }}
                isGenerating={generatingTool}
                hideTools={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Overlays (Quiz, Practice, etc.) ─────────────────────── */}
      {showQuiz && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/80 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-950 w-full sm:max-w-lg h-[92vh] sm:h-[85vh] rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl border-0 sm:border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-slate-900 dark:text-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-orange-500 shadow-lg shadow-orange-500/30">
                  <HelpCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-black">Mastery Quiz</h2>
                  <p className="text-xs text-slate-500">Multiple choice questions</p>
                </div>
              </div>
              <button onClick={() => setShowQuiz(false)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <MCQQuizContainer resourceId={id} onClose={() => setShowQuiz(false)} />
            </div>
          </div>
        </div>
      )}

      {showPractice && practiceData && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/80 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-950 w-full sm:max-w-2xl h-[92vh] sm:h-[85vh] rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl border-0 sm:border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-slate-900 dark:text-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/30">
                  <Wand2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-black">Practice Session</h2>
                  <p className="text-xs text-slate-500">Written answers · AI graded feedback</p>
                </div>
              </div>
              <button onClick={() => setShowPractice(false)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <PracticeTest
                questions={practiceData}
                resourceId={id}
                onFinish={() => setShowPractice(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Podcast (FlowCast) Modal - Persistently mounted to allow background audio logic */}
      <div className={cn(
        "fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/80 backdrop-blur-md p-0 sm:p-4 transition-all duration-300",
        showPodcast ? "opacity-100 pointer-events-auto scale-100" : "opacity-0 pointer-events-none scale-95"
      )}>
        <div className="bg-white dark:bg-slate-950 w-full sm:max-w-6xl h-full sm:h-auto max-h-[92vh] sm:rounded-[2.5rem] shadow-2xl border-0 sm:border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-slate-900 dark:text-white">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary shadow-lg shadow-primary/30">
                <Radio className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-black uppercase tracking-tight">FlowCast AI</h2>
                <p className="text-xs text-slate-500">Immersive Audio Analysis</p>
              </div>
            </div>
            <button onClick={() => setShowPodcast(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Minimize to Background
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <PodcastPlayer resourceId={id} onClose={() => setShowPodcast(false)} />
          </div>
        </div>
      </div>

      {showMindMap && mindMapData && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/80 backdrop-blur-md p-0 sm:p-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-white dark:bg-slate-950 w-full sm:max-w-6xl h-[92vh] sm:h-[85vh] rounded-t-[2rem] sm:rounded-[2.5rem] shadow-2xl border-0 sm:border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 sm:px-8 py-4 sm:py-5 border-b dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex-shrink-0">
              <div>
                <h2 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                  <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-violet-500" /> Visual Mind Map
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">AI-generated concept branches</p>
              </div>
              <button onClick={() => setShowMindMap(false)} className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] scrollbar-hide">
              <MindMapContent data={mindMapData} />
            </div>
          </div>
        </div>
      )}

      {showMusic && (
        <MusicGeneratorModal
          resourceId={id}
          onClose={() => setShowMusic(false)}
        />
      )}

      {showFlashcards && (
        <FlashcardGeneratorModal
          resourceId={id}
          onClose={() => setShowFlashcards(false)}
          onGenerated={() => setShowFlashcards(false)}
        />
      )}

      <ExpandableMobileHUD
        onOpenQuiz={handleOpenQuiz}
        onOpenMindmap={handleOpenMindMap}
        onOpenMusic={() => setShowMusic(true)}
        onOpenPodcast={() => setShowPodcast(true)}
        onOpenFlashcards={handleOpenFlashcards}
        onOpenPractice={handleOpenPractice}
        onOpenChat={() => setShowSidebar(true)}
        onOpenMath={() => handleOpenMath()}
        isGenerating={generatingTool}
      />

      <MathSolverModal 
        isOpen={showMath}
        onClose={() => setShowMath(false)}
        resourceId={id}
        initialProblem={selectedProblem}
      />
    </div>
  )
}
