export type FlowObjectType = 'video' | 'podcast' | 'flashcards' | 'practice' | 'active_recall' | 'feynman' | 'source' | 'worked_example' | 'comparison' | 'math' | 'assignment_context'

export interface FlowObject {
  type: FlowObjectType
  id: string
  state: 'loading' | 'ready' | 'error'
  payload: Record<string, any>
  provenance?: { source_id?: number | null; source_title?: string }
}
