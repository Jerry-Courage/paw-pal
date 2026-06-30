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
