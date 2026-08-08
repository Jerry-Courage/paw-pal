/**
 * AssetResolver — Maps concept labels/descriptions to the best matching asset.
 *
 * Uses deterministic keyword matching against the asset manifest.
 * No external API calls. No AI. Pure lookup.
 *
 * Architecture:
 *   concept label + description + keywords + subject
 *     → normalize
 *     → score each asset
 *     → best match OR null
 */

import { ASSET_MANIFEST, AssetDefinition } from './assetManifest'

export interface AssetMatch {
  asset: AssetDefinition
  score: number
  matchedKeywords: string[]
}

export interface ResolveInput {
  label: string
  description?: string
  keywords?: string[]
  subject?: string
}

/** Normalize text for matching: lowercase, strip punctuation, collapse whitespace */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Split text into individual tokens */
function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean)
}

/** Compute overlap score between input tokens and asset keywords */
function scoreAsset(
  inputTokens: string[],
  asset: AssetDefinition,
  subject?: string
): AssetMatch {
  const assetKeywords = asset.keywords.map(normalize)
  const matched: string[] = []

  for (const token of inputTokens) {
    for (const kw of assetKeywords) {
      // Exact match
      if (token === kw) {
        matched.push(kw)
        break
      }
      // Token is contained in keyword (e.g. "heart" matches "human heart")
      if (kw.includes(token) && token.length >= 3) {
        matched.push(kw)
        break
      }
      // Keyword is contained in token
      if (token.includes(kw) && kw.length >= 3) {
        matched.push(kw)
        break
      }
    }
  }

  // Also check if input text contains any full keyword phrase
  const fullInput = normalize(inputTokens.join(' '))
  for (const kw of assetKeywords) {
    if (kw.length >= 4 && fullInput.includes(kw) && !matched.includes(kw)) {
      matched.push(kw)
    }
  }

  // Score = ratio of matched keywords to total asset keywords (weighted)
  const uniqueMatched = Array.from(new Set(matched))
  const keywordScore = assetKeywords.length > 0
    ? uniqueMatched.length / Math.min(assetKeywords.length, 5)
    : 0

  // Subject bonus
  const subjectBonus = subject && asset.subject === subject.toLowerCase() ? 0.15 : 0

  // Length bonus for longer matches (more specific = better)
  const lengthBonus = uniqueMatched.reduce((sum, kw) => sum + kw.length, 0) * 0.02

  const score = Math.min(1, keywordScore + subjectBonus + lengthBonus)

  return { asset, score, matchedKeywords: uniqueMatched }
}

/**
 * Resolve the best matching asset for a concept.
 *
 * Returns null if no asset scores above the threshold.
 */
export function resolveAsset(input: ResolveInput): AssetMatch | null {
  const tokens = [
    ...tokenize(input.label),
    ...(input.description ? tokenize(input.description).slice(0, 20) : []),
    ...(input.keywords?.flatMap(tokenize) ?? []),
  ]

  // Deduplicate tokens
  const uniqueTokens = Array.from(new Set(tokens))

  if (uniqueTokens.length === 0) return null

  const THRESHOLD = 0.15
  let best: AssetMatch | null = null

  for (const asset of Object.values(ASSET_MANIFEST)) {
    const match = scoreAsset(uniqueTokens, asset, input.subject)
    if (match.score >= THRESHOLD && (!best || match.score > best.score)) {
      best = match
    }
  }

  return best
}

/**
 * Resolve assets for multiple concepts in batch.
 * Returns a map of concept ID → resolved asset or null.
 */
export function resolveAssets(
  concepts: Array<{ id: string } & ResolveInput>
): Map<string, AssetMatch | null> {
  const results = new Map<string, AssetMatch | null>()
  for (const concept of concepts) {
    results.set(concept.id, resolveAsset(concept))
  }
  return results
}
