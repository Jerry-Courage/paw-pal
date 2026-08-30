import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeReadingSections, readingAvailability, readingFailureMessage, unwrapApiCollection } from './readingNormalization.mjs'

test('unwraps DRF paginated bookmarks without calling find on an object', () => {
  assert.deepEqual(unwrapApiCollection({ count: 1, results: [{ id: 4 }] }), [{ id: 4 }])
  assert.deepEqual(unwrapApiCollection(null), [])
})

test('normalizes null and legacy optional section shapes', () => {
  const sections = normalizeReadingSections([{ title: 'Legacy', key_points: 'One point', examples: null, content: { text: 'Readable' }, page_number: '3' }])
  assert.equal(sections[0].content, 'Readable\n\n## Key points\n- One point')
  assert.equal(sections[0].page, 3)
})

test('one malformed section does not prevent valid sections rendering', () => {
  const sections = normalizeReadingSections([null, { title: 'Valid', plain_english: 'Still readable.' }])
  assert.equal(sections.length, 1)
  assert.equal(sections[0].title, 'Valid')
})

test('missing sections use persisted summary and never invent content', () => {
  assert.equal(normalizeReadingSections(null, 'Stored summary')[0].content, 'Stored summary')
  assert.equal(normalizeReadingSections(null, '')[0].content, '')
})

test('processed content renders whether or not the original is available', () => {
  assert.equal(readingAvailability({ processed_content_available: true, original_file_available: true }), 'processed-with-original')
  assert.equal(readingAvailability({ processed_content_available: true, original_file_available: false }), 'processed-only')
  assert.equal(readingAvailability({ processed_content_available: false }), 'unavailable')
})

test('404 and 500 failures have distinct recoverable messages', () => {
  assert.match(readingFailureMessage(404), /not found/)
  assert.match(readingFailureMessage(500), /service hit a problem/)
})
