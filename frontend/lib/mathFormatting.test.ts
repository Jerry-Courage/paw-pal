import assert from 'node:assert/strict'
import { normalizeReadableMath } from './mathFormatting.ts'

const sample = '\\nabla f_n - \\frac{1}{2} \\nabla^2 f_n + \\frac{1}{3} \\nabla^3 f_n'

assert.equal(
  normalizeReadableMath(sample),
  '∇ f_n - 1/2 ∇^2 f_n + 1/3 ∇^3 f_n'
)

assert.equal(
  normalizeReadableMath('Solve \\frac{x^2}{2} = 3'),
  'Solve x^2/2 = 3'
)

console.log('math formatting regression checks passed')
