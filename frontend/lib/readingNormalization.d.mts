export type NormalizedReadingSection = {
  key: string
  title: string
  content: string
  page: number | null
}

export function unwrapApiCollection(value: unknown): any[]
export function normalizeReadingSections(rawSections: unknown, summary?: unknown): NormalizedReadingSection[]
export function readingAvailability(payload: unknown): 'unavailable' | 'processed-with-original' | 'processed-only'
export function readingFailureMessage(status?: number): string
