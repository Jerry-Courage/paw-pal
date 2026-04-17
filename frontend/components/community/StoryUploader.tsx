'use client'

import { useState, useRef } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { communityApi, workspaceApi } from '@/lib/api'
import { X, Upload, Check, Video, Image as ImageIcon, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export default function StoryUploader({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspaceApi.getAll().then(r => r.data),
  })

  const workspaceList = Array.isArray(workspaces) ? workspaces : workspaces?.results || []

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => communityApi.createStory(formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stories'] })
      toast.success('Story posted to Nexus!')
      onClose()
    },
    onError: () => toast.error('Failed to post story.'),
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.size > 20 * 1024 * 1024) { // 20MB limit
        toast.error('File size too large (max 20MB)')
        return
      }
      setFile(selectedFile)
      setPreview(URL.createObjectURL(selectedFile))
    }
  }

  const handleUpload = () => {
    if (!workspaceId) {
      toast.error('Select a Collab Space to share with')
      return
    }

    const formData = new FormData()
    if (file) {
      formData.append('media_file', file)
      formData.append('media_type', file.type.startsWith('video') ? 'video' : 'image')
    } else {
        formData.append('media_type', 'text')
    }
    formData.append('text_content', text)
    formData.append('workspace', workspaceId)

    uploadMutation.mutate(formData)
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl shadow-black/50 overflow-hidden relative border border-white/10"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 via-fuchsia-500 to-primary" />
        
        <div className="px-8 pt-8 pb-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">New Nexus Story</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Visual updates for your squad</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {/* File Picker / Preview */}
          <div 
            onClick={() => !preview && fileInputRef.current?.click()}
            className={cn(
              "relative aspect-[9/16] max-h-[40vh] rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-50 dark:bg-slate-950 overflow-hidden",
              preview ? "border-solid border-primary" : "border-slate-200 dark:border-slate-800 hover:border-primary/50"
            )}
          >
            {preview ? (
              <>
                {file?.type.startsWith('video') ? (
                  <video src={preview} className="w-full h-full object-cover" controls />
                ) : (
                  <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                )}
                <button 
                  onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }}
                  className="absolute top-4 right-4 p-2 bg-black/50 rounded-full text-white backdrop-blur-md"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div className="space-y-1">
                   <p className="text-sm font-black text-slate-900 dark:text-white">Click to Upload Media</p>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Images or Videos (Max 20MB)</p>
                </div>
              </div>
            )}
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*,video/*" 
              className="hidden" 
              onChange={handleFileChange} 
            />
          </div>

          <div className="space-y-4">
             {/* Text Content */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Caption / Message</label>
              <textarea 
                placeholder="What's happening in your flow?"
                value={text}
                onChange={e => setText(e.target.value)}
                rows={2}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-primary/50 transition-all placeholder:text-slate-400 resize-none"
              />
            </div>

            {/* Workspace Selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Select Viewing Circle</label>
              <div className="grid grid-cols-2 gap-2">
                {workspaceList.length > 0 ? (
                    workspaceList.map((ws: any) => (
                        <button
                          key={ws.id}
                          onClick={() => setWorkspaceId(ws.id.toString())}
                          className={cn(
                            "px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all text-left truncate flex items-center gap-2",
                            workspaceId === ws.id.toString() 
                              ? "bg-primary border-primary text-white shadow-lg shadow-primary/20" 
                              : "bg-slate-50 dark:bg-slate-950 border-slate-100 dark:border-slate-800 text-slate-500 hover:border-primary/30"
                          )}
                        >
                          <div className={cn("w-2 h-2 rounded-full", workspaceId === ws.id.toString() ? "bg-white" : "bg-slate-300")} />
                          {ws.name}
                        </button>
                    ))
                ) : (
                    <p className="col-span-2 text-[10px] font-bold text-orange-500 bg-orange-50 dark:bg-orange-900/20 p-3 rounded-xl">
                        You need to join a Collab Space first.
                    </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 pb-8 flex gap-4">
          <button onClick={onClose} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all active:scale-95">Cancel</button>
          <button 
            onClick={handleUpload}
            disabled={(!file && !text) || uploadMutation.isPending || !workspaceId}
            className="flex-1 py-4 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Ignite Story
          </button>
        </div>
      </motion.div>
    </div>
  )
}
