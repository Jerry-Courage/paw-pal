import { toast } from 'sonner'
import { normalizeReadableMath } from '@/lib/mathFormatting'

// Replace Unicode chars Helvetica (jspdf built-in) cannot render
const sanitizePdf = (t: string) => t
  .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
  .replace(/\u2013|\u2014/g, '-').replace(/\u2026/g, '...')
  .replace(/\u00A0/g, ' ').replace(/[^\x00-\x7F]/g, '')

// Normalize math-like content so it reads as plain text in exports
const stripLatex = (t: string) => normalizeReadableMath(t)

// HTML-escape text content
const esc = (t: string) => t
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const pdfClean = (t: string) => sanitizePdf(stripLatex(t)
  .replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1').replace(/^#{1,6}\s+/, ''))

const docxFormat = (t: string) => esc(stripLatex(t))
  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.*?)\*/g, '<em>$1</em>')
  .replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:1px 4px">$1</code>')

const isTableSep = (l: string) => /^\|[\s\-|:]+\|$/.test(l)
const isTableRow  = (l: string) => l.startsWith('|') && l.endsWith('|')

// Converts simple markdown into HTML chunks using the same logic as docx
const markdownToHtml = (content: string): string[] => {
  const lines = content.split('\n')
  const parts: string[] = []
  let inTable = false

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    if (!l) {
      if (inTable) { parts.push('</table>'); inTable = false }
      continue
    }
    if (isTableSep(l)) continue

    if (isTableRow(l)) {
      const cells = l.split('|').map(c => docxFormat(c.trim())).filter(Boolean)
      const nextIsSep = isTableSep(lines[i + 1]?.trim() || '')
      if (!inTable) { parts.push('<table border="1" style="border-collapse:collapse;width:100%;margin:12px 0">'); inTable = true }
      const tag = nextIsSep ? 'th' : 'td'
      const style = nextIsSep ? 'style="background:#f1f5f9;padding:7px 10px;font-weight:bold"' : 'style="padding:6px 10px"'
      parts.push(`<tr>${cells.map(c => `<${tag} ${style}>${c}</${tag}>`).join('')}</tr>`)
      continue
    }

    if (inTable) { parts.push('</table>'); inTable = false }

    const b = docxFormat(l)

    if (l.startsWith('### ')) parts.push(`<h3>${b.slice(4)}</h3>`)
    else if (l.startsWith('## ')) parts.push(`<h2>${b.slice(3)}</h2>`)
    else if (l.startsWith('# ')) parts.push(`<h1>${b.slice(2)}</h1>`)
    else if (l.startsWith('- ') || l.startsWith('* ')) parts.push(`<li>${b.slice(2)}</li>`)
    else if (/^\d+\.\s/.test(l)) parts.push(`<li>${b}</li>`)
    else parts.push(`<p>${b}</p>`)
  }
  if (inTable) parts.push('</table>')
  
  return parts
}

export async function exportAssignment(
  fmt: 'pdf' | 'docx',
  title: string,
  content: string,
  subject: string
) {
  const safe = (title || 'assignment')
    .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 50) || 'assignment'

  try {
    if (fmt === 'pdf') {
      let htmlContent = ''
      const element = document.getElementById('assignment-content-to-export')
      if (element) {
        htmlContent = element.innerHTML
      } else {
        // Fallback: build HTML dynamically from markdown if the DOM element isn't present
        // (Used in Collab Space where the full assignment isn't rendered on screen)
        htmlContent = markdownToHtml(content).join('\n')
      }

      // We clone the node to make it light-themed for printing so it looks like a normal document
      const printContainer = document.createElement('div')
      printContainer.innerHTML = `
        <style>
          .print-export-wrapper h1 { font-size: 16pt !important; font-weight: 700 !important; margin-top: 16px !important; margin-bottom: 12px !important; }
          .print-export-wrapper h2 { font-size: 14pt !important; font-weight: 700 !important; margin-top: 14px !important; margin-bottom: 10px !important; }
          .print-export-wrapper h3 { font-size: 12pt !important; font-weight: 600 !important; margin-top: 12px !important; margin-bottom: 8px !important; }
          .print-export-wrapper p, .print-export-wrapper li, .print-export-wrapper td, .print-export-wrapper th { font-size: 10.5pt !important; line-height: 1.5 !important; }
          .print-export-wrapper code { font-size: 9pt !important; }
        </style>
        <div class="print-export-wrapper" style="font-family: 'Inter', Arial, sans-serif; color: #111; padding: 20px;">
          <h1 style="font-size: 20pt !important; font-weight: 800 !important; border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-bottom: 15px !important; margin-top: 0 !important;">${title}</h1>
          <div style="color: #666; font-size: 10pt; margin-bottom: 30px;">Subject: ${subject}</div>
          ${htmlContent}
        </div>
      `
      
      // Override dark mode text colors in the clone
      const allElements = printContainer.getElementsByTagName('*')
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i] as HTMLElement
        el.style.color = 'black'
        if (el.tagName === 'TABLE') {
          el.style.borderCollapse = 'collapse'
          el.style.width = '100%'
          el.style.marginBottom = '20px'
        }
        if (el.tagName === 'TH' || el.tagName === 'TD') {
          el.style.border = '1px solid #ccc'
          el.style.padding = '8px'
        }
      }

      try {
        const html2pdf = (await import('html2pdf.js')).default
        const opt = {
          margin:       15,
          filename:     `${safe}.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true },
          jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }
        
        await html2pdf().set(opt).from(printContainer).save()
        toast.success('Downloaded perfectly formatted PDF')
      } catch (err) {
        console.error(err)
        toast.error('Failed to generate PDF')
      }

    } else {
      // Word — clean HTML with no Word XML namespaces (they cause character garbling)
      const parts = markdownToHtml(content)

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #1e293b; margin: 2.5cm; line-height: 1.7; }
    h1 { font-size: 20pt; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 6px; }
    h2 { font-size: 15pt; color: #1e293b; margin: 18px 0 6px; }
    h3 { font-size: 12pt; color: #334155; margin: 14px 0 4px; }
    p  { margin: 0 0 10px; }
    li { margin: 3px 0; }
    table { border-collapse: collapse; width: 100%; margin: 14px 0; }
    td, th { border: 1px solid #cbd5e1; padding: 7px 10px; }
    th { background: #f1f5f9; font-weight: bold; }
    code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-family: monospace; }
  </style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p style="color:#64748b;font-size:10pt;margin-bottom:20px">Subject: ${esc(subject || 'General')}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:24px">
  ${parts.join('\n  ')}
</body>
</html>`

      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${safe}.doc`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      toast.success('Downloaded as Word document')
    }
  } catch (err: any) {
    console.error('Export error:', err)
    toast.error(`Export failed: ${err?.message || 'Unknown error'}`)
  }
}
