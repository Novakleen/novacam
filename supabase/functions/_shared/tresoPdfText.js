/**
 * Plain-text PDF builder and reader for uncompressed invoices.
 * Production extraction uses unpdf (see treso-pdf-extract). This reader is the
 * dependency-free path for the synthetic fixtures and a fallback when the
 * library returns nothing.
 */

function unescapePdf(value) {
  return value.replace(/\\([nrtbf()\\])/g, (_, ch) => {
    if (ch === 'n') return '\n'
    if (ch === 'r') return '\r'
    if (ch === 't') return '\t'
    if (ch === 'b') return '\b'
    if (ch === 'f') return '\f'
    return ch
  })
}

export function extractSimplePdfText(bytes) {
  const raw = typeof bytes === 'string' ? bytes : new TextDecoder('latin1').decode(bytes)
  const lines = []
  const pattern = /\(((?:\\.|[^\\)])*)\)\s*Tj/g
  let match = pattern.exec(raw)
  while (match) {
    lines.push(unescapePdf(match[1]))
    match = pattern.exec(raw)
  }
  return lines.join('\n')
}

function escapePdfText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function encodeLatin1(text) {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code > 255) throw new Error('pdf text must be latin-1')
    out[i] = code
  }
  return out
}

/** One-page Helvetica PDF. `lines` must be Latin-1 so the xref stays valid. */
export function buildSimplePdf(lines) {
  const commands = ['BT', '/F1 12 Tf', '50 760 Td', '16 TL']
  lines.forEach((line, index) => {
    const text = `(${escapePdfText(line)}) Tj`
    commands.push(index === 0 ? text : `T* ${text}`)
  })
  commands.push('ET')
  const stream = commands.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefAt = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return encodeLatin1(pdf)
}
