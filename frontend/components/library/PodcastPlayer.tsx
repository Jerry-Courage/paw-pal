'use client'

import { useState, useEffect, useRef } from 'react'
import { podcastApi } from '@/lib/api'
import { Play, Pause, Loader2, Settings2, X, Image as ImageIcon, XCircle, Quote, Hand } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { libraryApi } from '@/lib/api'
import { useAudio } from '@/context/AudioContext'

interface PodcastPlayerProps {
  resourceId: number
  onClose?: () => void
}

export default function PodcastPlayer({ resourceId, onClose }: PodcastPlayerProps) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle')
  const [visuals, setVisuals] = useState<any[]>([])
  const [showVisual, setShowVisual] = useState(false)
  
  const { 
    state: audio, 
    startPodcast, 
    pause: globalPause, 
    resume: globalResume, 
    updateScript, 
    setCurrentIndex,
    stop: globalStop
  } = useAudio()
  
  const [isInterrupting, setIsInterrupting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isAnswering, setIsAnswering] = useState(false)
  const [isHandRaised, setIsHandRaised] = useState(false)
  const [isAcknowledging, setIsAcknowledging] = useState(false)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Setup Form
  const [voiceA, setVoiceA] = useState('Ava')
  const [voiceB, setVoiceB] = useState('Andrew')
  const [interjectionUrls, setInterjectionUrls] = useState<Record<string, string>>({})

  // Fetch visuals and status
  useEffect(() => {
    libraryApi.getResource(resourceId).then(res => {
      setVisuals(res.data.extracted_images || [])
    })
    
    // Restoration logic: Wait for both sessionId AND a populated script before saying "Ready"
    if (audio.activeResourceId === resourceId && audio.sessionId) {
      if (audio.script && audio.script.length > 0) {
        setStatus('ready')
      } else {
        setStatus('generating')
      }

      podcastApi.getStatus(audio.sessionId).then(res => {
        if (res.data.interjection_urls) {
          setInterjectionUrls(res.data.interjection_urls)
        }
      })
    } else if (!audio.sessionId && status !== 'idle') {
      // Session was stopped or cleared — reset to setup screen
      setStatus('idle')
    }
  }, [resourceId, audio.activeResourceId, audio.sessionId, audio.script?.length])

  const currentChunk = audio.script && audio.script.length > audio.currentIndex ? audio.script[audio.currentIndex] : null
  const activeVisual = visuals.find(v => {
    if (!v.id || !currentChunk?.visual_ref) return false
    return String(v.id) === String(currentChunk.visual_ref)
  })

  useEffect(() => {
    setShowVisual(!!(activeVisual || currentChunk?.visual_url))
  }, [activeVisual, currentChunk])

  // Polling for status updates (global script updates)
  useEffect(() => {
    // Continue polling if generating OR if we have a session but it's not 'ready' in the backend yet
    const shouldPoll = status === 'generating' || (status === 'ready' && audio.sessionId && audio.totalChunks === 0)
    
    if (shouldPoll && audio.sessionId) {
      const interval = setInterval(async () => {
        try {
          const res = await podcastApi.getStatus(audio.sessionId!)
          
          // Always update the script in global state
          if (res.data.script && res.data.script.length > 0) {
             updateScript(res.data.script, res.data.chunks_total)
             // Transition to ready as soon as first chunks arrive
             if (status !== 'ready') setStatus('ready')
          }
          
          if (res.data.status === 'ready' && res.data.script && res.data.script.length > 0) {
            clearInterval(interval)
          } else if (res.data.status === 'error') {
            setStatus('error')
            clearInterval(interval)
          }
        } catch (e) {
          console.error("Polling error:", e)
        }
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [status, audio.sessionId, updateScript, audio.totalChunks])

  const handleStartGeneration = async () => {
    try {
      setStatus('generating')
      const res = await podcastApi.createSession(resourceId, voiceA, voiceB, 15)
      const resObj = await libraryApi.getResource(resourceId)
      
      // Initialize global state
      startPodcast(resourceId, resObj.data.title, res.data.session_id, res.data.script)
      
      if (res.data.status === 'ready') {
        setStatus('ready')
      }
    } catch (e) {
      toast.error('Failed to start podcast generation')
      setStatus('error')
    }
  }

  const togglePlay = () => {
    if (audio.isPlaying) {
      globalPause()
    } else {
      globalResume()
    }
  }

  const handleInterrupt = async () => {
    if (!audio.sessionId) return
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      return
    }
    setIsHandRaised(true)
    setTimeout(() => setIsHandRaised(false), 3000)
    setIsInterrupting(true)
    globalPause()

    const speakerKey = currentChunk?.speaker || 'A'
    const introUrl = interjectionUrls[speakerKey]
    
    const startRecordingFlow = async () => {
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
            const res = await podcastApi.interrupt(audio.sessionId!, audioBlob, audio.currentIndex)
            
            // The backend splices answer segments right after currentIndex.
            const answerStartIndex = audio.currentIndex + 1
            
            // updateScript writes to refs synchronously, so setCurrentIndex
            // will immediately see the new script — no delay needed.
            updateScript(res.data.script, res.data.new_total)
            
            toast.dismiss('answering-toast')
            setIsAnswering(false)
            setCurrentIndex(answerStartIndex)
          } catch(e) {
            toast.dismiss('answering-toast')
            setIsAnswering(false)
            globalResume()
          }
          setIsInterrupting(false)
        }
        mr.start()
        setIsRecording(true)
      } catch(e) {
        setIsInterrupting(false)
      }
    }

    if (introUrl) { 
        const interAudio = new Audio(introUrl)
        setIsAcknowledging(true)
        interAudio.onended = () => { setIsAcknowledging(false); startRecordingFlow(); }
        interAudio.play().catch(() => { setIsAcknowledging(false); startRecordingFlow(); })
    } else {
        startRecordingFlow()
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
                <option value="Ava">Ava (Humanoid)</option>
                <option value="Christopher">Christopher (Expert)</option>
                <option value="Brian">Brian (Conversational)</option>
                <option value="Guy">Guy (Casual)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Host B Voice</label>
              <select className="w-full bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-sm appearance-none cursor-pointer" value={voiceB} onChange={e=>setVoiceB(e.target.value)}>
                <option value="Andrew">Andrew (Humanoid)</option>
                <option value="Emma">Emma (Humanoid)</option>
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
         <XCircle className="w-16 h-16 text-red-500 mb-4" />
         <h3 className="text-2xl font-bold text-white">Synapse Disconnected</h3>
         <button onClick={() => { setStatus('generating'); handleStartGeneration(); }} className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl">RETRY</button>
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[92vh] sm:min-h-[500px] lg:h-[750px] bg-slate-950 flex flex-col relative">
       <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative">
          <div className="absolute inset-0 z-0 opacity-40 blur-[120px] pointer-events-none transition-all duration-1000">
             <div className={cn("absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full animate-pulse", currentChunk?.speaker === 'A' ? "bg-indigo-600/40" : "bg-pink-600/20")} />
             <div className={cn("absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full", currentChunk?.speaker === 'B' ? "bg-pink-600/40" : "bg-indigo-600/20")} />
          </div>

          <div className="w-full lg:w-[60%] h-[300px] lg:h-full relative z-10 flex items-center justify-center p-4 lg:p-12">
             <div className="w-full h-full rounded-[3rem] overflow-hidden shadow-2xl border border-white/10 relative group bg-slate-900/50 backdrop-blur-sm" onClick={() => (activeVisual || currentChunk?.visual_url) && setEnlargedImage(activeVisual?.image || currentChunk?.visual_url)}>
                {(activeVisual || currentChunk?.visual_url) ? (
                   <>
                     <img src={activeVisual?.image || currentChunk?.visual_url} key={audio.currentIndex} className="w-full h-full object-cover animate-in fade-in duration-1000" />
                     <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />
                   </>
                ) : (
                   <div className="w-full h-full flex flex-col items-center justify-center space-y-6 opacity-30">
                      <ImageIcon className="w-12 h-12 text-indigo-500 animate-pulse" />
                   </div>
                )}
                {isHandRaised && (
                  <div className="absolute inset-0 flex items-center justify-center bg-indigo-600/20 backdrop-blur-sm animate-in fade-in duration-300">
                     <Hand className="w-24 h-24 text-white animate-bounce" />
                  </div>
                )}
             </div>
          </div>

          <div className="w-full lg:w-[40%] lg:h-full relative z-10 flex flex-col p-8 lg:p-12 lg:pl-0">
             <div className="flex items-center gap-10 mb-12">
                <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center font-black text-xl transition-all", currentChunk?.speaker === 'A' ? "bg-indigo-500 text-white scale-110 shadow-2xl" : "bg-white/5 text-white/20")}>{voiceA.charAt(0)}</div>
                <div className="h-px flex-1 bg-white/5" />
                <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center font-black text-xl transition-all", currentChunk?.speaker === 'B' ? "bg-pink-500 text-white scale-110 shadow-2xl" : "bg-white/5 text-white/20")}>{voiceB.charAt(0)}</div>
             </div>

             <div className="flex-1 overflow-y-auto custom-scrollbar pr-4 space-y-8">
                <div className="flex gap-4">
                   <Quote className="w-8 h-8 text-indigo-500/20 shrink-0" />
                   <p className="text-xl lg:text-3xl font-medium leading-relaxed text-white/90" key={audio.currentIndex}>{currentChunk?.text || "Initializing..."}</p>
                </div>
             </div>
          </div>
       </div>

       <div className="sticky bottom-0 h-auto lg:h-[150px] bg-slate-900 border-t border-white/5 p-6 lg:p-12">
           <div className="max-w-6xl mx-auto w-full flex items-center justify-between gap-8">
              <div className="flex items-center gap-8">
                 <button onClick={togglePlay} className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-white text-slate-950 flex items-center justify-center shadow-xl hover:scale-110 transition-all relative">
                    {!audio.isChunkLoaded && !audio.isPlaying ? (
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                    ) : audio.isPlaying ? (
                        <Pause className="w-8 h-8 fill-current" />
                    ) : (
                        <Play className="w-8 h-8 fill-current ml-1" />
                    )}
                 </button>
                 <div className="hidden sm:block">
                    <p className="text-white font-black lg:text-lg">FlowCast Session</p>
                    <p className="text-slate-500 text-sm">
                        {audio.isPlaying ? `Segment ${audio.currentIndex + 1} of ${audio.totalChunks}` : (
                           audio.isChunkLoaded ? "Ready to Start" : "Connecting Audio..."
                        )}
                    </p>
                 </div>
              </div>
             
             <div className="flex-1 max-w-xl hidden lg:block mx-12">
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                   <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${audio.playbackProgress}%` }} />
                </div>
             </div>

             <div className="flex items-center gap-4">
                <button onClick={handleInterrupt} className={cn("h-16 px-8 rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-3 transition-all", isRecording ? "bg-rose-600 text-white animate-pulse" : "bg-white/5 text-white/50 border border-white/10")}>
                   {isRecording ? "Listening..." : "Raise Hand"}
                </button>
                <button onClick={onClose} className="w-16 h-16 rounded-full bg-slate-950 text-slate-500 border border-white/5 flex items-center justify-center hover:text-white transition-all"><X /></button>
             </div>
          </div>
       </div>

       {enlargedImage && (
         <div className="fixed inset-0 z-[1000] bg-slate-950/98 backdrop-blur-2xl flex items-center justify-center p-12" onClick={() => setEnlargedImage(null)}>
           <img src={enlargedImage} className="max-w-full max-h-full object-contain rounded-3xl" alt="Zoomed view" />
         </div>
       )}
    </div>
  )
}
