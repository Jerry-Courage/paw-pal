function readableText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(readableText).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    for (const key of ['text', 'content', 'title', 'value', 'description']) {
      if (value[key] != null) return readableText(value[key])
    }
    return ''
  }
  return String(value)
}

function markdownList(value) {
  const values = value == null ? [] : Array.isArray(value) ? value : [value]
  return values.map(readableText).filter(Boolean).map(item => `- ${item}`).join('\n')
}

export function unwrapApiCollection(value) {
  if (Array.isArray(value)) return value
  return Array.isArray(value?.results) ? value.results : []
}

export function normalizeReadingSections(rawSections, summary = '') {
  const source = Array.isArray(rawSections)
    ? rawSections
    : rawSections && typeof rawSections === 'object'
      ? Object.values(rawSections)
      : []
  const sections = source.map((raw, index) => {
    const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { content: raw }
    const blocks = [
      readableText(item.content || item.notes),
      readableText(item.plain_english),
      readableText(item.deep_dive),
      readableText(item.summary),
      item.key_points != null ? `## Key points\n${markdownList(item.key_points)}` : '',
      item.examples != null ? `## Examples\n${markdownList(item.examples)}` : '',
    ].filter(Boolean)
    const pageValue = item.page ?? item.page_number
    const page = Number.isFinite(Number(pageValue)) && String(pageValue).trim() ? Number(pageValue) : null
    return {
      key: readableText(item.id || item.slug || `section-${index}`),
      title: readableText(item.title || item.heading || `Section ${index + 1}`),
      content: blocks.join('\n\n'),
      page,
    }
  }).filter(item => item.content)
  return sections.length ? sections : [{ key: 'overview', title: 'Overview', content: readableText(summary), page: null }]
}

export function readingAvailability(payload) {
  if (!payload?.processed_content_available) return 'unavailable'
  return payload.original_file_available ? 'processed-with-original' : 'processed-only'
}

export function readingFailureMessage(status) {
  if (status === 404) return 'This Source was not found or is not available to your account.'
  if (status === 401 || status === 403) return 'Your session cannot open this Source. Sign in again or return to Sources.'
  if (status >= 500) return 'The reading service hit a problem. Your saved Source has not been deleted.'
  return 'The reading service could not be reached. Check your connection and try again.'
}
