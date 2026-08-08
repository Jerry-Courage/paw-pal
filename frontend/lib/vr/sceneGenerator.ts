/**
 * SceneGenerator — Converts existing VRNode data into a SceneSpec.
 *
 * This is the DETERMINISTIC path. No LLM calls.
 * Takes the existing VR layout nodes and produces a typed SceneSpec.
 *
 * Future: AI scene generator will also produce SceneSpec,
 * but with richer object placement and interactions.
 */

import {
  SceneSpec,
  SceneObject,
  SceneInteraction,
  EnvironmentSpec,
  Vec3,
  DEFAULT_ENVIRONMENT,
} from './sceneSpec'
import { resolveAsset } from './assetResolver'

/** Backend VR node shape (from ResourceVRLayoutView) */
export interface VRNode {
  id: string
  label: string
  description: string
  color: string
  type?: string
  sketchfab_keyword?: string
  model_uid?: string
  embed_url?: string
}

/** Generate circular positions for N objects */
function circularPositions(count: number, radius?: number): Vec3[] {
  const r = radius ?? Math.max(1.5, count * 0.3)
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2
    return {
      x: Math.cos(angle) * r,
      y: 0.8,
      z: Math.sin(angle) * r,
    }
  })
}

/** Convert a single VRNode to a SceneObject */
function vrNodeToSceneObject(
  node: VRNode,
  position: Vec3
): SceneObject {
  // Try to resolve an asset from the manifest
  const assetMatch = resolveAsset({
    label: node.label,
    description: node.description,
    keywords: node.sketchfab_keyword ? [node.sketchfab_keyword] : [],
  })

  const assetId = assetMatch?.asset.id ?? null

  return {
    id: node.id,
    conceptId: node.id,
    assetId,
    label: node.label,
    description: node.description,
    type: assetId ? 'model' : 'placeholder',
    position,
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    visible: true,
    interactive: true,
    asset: assetId
      ? {
          assetId,
          modelUrl: assetMatch!.asset.modelUrl,
          thumbnailUrl: assetMatch!.asset.thumbnailUrl,
          source: 'manifest',
        }
      : node.embed_url
        ? {
            assetId: null,
            modelUrl: undefined,
            source: 'sketchfab',
          }
        : {
            assetId: null,
            source: 'placeholder',
          },
    color: node.color,
  }
}

/** Generate interactions for scene objects */
function generateInteractions(objects: SceneObject[]): SceneInteraction[] {
  const interactions: SceneInteraction[] = []

  for (const obj of objects) {
    if (!obj.interactive) continue

    interactions.push({
      id: `select-${obj.id}`,
      objectId: obj.id,
      type: 'select',
      action: 'show_detail',
      payload: { conceptId: obj.conceptId, label: obj.label },
    })

    interactions.push({
      id: `hover-${obj.id}`,
      objectId: obj.id,
      type: 'hover',
      action: 'highlight',
      payload: {},
    })
  }

  return interactions
}

/** Extract learning objectives from VRNode descriptions */
function extractLearningObjectives(nodes: VRNode[]): string[] {
  return nodes
    .filter((n) => n.description && n.description.length > 10)
    .slice(0, 7)
    .map((n) => `Understand ${n.label}: ${n.description}`)
}

/**
 * Generate a SceneSpec from existing VR layout nodes.
 *
 * This is the primary deterministic scene generator.
 * It uses the asset resolver to match concepts to known models.
 */
export function generateSceneSpec(params: {
  resourceId: string
  title: string
  description?: string
  subject?: string
  nodes: VRNode[]
  environment?: EnvironmentSpec
}): SceneSpec {
  const {
    resourceId,
    title,
    description = '',
    subject = '',
    nodes,
    environment = DEFAULT_ENVIRONMENT,
  } = params

  const positions = circularPositions(nodes.length)

  const objects: SceneObject[] = nodes.map((node, index) =>
    vrNodeToSceneObject(node, positions[index])
  )

  const interactions = generateInteractions(objects)
  const learningObjectives = extractLearningObjectives(nodes)

  return {
    id: `scene-${resourceId}`,
    resourceId,
    title,
    description,
    subject,
    environment,
    objects,
    interactions,
    learningObjectives,
    generatedAt: new Date().toISOString(),
    version: 1,
  }
}
