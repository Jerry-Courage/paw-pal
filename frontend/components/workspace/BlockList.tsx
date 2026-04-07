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
    <div className="max-w-4xl mx-auto w-full px-6 py-10 min-h-full">
      {/* Canvas Header */}
      <div className="mb-12 text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-violet-100 dark:border-violet-800">
          <Sparkles className="w-3 h-3" />
          Interactive Canvas
          {isConnected && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse ml-1" />}
        </div>
        <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">Workspace 2.0</h2>
        <p className="text-sm text-gray-400">Add blocks, generate AI notes, and build your study masterpiece.</p>
      </div>

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
        <div className="text-center py-20 bg-gray-50/50 dark:bg-white/5 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800">
          <div className="w-16 h-16 bg-white dark:bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-gray-100 dark:border-gray-800">
            <Plus className="w-8 h-8 text-violet-500" />
          </div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Your canvas is empty</h3>
          <p className="text-xs text-gray-400 mb-6 px-10">Start your collaboration by adding your first block.</p>
          <button 
            onClick={() => handleAddBlock('text')}
            className="px-6 py-2 bg-violet-600 text-white rounded-xl text-xs font-bold hover:bg-violet-700 transition-all hover:scale-105 shadow-lg shadow-violet-200 dark:shadow-none">
            Add First Block
          </button>
        </div>
      )}

      {/* Add Suggestion at the bottom */}
      {blocks?.length > 0 && (
        <div className="pt-8 flex justify-center">
          <button 
            onClick={() => handleAddBlock('text')}
            className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/30 rounded-xl transition-all border border-transparent hover:border-violet-100 dark:hover:border-violet-800 text-xs font-medium">
            <Plus className="w-4 h-4" />
            Click to add another block
          </button>
        </div>
      )}
    </div>
  )
}
