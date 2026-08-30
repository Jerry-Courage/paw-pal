/**
 * normalizeReadableMath
 * ---------------------
 * VOICE / plain-text mode (used in AI chat, voice TTS output):
 * Strips all LaTeX delimiters and converts symbols to unicode
 * so the text is speakable / readable without math syntax.
 *
 * normalizeForRendering
 * ----------------------
 * RENDER mode (used in flashcards, study notes, quiz):
 * Preserves LaTeX and ensures it is wrapped in proper
 * $...$ or $$...$$ delimiters so ReactMarkdown + KaTeX can process it.
 */

const LATEX_COMMANDS: Record<string, string> = {
  'nabla': '∇',
  'sqrt': '√',
  'times': '×',
  'cdot': '·',
  'left': '',
  'right': '',
  'quad': ' ',
  'qquad': ' ',
  'displaystyle': '',
}

const LATEX_SYMBOLS: Record<string, string> = {
  '\\le': '≤',
  '\\ge': '≥',
  '\\neq': '≠',
  '\\approx': '≈',
  '\\pm': '±',
  '\\infty': '∞',
  '\\partial': '∂',
  '\\sum': '∑',
  '\\prod': '∏',
  '\\int': '∫',
  '\\theta': 'θ',
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\epsilon': 'ε',
  '\\lambda': 'λ',
  '\\mu': 'μ',
  '\\pi': 'π',
  '\\phi': 'φ',
  '\\Sigma': 'Σ',
  '\\Delta': 'Δ',
  '\\Gamma': 'Γ',
  '\\Omega': 'Ω',
  '\\Lambda': 'Λ',
  '\\in': '∈',
  '\\notin': '∉',
  '\\subseteq': '⊆',
  '\\supseteq': '⊇',
  '\\subset': '⊂',
  '\\supset': '⊃',
  '\\to': '→',
  '\\rightarrow': '→',
  '\\leftarrow': '←',
  '\\Rightarrow': '⇒',
  '\\Leftrightarrow': '⟺',
  '\\forall': '∀',
  '\\exists': '∃',
  '\\cup': '∪',
  '\\cap': '∩',
  '\\emptyset': '∅',
  '\\neg': '¬',
  '\\wedge': '∧',
  '\\vee': '∨',
}

const normalizeLatexCommands = (value: string) => {
  let result = value.replace(/\\/g, '\\')
  for (const [token, replacement] of Object.entries(LATEX_COMMANDS)) {
    result = result.replace(new RegExp(`\\\\${token}`, 'g'), replacement)
  }
  for (const [token, replacement] of Object.entries(LATEX_SYMBOLS)) {
    result = result.replace(new RegExp(token.replace(/\\/g, '\\\\'), 'g'), replacement)
  }
  return result
}

/**
 * For VOICE / plain-text output — strips all math, converts to unicode.
 * Used in: AI chat bubbles passed to TTS, voice sanitizer output.
 */
export function normalizeReadableMath(content: string): string {
  if (!content) return ''

  let normalized = content
    .replace(/\\\[/g, '')
    .replace(/\\\]/g, '')
    .replace(/\\\(/g, '')
    .replace(/\\\)/g, '')
    .replace(/\$\$/g, '')
    .replace(/\$/g, '')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/\\,/g, ' ')
    .replace(/\\ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  normalized = normalizeLatexCommands(normalized)
  normalized = normalized
    .replace(/(?:\\){1,2}frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\^\{([^}]+)\}/g, '^$1')
    .replace(/\^([0-9A-Za-z]+)/g, '^$1')
    .replace(/\{([^}]+)\}/g, '$1')
    .replace(/\s+([\.,;:!?])/g, '$1')
    .replace(/([A-Za-z0-9])\^([A-Za-z0-9])/g, '$1^$2')
    .trim()

  return normalized
}

/**
 * For RENDERED output — preserves LaTeX and ensures all bare LaTeX
 * commands are wrapped in $...$ so remark-math + rehype-katex can render them.
 *
 * Used in: flashcards, study mode quiz, any ReactMarkdown component with KaTeX.
 *
 * Strategy:
 * 1. Already-delimited math ($...$, $$...$$, \[...\], \(...\)) → keep as-is
 * 2. Bare LaTeX commands not inside delimiters → wrap in $...$
 */
export function normalizeForRendering(content: string): string {
  if (!content) return ''

  let text = content

  // Normalize common model output where display environments arrive without
  // delimiters. Keeping the complete environment together prevents remark
  // from wrapping \begin and \end as separate inline fragments.
  text = text.replace(
    /(?:\$\$\s*)?(\\begin\{(?:matrix|pmatrix|bmatrix|vmatrix|Vmatrix|aligned|cases)\}[\s\S]*?\\end\{(?:matrix|pmatrix|bmatrix|vmatrix|Vmatrix|aligned|cases)\})(?:\s*\$\$)?/g,
    (_, environment) => `\n\n$$${environment.trim()}$$\n\n`,
  )

  // Repair a lone display delimiter around a formula instead of exposing it.
  const displayMarkers = (text.match(/\$\$/g) || []).length
  if (displayMarkers % 2 === 1) text = `${text.trim()}$$`

  // 1. Normalize \[...\] → $$...$$ and \(...\) → $...$
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner.trim()}$$`)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`)

  // 2. Wrap bare LaTeX commands that aren't already inside $ delimiters.
  // A "bare" LaTeX expression is: a sequence of text that contains \cmd
  // but is not already surrounded by $...$
  // We detect segments between existing math blocks and wrap any \cmd in them.

  // Split on already-delimited math regions to avoid double-wrapping
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/)

  const processed = parts.map((part, i) => {
    // Even indices are plain text, odd indices are already-delimited math
    const isAlreadyMath = i % 2 === 1
    if (isAlreadyMath) return part

    // In plain text parts: if we find LaTeX commands, wrap contiguous
    // math-containing segments in $...$
    // Pattern: a word or expression containing \cmd (but not just \n or whitespace)
    return part.replace(
      /((?:[A-Za-z0-9()\[\].,;:'"-]*)?(?:\\[A-Za-z]+(?:\{[^}]*\})?(?:_\{[^}]*\})?(?:\^\{[^}]*\})?)+(?:[A-Za-z0-9()\[\].,;:'"-]*)?(?:\s*[=<>+\-*/^_×·]\s*(?:[A-Za-z0-9()\[\].,;:'"-]*)?(?:\\[A-Za-z]+(?:\{[^}]*\})?)*(?:[A-Za-z0-9()\[\].,;:'"-]*)?)*)(?=[^$]|$)/g,
      (match) => {
        // Only wrap if it actually contains a LaTeX command
        if (/\\[A-Za-z]/.test(match) && match.trim()) {
          // Don't double-wrap
          if (match.startsWith('$')) return match
          return `$${match.trim()}$`
        }
        return match
      }
    )
  })

  return processed.join('')
}
