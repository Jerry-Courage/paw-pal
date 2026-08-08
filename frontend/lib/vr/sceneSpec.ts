/**
 * SceneSpec — Strongly typed scene specification for FlowState VR.
 *
 * This is the data contract between:
 * - Scene generator (deterministic, from VRNode data)
 * - Future AI scene generator
 * - SceneRenderer (consumes SceneSpec)
 * - Asset resolver (resolves assetId → model URL)
 *
 * Serializable as JSON.
 */

export type SceneObjectType = 'model' | 'placeholder' | 'annotation'

export type InteractionType =
  | 'select'
  | 'hover'
  | 'focus'
  | 'highlight'
  | 'label'
  | 'inspect'
  | 'explain'
  | 'navigate'
  | 'quiz'
  | 'sequence'

export type EnvironmentType = 'default' | 'dark' | 'classroom' | 'laboratory' | 'outdoor'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface LightingSpec {
  ambient?: { intensity: number; color?: string }
  directional?: { intensity: number; position: Vec3; color?: string }
  point?: { intensity: number; position: Vec3; color?: string; distance?: number }
}

export interface EnvironmentSpec {
  type: EnvironmentType
  background?: string
  fog?: { color: string; near: number; far: number } | null
  floor?: { visible: boolean; color?: string; grid?: boolean }
  lighting?: LightingSpec
}

export interface AssetReference {
  assetId: string | null
  modelUrl?: string
  thumbnailUrl?: string
  source?: 'manifest' | 'sketchfab' | 'placeholder'
}

export interface SceneObject {
  id: string
  conceptId: string
  assetId: string | null
  label: string
  description: string
  type: SceneObjectType
  position: Vec3
  rotation: Vec3
  scale: number
  visible: boolean
  interactive: boolean
  asset: AssetReference
  color?: string
}

export interface SceneInteraction {
  id: string
  objectId: string
  type: InteractionType
  action: string
  payload?: Record<string, unknown>
}

export interface SceneSpec {
  id: string
  resourceId: string
  title: string
  description: string
  subject: string
  environment: EnvironmentSpec
  objects: SceneObject[]
  interactions: SceneInteraction[]
  learningObjectives: string[]
  /** Guided learning sequence — ordered object IDs for the student to follow */
  learningPath?: string[]
  generatedAt: string
  version: number
}

/** Default environment for FlowState scenes */
export const DEFAULT_ENVIRONMENT: EnvironmentSpec = {
  type: 'dark',
  background: '#0a0014',
  fog: { color: '#0a0014', near: 5, far: 50 },
  floor: { visible: true, color: '#0d0d1a', grid: true },
  lighting: {
    ambient: { intensity: 0.4, color: '#c4b5fd' },
    directional: { intensity: 0.8, position: { x: 5, y: 8, z: 5 }, color: '#ffffff' },
    point: { intensity: 0.15, position: { x: 0, y: -2, z: 0 }, color: '#7c3aed', distance: 10 },
  },
}
