/**
 * AssetManifest — Centralized educational 3D asset registry.
 *
 * Each entry maps a concept/keyword to a known educational GLB model.
 * AI scene generators pick from this manifest — not arbitrary models.
 */

export interface AssetDefinition {
  id: string
  name: string
  subject: string
  keywords: string[]
  modelUrl: string
  thumbnailUrl?: string
  license?: string
  source?: string
  version: number
}

export type AssetManifest = Record<string, AssetDefinition>

/**
 * The FlowState educational asset library.
 * Keys are stable asset IDs. All URLs must be publicly accessible GLB/GLTF.
 */
export const ASSET_MANIFEST: AssetManifest = {
  'box': {
    id: 'box',
    name: 'Cube',
    subject: 'general',
    keywords: ['box', 'cube', 'test', 'sample', 'placeholder'],
    modelUrl: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF-Binary/Box.glb',
    license: 'Khronos glTF Sample Models (public domain / CC0)',
    source: 'KhronosGroup/glTF-Sample-Models',
    version: 1,
  },
  'heart': {
    id: 'heart',
    name: 'Human Heart',
    subject: 'biology',
    keywords: [
      'heart', 'cardiac', 'ventricle', 'atrium', 'aorta',
      'cardiovascular', 'blood pump', 'valve', 'mitral',
      'pulmonary', 'myocardium', 'human heart',
    ],
    modelUrl: 'https://modelviewer.dev/shared-assets/models/Heart.glb',
    thumbnailUrl: '',
    license: 'Apache 2.0 (modelviewer.dev shared assets)',
    source: 'modelviewer.dev shared assets',
    version: 1,
  },
}

/** Get all asset IDs */
export function getAssetIds(): string[] {
  return Object.keys(ASSET_MANIFEST)
}

/** Get a specific asset by ID */
export function getAssetById(id: string): AssetDefinition | null {
  return ASSET_MANIFEST[id] ?? null
}

/** Get all assets for a given subject */
export function getAssetsBySubject(subject: string): AssetDefinition[] {
  const lower = subject.toLowerCase()
  return Object.values(ASSET_MANIFEST).filter((a) => a.subject === lower)
}
