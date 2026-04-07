'use client'

import { useState, useEffect, useRef } from 'react'
import { podcastApi } from '@/lib/api'
import { Play, Pause, Loader2, Mic, Settings2, X, AlertCircle, Image as ImageIcon, Sparkles, RefreshCw, XCircle, Quote, Hand } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { libraryApi } from '@/lib/api'

interface PodcastPlayerProps {
  resourceId: number
  onClose?: () => void
}

export default function PodcastPlayer({ resourceId, onClose }: PodcastPlayerProps) {
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [status, setStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle')
  const [chunksTotal, setChunksTotal] = useState(0)
  const [script, setScript] = useState<any[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [visuals, setVisuals] = useState<any[]>([])
  const [showVisual, setShowVisual] = useState(false)
  
  const [isPlaying, setIsPlaying] = useState(false)
  const [isInterrupting, setIsInterrupting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isAnswering, setIsAnswering] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const preloadedBlobs = useRef<Record<number, string>>({})

  // Setup Form
  const [voiceA, setVoiceA] = useState('Christopher')
  const [voiceB, setVoiceB] = useState('Jenny')
  const [interjectionUrls, setInterjectionUrls] = useState<Record<string, string>>({})

  // Fetch visuals and status for synchronization
  useEffect(() => {
    libraryApi.getResource(resourceId).then(res => {
      setVisuals(res.data.extracted_images || [])
    })
    if (sessionId) {
      podcastApi.getStatus(sessionId).then(res => {
        if (res.data.interjection_urls) {
          setInterjectionUrls(res.data.interjection_urls)
        }
      })
    }
  }, [resourceId, sessionId])

  const currentChunk = script && script.length > currentIndex ? script[currentIndex] : null
  const activeVisual = visuals.find(v => {
    if (!v.id || !currentChunk?.visual_ref) return false
    return String(v.id) === String(currentChunk.visual_ref)
  })

  useEffect(() => {
    if (activeVisual || currentChunk?.visual_url) {
      setShowVisual(true)
    } else {
      setShowVisual(false)
    }
  }, [activeVisual, currentChunk])

  // Polling for generation status
  useEffect(() => {
    if (status === 'generating' && sessionId) {
      const interval = setInterval(async () => {
        try {
          const res = await podcastApi.getStatus(sessionId)
          setChunksTotal(res.data.chunks_total)
          setScript(res.data.script)
          if (res.data.status === 'ready') {
            setStatus('ready')
            clearInterval(interval)
          } else if (res.data.status === 'error') {
            setStatus('error')
            clearInterval(interval)
          }
        } catch (e) {
          console.error(e)
        }
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [status, sessionId])

  // Aggressive background prefetching
  useEffect(() => {
    if (status !== 'ready' || !sessionId) return
    const prefetch = async (idx: number) => {
      if (preloadedBlobs.current[idx] || idx >= chunksTotal) return
      try {
        const text = script[idx]?.text || ""
        const res = await podcastApi.getChunk(sessionId, idx, text)
        if (res.data && res.data.type !== 'application/json') {
           preloadedBlobs.current[idx] = URL.createObjectURL(res.data)
        }
      } catch (e) {
        console.error("Prefetch failed for chunk", idx)
      }
    }
    prefetch(currentIndex + 1)
    prefetch(currentIndex + 2)
  }, [currentIndex, status, sessionId, chunksTotal, script])

  useEffect(() => {
    if (status === 'ready' && sessionId && isPlaying) {
      if (!audioRef.current) {
        audioRef.current = new Audio()
        audioRef.current.onended = () => {
          if (currentIndex < chunksTotal - 1) {
            setCurrentIndex(prev => prev + 1)
          } else {
            setIsPlaying(false)
            setCurrentIndex(0)
          }
        }
      }
      
      const fetchAndPlay = async () => {
        try {
          if (preloadedBlobs.current[currentIndex]) {
             if (audioRef.current) {
                audioRef.current.src = preloadedBlobs.current[currentIndex]
                audioRef.current.play().catch(e => {
                  console.warn("Autoplay failed, skipping segment...", e)
                  if (currentIndex < (chunksTotal - 1)) {
                    setCurrentIndex(prev => prev + 1)
                  }
                })
             }
             return
          }
          const text = script[currentIndex]?.text || ""
          const res = await podcastApi.getChunk(sessionId, currentIndex, text)
          if (res.data.type === 'application/json') {
            throw new Error("Server returned JSON instead of Audio");
          }
          const url = URL.createObjectURL(res.data)
          preloadedBlobs.current[currentIndex] = url
          if (audioRef.current) {
             audioRef.current.src = url
             audioRef.current.play().then(() => {
                if (isAnswering) {
                  setIsAnswering(false)
                  toast.dismiss('answering-toast')
                }
             }).catch(e => {
               console.warn("Playback error, skipping segment...", e)
               setCurrentIndex(prev => prev + 1)
             })
          }
        } catch (e) {
          console.error("Podcast stream error, skipping to next segment:", e)
          toast.error("Segment skipped due to high traffic.", { duration: 2000 })
          if (currentIndex < chunksTotal - 1) {
            setCurrentIndex(prev => prev + 1)
          } else {
            setIsPlaying(false)
            setCurrentIndex(0)
          }
        }
      }
      fetchAndPlay()
    }
  }, [currentIndex, status, sessionId, isPlaying, chunksTotal])

  const handleStartGeneration = async () => {
    try {
      setStatus('generating')
      const res = await podcastApi.createSession(resourceId, voiceA, voiceB, 15)
      setSessionId(res.data.session_id)
      if (res.data.status === 'ready') setStatus('ready')
    } catch (e: any) {
      toast.error('Failed to start podcast generation')
      setStatus('error')
    }
  }

  const togglePlay = () => {
    if (isPlaying) { audioRef.current?.pause(); setIsPlaying(false); }
    else setIsPlaying(true)
  }

  const handleInterrupt = async () => {
    if (!sessionId) return
    setIsInterrupting(true)
    if (audioRef.current) { 
      audioRef.current.pause(); 
      audioRef.current.src = ""; 
      setIsPlaying(false); 
    }

    const speakerKey = currentChunk?.speaker || 'A'
    const introUrl = interjectionUrls[speakerKey]
    if (introUrl) { 
      const interAudio = new Audio(introUrl);
      interAudio.play().catch(() => {});
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mr
      audioChunksRef.current = []
      mr.ondataavailable = (e) => audioChunksRef.current.push(e.data)
      mr.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach(t => t.stop())
        setIsRecording(false)
        toast.loading("Hosts are thinking...", { id: 'answering-toast' })
        try {
          setIsAnswering(true)
          const res = await podcastApi.interrupt(sessionId, audioBlob, currentIndex)
          toast.loading("Preparing the answer...", { id: 'answering-toast' })
          preloadedBlobs.current = {}
          if (audioRef.current) audioRef.current.src = "";
          
          setScript(res.data.script)
          setChunksTotal(res.data.new_total)
          setCurrentIndex(currentIndex + 1)
          setIsPlaying(true)
        } catch(e) {
          toast.dismiss('answering-toast')
          setIsAnswering(false)
          setIsPlaying(true)
        }
        setIsInterrupting(false)
      }
      mr.start()
      setIsRecording(true)
    } catch(e) {
      setIsInterrupting(false)
    }
  }

  const [enlargedImage, setEnlargedImage] = useState<string | null>(null)
  
  if (status === 'idle') {
    return (
      <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl animate-in slide-in-from-bottom-4 shadow-2xl relative">
        {onClose && <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>}
        <div className="mb-6">
          <h3 className="text-xl font-black flex items-center gap-2 text-slate-900 dark:text-white"><Settings2 className="w-5 h-5 text-indigo-500" /> FlowCast Setup</h3>
          <p className="text-slate-500 text-sm mt-1">Select your virtual hosts to begin the deep dive.</p>
        </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Host A Voice</label>
                <select className="w-full bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-sm appearance-none cursor-pointer" value={voiceA} onChange={e=>setVoiceA(e.target.value)}>
                  <option value="Christopher">Christopher (Expert)</option>
                  <option value="Guy">Guy (Casual)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Host B Voice</label>
                <select className="w-full bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-sm appearance-none cursor-pointer" value={voiceB} onChange={e=>setVoiceB(e.target.value)}>
                  <option value="Jenny">Jenny (Curious)</option>
                  <option value="Aria">Aria (Sharp)</option>
                </select>
              </div>
            </div>
          </div>
          <button onClick={handleStartGeneration} className="w-full mt-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/30">
            START PODCAST
          </button>
        </div>
    )
  }

  if (status === 'generating') {
    return (
      <div className="p-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-center shadow-2xl">
         <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
         <h3 className="font-black text-xl text-slate-900 dark:text-white">Scripting Session</h3>
         <p className="text-slate-500 text-sm mt-2">The AI hosts are analyzing your notes...</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-red-500/30 rounded-[2.5rem] shadow-2xl text-center space-y-6 w-full">
         <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <XCircle className="w-10 h-10 text-red-500 animate-pulse" />
         </div>
         <div className="space-y-2">
            <h3 className="text-2xl font-bold text-white">Synapse Disconnected</h3>
            <p className="text-slate-400 max-w-xs mx-auto text-sm">The AI hosts encountered a brief signal failure. We can try reconnecting right now.</p>
         </div>
         <button 
           onClick={() => { setStatus('generating'); handleStartGeneration(); }}
           className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl shadow-xl transition-all active:scale-95 flex items-center gap-3 mx-auto"
         >
           <RefreshCw className="w-5 h-5" />
           RETRY CONNECTION
         </button>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[92vh] sm:min-h-[500px] lg:h-[750px] transition-all duration-700 animate-in fade-in zoom-in-95 bg-slate-950 flex flex-col relative">
       
       {/* CINEMATIC STAGE: Top 70% Layout - Scrollable on mobile */}
       <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative custom-scrollbar">
          
          {/* Dynamic Ambient Background - Speaker Reactive */}
          <div className="absolute inset-0 z-0 opacity-40 blur-[120px] pointer-events-none transition-all duration-1000">
             <div className={cn(
                "absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full transition-all duration-1000 animate-pulse",
                currentChunk?.speaker === 'A' ? "bg-indigo-600/40" : "bg-pink-600/20"
             )} />
             <div className={cn(
                "absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full transition-all duration-1000",
                currentChunk?.speaker === 'B' ? "bg-pink-600/40" : "bg-indigo-600/20"
             )} />
          </div>

          {/* LEFT: Massive Visual Stage (60% Width) */}
          <div className="w-full lg:w-[60%] h-[300px] lg:h-full relative z-10 flex items-center justify-center p-4 lg:p-12">
             <div 
               className="w-full h-full rounded-[3rem] overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.5)] border border-white/10 relative group cursor-zoom-in bg-slate-900/50 backdrop-blur-sm"
               onClick={() => (activeVisual || currentChunk?.visual_url) && setEnlargedImage(activeVisual?.image || currentChunk?.visual_url)}
             >
                {(activeVisual || currentChunk?.visual_url) ? (
                   <>
                     <img 
                       src={activeVisual?.image || currentChunk?.visual_url}
                       key={currentIndex}
                       className="w-full h-full object-cover animate-in fade-in duration-1000 scale-100 group-hover:scale-105 transition-transform"
                     />
                     <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />
                     
                     {/* Floating Metadata Tag */}
                     <div className="absolute bottom-10 left-10 right-10 flex items-center justify-between">
                        <div className="space-y-1">
                           <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">AI Visualization Active</span>
                           </div>
                           <p className="text-white font-bold text-lg max-w-sm truncate opacity-90">{activeVisual?.label || "Scene Analysis"}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 text-white group-hover:bg-indigo-600 transition-colors shadow-2xl">
                           <ImageIcon className="w-5 h-5" />
                        </div>
                     </div>
                   </>
                ) : (
                   <div className="w-full h-full flex flex-col items-center justify-center space-y-6 opacity-30">
                      <div className="relative">
                         <div className="w-24 h-24 rounded-full border-2 border-indigo-500/20 animate-spin-slow" />
                         <ImageIcon className="w-8 h-8 text-indigo-500 absolute inset-0 m-auto" />
                      </div>
                      <p className="text-[12px] font-black uppercase tracking-[0.4em] text-indigo-200">Listening to Context...</p>
                   </div>
                )}
             </div>
          </div>

          {/* RIGHT: Production Script & Transcript (40% Width) */}
          <div className="w-full lg:w-[40%] lg:h-full relative z-10 flex flex-col p-8 lg:p-12 lg:pl-0">
             
             {/* Host Avatars - Premium Glassmorphism */}
             <div className="flex items-center gap-10 mb-12">
                <div className="flex flex-col items-center gap-3">
                   <div className={cn(
                      "w-14 h-14 lg:w-20 lg:h-20 rounded-[1.5rem] lg:rounded-[2rem] transition-all duration-500 flex items-center justify-center p-0.5",
                      currentChunk?.speaker === 'A' ? "bg-gradient-to-br from-indigo-500 to-purple-700 shadow-[0_0_40px_rgba(99,102,241,0.4)] scale-110" : "bg-white/5 opacity-20"
                   )}>
                      <div className="w-full h-full bg-slate-950 rounded-[1.4rem] lg:rounded-[1.9rem] flex items-center justify-center font-black text-xl lg:text-2xl text-indigo-400">{voiceA.charAt(0)}</div>
                   </div>
                   <span className={cn("text-[10px] font-black uppercase tracking-widest transition-opacity", currentChunk?.speaker === 'A' ? "text-indigo-400" : "opacity-0")}>Expert</span>
                </div>

                <div className="h-px flex-1 bg-white/5 relative">
                   <div className={cn(
                      "absolute top-0 bottom-0 left-0 w-full bg-gradient-to-r transition-all duration-500",
                      currentChunk?.speaker === 'A' ? "from-indigo-500/50 to-transparent" : "from-transparent to-pink-500/50"
                   )} />
                </div>

                <div className="flex flex-col items-center gap-3">
                   <div className={cn(
                      "w-14 h-14 lg:w-20 lg:h-20 rounded-[1.5rem] lg:rounded-[2rem] transition-all duration-500 flex items-center justify-center p-0.5",
                      currentChunk?.speaker === 'B' ? "bg-gradient-to-br from-pink-500 to-rose-700 shadow-[0_0_40px_rgba(236,72,153,0.4)] scale-110" : "bg-white/5 opacity-20"
                   )}>
                      <div className="w-full h-full bg-slate-950 rounded-[1.4rem] lg:rounded-[1.9rem] flex items-center justify-center font-black text-xl lg:text-2xl text-pink-400">{voiceB.charAt(0)}</div>
                   </div>
                   <span className={cn("text-[10px] font-black uppercase tracking-widest transition-opacity", currentChunk?.speaker === 'B' ? "text-pink-400" : "opacity-0")}>Analyst</span>
                </div>
             </div>

             {/* Dynamic Caption / Scrolled Script */}
             <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 space-y-8 min-h-[150px]">
                <div className="flex gap-4">
                   <Quote className="w-8 h-8 text-indigo-500/20 shrink-0" />
                   <p className="text-xl lg:text-3xl font-medium leading-[1.4] text-white/90 animate-in fade-in slide-in-from-bottom-4 duration-1000" key={currentIndex}>
                      {currentChunk?.text || "Initializing deep dive..."}
                   </p>
                </div>
                
                {/* Transcript Hint */}
                <div className="p-6 rounded-3xl bg-white/5 border border-white/5 space-y-4">
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Live Transcript</span>
                      <div className="flex gap-1">
                         {[1,2,3].map(i => <div key={i} className="w-1 h-3 bg-indigo-500/40 rounded-full animate-bounce" style={{animationDelay: `${i*100}ms`}} />)}
                      </div>
                   </div>
                   <p className="text-xs text-white/40 leading-relaxed italic">
                      Hosts are synthesizing {visuals.length} images and core concepts into a cohesive narrative...
                   </p>
                </div>
             </div>
          </div>
       </div>

       {/* INTERACTION DOCK: Bottom 30% / Mobile Floating Bar - Sticky for visibility */}
       <div className="sticky bottom-0 lg:static h-auto lg:h-[180px] bg-slate-900 shadow-2xl border-t border-white/5 z-50 flex items-center p-4 pb-24 sm:p-6 lg:p-12 lg:pb-12">
          <div className="max-w-6xl mx-auto w-full flex flex-col lg:flex-row items-center justify-between gap-4 sm:gap-6 lg:gap-8">
             
             {/* Controls Group */}
             <div className="flex items-center gap-4 sm:gap-8 w-full lg:w-auto justify-between lg:justify-start">
                <div className="flex items-center gap-4 sm:gap-8">
                   <button 
                     onClick={togglePlay}
                     className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 rounded-full bg-white text-slate-950 flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-110 active:scale-95 transition-all shrink-0"
                   >
                      {isPlaying ? <Pause className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 fill-current" /> : <Play className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 fill-current ml-1" />}
                   </button>
                   
                   <div className="space-y-0.5 sm:space-y-1">
                      <div className="flex items-center gap-2 sm:gap-3">
                         <p className="text-white font-black text-sm sm:text-base lg:text-lg">FlowCast Session</p>
                         <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[8px] sm:text-[9px] font-black text-indigo-400 uppercase">Pro</span>
                      </div>
                      <p className="text-slate-500 text-[10px] sm:text-xs lg:text-sm font-medium">Segment {currentIndex + 1} of {chunksTotal}</p>
                   </div>
                </div>

                {/* Mobile Hand Integration (visible inside control group on mobile) */}
                <div className="lg:hidden flex items-center gap-3">
                   <button 
                     onClick={handleInterrupt}
                     className={cn(
                       "w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95",
                       isRecording ? "bg-rose-600 text-white animate-pulse shadow-[0_0_20px_rgba(225,29,72,0.4)]" : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
                     )}
                   >
                      {isRecording ? <Hand className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                   </button>
                   <button 
                     onClick={onClose}
                     className="w-12 h-12 rounded-full bg-slate-950 text-slate-500 hover:text-white border border-white/5 flex items-center justify-center transition-all"
                   >
                      <X className="w-5 h-5" />
                   </button>
                </div>
             </div>

             {/* Interactive Rail */}
             <div className="flex-1 max-w-xl hidden lg:block mx-12">
                <div className="h-1 w-full bg-white/5 rounded-full relative overflow-hidden">
                   <div 
                     className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                     style={{ width: `${((currentIndex + 1) / (chunksTotal || 1)) * 100}%` }}
                   />
                </div>
             </div>

             {/* Mic / Interrupt Integration (Hidden on mobile as it's moved to control group) */}
             <div className="hidden lg:flex items-center gap-4">
                <button 
                  onClick={handleInterrupt}
                  className={cn(
                    "h-14 lg:h-16 px-6 lg:px-8 rounded-full font-black text-[10px] lg:text-xs uppercase tracking-widest flex items-center gap-3 transition-all active:scale-95",
                    isRecording ? "bg-rose-600 text-white animate-pulse" : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
                  )}
                >
                   {isRecording ? <Hand className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                   {isRecording ? "Listening..." : isInterrupting ? "Thinking..." : "Raise Hand"}
                </button>
                
                <button 
                  onClick={onClose}
                  className="w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-slate-950 text-slate-500 hover:text-white border border-white/5 flex items-center justify-center transition-all"
                >
                   <X className="w-6 h-6" />
                </button>
             </div>
          </div>
       </div>

       {/* ZOOM MODAL (HD VISUAL) */}
       {enlargedImage && (
         <div 
           className="fixed inset-0 z-[1000] bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-12 animate-in rotate-in-1 fade-in zoom-in-95 duration-500"
           onClick={() => setEnlargedImage(null)}
         >
           <button className="absolute top-10 right-10 w-14 h-14 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-all border border-white/10">
             <X className="w-8 h-8" />
           </button>
           <div className="relative group max-w-7xl max-h-[90vh]">
              <img 
                src={enlargedImage} 
                className="w-full h-full object-contain rounded-[3rem] shadow-[0_0_150px_rgba(99,102,241,0.2)]"
                alt="AI Enhancement"
              />
              <div className="absolute -bottom-12 left-0 right-0 text-center">
                 <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Neural Visualization System v2.4</p>
              </div>
           </div>
         </div>
       )}

    </div>
  )
}
