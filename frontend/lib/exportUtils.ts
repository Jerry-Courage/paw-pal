import { toast } from 'sonner'

// Replace Unicode chars Helvetica (jspdf built-in) cannot render
const sanitizePdf = (t: string) => t
  .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
  .replace(/\u2013|\u2014/g, '-').replace(/\u2026/g, '...')
  .replace(/\u00A0/g, ' ').replace(/[^\x00-\x7F]/g, '')

// Strip LaTeX delimiters so math reads as plain text
const stripLatex = (t: string) => t
  .replace(/\\\(/g, '').replace(/\\\)/g, '')
  .replace(/\\\[/g, '').replace(/\\\]/g, '')

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
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()
      const margin = 20
      const maxW = pageW - margin * 2
      let y = margin

      const addPage = () => { doc.addPage(); y = margin }
      const checkY = (n = 10) => { if (y + n > 278) addPage() }

      const write = (text: string, font: 'bold' | 'normal', size: number, rgb: [number, number, number], indent = 0, lh = 6) => {
        doc.setFont('helvetica', font)
        doc.setFontSize(size)
        doc.setTextColor(...rgb)
        const lines = doc.splitTextToSize(sanitizePdf(text), maxW - indent)
        checkY(lines.length * lh)
        doc.text(lines, margin + indent, y)
        y += lines.length * lh + 2
      }

      // Header
      write(title, 'bold', 20, [15, 23, 42], 0, 9); y += 2
      write(`Subject: ${subject || 'General'}`, 'normal', 9, [100, 116, 139]); y += 2
      doc.setDrawColor(220, 220, 220)
      doc.line(margin, y, pageW - margin, y); y += 6

      // Body
      for (const raw of content.split('\n')) {
        const l = raw.trim()
        if (!l) { y += 3; continue }
        if (isTableSep(l)) continue

        const clean = pdfClean(l)

        if (isTableRow(l)) {
          const cells = l.split('|').map(c => pdfClean(c.trim())).filter(Boolean)
          write(cells.join('   |   '), 'normal', 9, [71, 85, 105])
        } else if (l.startsWith('### ')) {
          y += 2; write(clean, 'bold', 11, [51, 65, 85], 0, 6)
        } else if (l.startsWith('## ')) {
          y += 4; write(clean, 'bold', 13, [30, 41, 59], 0, 7)
        } else if (l.startsWith('# ')) {
          y += 6; write(clean, 'bold', 16, [15, 23, 42], 0, 8)
        } else if (l.startsWith('- ') || l.startsWith('* ')) {
          write(`\u2022 ${clean.slice(2)}`, 'normal', 10, [71, 85, 105], 4, 5.5)
        } else if (/^\d+\.\s/.test(l)) {
          write(clean, 'normal', 10, [71, 85, 105], 4, 5.5)
        } else {
          write(clean, 'normal', 10, [55, 65, 81], 0, 5.5)
        }
      }

      // Page numbers
      const pageCount = (doc.internal as any).getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(160, 170, 180)
        doc.text(`Page ${i} of ${pageCount}`, pageW - margin, 290, { align: 'right' })
      }

      doc.save(`${safe}.pdf`)
      toast.success('Downloaded as PDF')

    } else {
      // Word — clean HTML with no Word XML namespaces (they cause character garbling)
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
