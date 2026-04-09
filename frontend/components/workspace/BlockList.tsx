import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspaceApi } from '@/lib/api'
import BlockItem from './BlockItem'
import { Plus, Loader2, Wand2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import { 
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { motion } from 'framer-motion'

interface BlockListProps {
  workspaceId: number
  socket: {
    isConnected: boolean
    sendMessage: (msg: any) => void
    activeUsers: any[]
    userFocus: Record<number, number | null>
    lockedBlocks: Record<number, { userId: number, userName: string }>
  }
}

export default function BlockList({ workspaceId, socket }: BlockListProps) {
  const qc = useQueryClient()
  const { isConnected, sendMessage, activeUsers, userFocus, lockedBlocks } = socket

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const { data: blocks, isLoading } = useQuery({
    queryKey: ['workspace-blocks', workspaceId],
    queryFn: () => workspaceApi.getBlocks(workspaceId).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => workspaceApi.createBlock(workspaceId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-blocks', workspaceId] }),
  })

  const updateMutation = useMutation({
    mutationFn: (data: any) => workspaceApi.updateBlock(workspaceId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-blocks', workspaceId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (blockId: number) => workspaceApi.deleteBlock(workspaceId, blockId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-blocks', workspaceId] }),
  })

  const reorderMutation = useMutation({
    mutationFn: (orderList: number[]) => workspaceApi.reorderBlocks(workspaceId, orderList),
    onSuccess: () => toast.success('Order synchronized'),
    onError: () => {
      toast.error('Failed to sync order')
      qc.invalidateQueries({ queryKey: ['workspace-blocks', workspaceId] })
    }
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b: any) => b.id === active.id)
      const newIndex = blocks.findIndex((b: any) => b.id === over.id)

      const newBlocks = arrayMove(blocks, oldIndex, newIndex)
      
      // Optimistic update
      qc.setQueryData(['workspace-blocks', workspaceId], newBlocks)
      
      // Persist to backend
      reorderMutation.mutate(newBlocks.map((b: any) => b.id))
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        <p className="text-xs text-gray-400 font-medium">Loading your canvas...</p>
      </div>
    )
  }

  const handleAddBlock = (type: string, order?: number) => {
    createMutation.mutate({ 
      block_type: type, 
      content: '', 
      order: order !== undefined ? order + 1 : undefined 
    })
  }

  return (
    <div className="max-w-5xl mx-auto w-full px-6 py-12 min-h-full">

      {/* Block List with DND */}
      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext 
          items={blocks?.map((b: any) => b.id) || []}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {blocks?.map((block: any, index: number) => {
              const usersEditing = Object.entries(userFocus)
                .filter(([_, focusedBlockId]) => focusedBlockId === block.id)
                .map(([userId, _]) => activeUsers.find(u => u.id === parseInt(userId))?.name || 'Collaborator')

              return (
                <BlockItem
                  key={block.id}
                  block={block}
                  workspaceId={workspaceId}
                  onUpdate={(data: any) => updateMutation.mutate({ block_id: block.id, ...data })}
                  onDelete={() => deleteMutation.mutate(block.id)}
                  onAddBelow={(type: string) => handleAddBlock(type, block.order)}
                  isLast={index === blocks.length - 1}
                  sendMessage={sendMessage}
                  usersEditing={usersEditing}
                  lockedBy={lockedBlocks[block.id]}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Empty State / Initial Block */}
      {blocks?.length === 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-32 bg-white/[0.02] backdrop-blur-sm rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="relative z-10">
            <div className="w-20 h-20 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(139,92,246,0.3)] group-hover:scale-110 transition-transform duration-500">
              <Plus className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-black text-white mb-3">Begin Your Genesis</h3>
            <p className="text-sm text-white/40 mb-10 max-w-xs mx-auto font-medium">Your canvas is a void waiting for intelligence. Add your first block to start the collaboration.</p>
            <button 
              onClick={() => handleAddBlock('text')}
              className="px-8 py-3 bg-white text-black rounded-2xl text-xs font-black uppercase tracking-[0.2em] hover:bg-violet-400 hover:text-white transition-all shadow-2xl">
              Initialize Canvas
            </button>
          </div>
        </motion.div>
      )}

      {/* Add Suggestion at the bottom */}
      {blocks?.length > 0 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pt-16 pb-20 flex justify-center">
          <button 
            onClick={() => handleAddBlock('text')}
            className="group flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white/20 group-hover:text-violet-400 group-hover:border-violet-500/50 group-hover:bg-violet-500/10 transition-all duration-300">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] group-hover:text-violet-400 transition-colors">Append New Specimen</span>
          </button>
        </motion.div>
      )}
    </div>
  )
}
