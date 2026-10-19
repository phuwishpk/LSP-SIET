// Minimal Markdown → .docx for the report section: headings, paragraphs (bold/code/italic),
// bullet/numbered lists, pipe tables, fenced code, images, blockquotes. <details> blocks are dropped.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const D = require('docx')
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, ImageRun, AlignmentType, BorderStyle, ShadingType, LevelFormat } = D

const [,, src, out] = process.argv
const md = fs.readFileSync(src, 'utf8').replace(/<details>[\s\S]*?<\/details>/g, '')
const base = path.dirname(src)
const FONT = 'TH Sarabun New'
const SZ = 32 // 16pt (thesis standard)
const runs = (text, extra = {}) => {
  const out = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let last = 0, m
  const push = (t, o = {}) => { if (t) out.push(new TextRun({ text: t, font: FONT, size: SZ, ...extra, ...o })) }
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) push(tok.slice(2, -2), { bold: true })
    else if (tok.startsWith('`')) push(tok.slice(1, -1), { font: 'Courier New', size: SZ - 6 })
    else push(tok.slice(1, -1), { italics: true })
    last = m.index + tok.length
  }
  push(text.slice(last))
  return out
}
const clean = (t) => t.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/<[^>]+>/g, '').replace(/&ldquo;|&rdquo;/g, '"').replace(/\\\|/g, '|')
const P = (text, o = {}) => new Paragraph({ children: runs(clean(text), o.run), spacing: { after: 120 }, ...o.para })
const body = []
const lines = md.split('\n')
let i = 0
const border = { style: BorderStyle.SINGLE, size: 4, color: '888888' }
const borders = { top: border, bottom: border, left: border, right: border }
while (i < lines.length) {
  const line = lines[i]
  if (!line.trim()) { i++; continue }
  if (/^---+$/.test(line.trim())) { i++; continue }
  let m
  if ((m = line.match(/^(#{1,4}) (.*)/))) {
    const lvl = m[1].length
    const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][lvl - 1]
    body.push(new Paragraph({ heading: level, children: [new TextRun({ text: clean(m[2]), font: FONT, bold: true, size: lvl === 1 ? 40 : lvl === 2 ? 36 : 32 })], spacing: { before: 240, after: 120 } }))
    i++; continue
  }
  if (line.startsWith('```')) {
    const code = []; i++
    while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
    i++
    for (const c of code) body.push(new Paragraph({ children: [new TextRun({ text: c || ' ', font: 'Courier New', size: 20 })], spacing: { after: 0 }, shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } }))
    body.push(new Paragraph({ text: '', spacing: { after: 120 } }))
    continue
  }
  if ((m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/))) {
    const file = path.join(base, m[2])
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file)
      // scale to the text width (6.3 in = 605 pt) keeping aspect ratio
      const png = data; const w = png.readUInt32BE(16), h = png.readUInt32BE(20)
      const W = 605, H = Math.round(W * h / w)
      body.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data, transformation: { width: W, height: Math.min(H, 760) }, altText: { title: m[1], description: m[1], name: m[1] } })], spacing: { after: 60 } }))
    } else body.push(P(`[ภาพ ${m[2]}]`))
    i++; continue
  }
  if (line.startsWith('|')) {
    const rows = []
    while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++ }
    const cells = (r) => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim())
    const head = cells(rows[0]); const data = rows.slice(2).map(cells)
    const n = head.length; const total = 9000; const first = Math.min(2600, Math.round(total / n)); const rest = Math.round((total - first) / (n - 1 || 1))
    const widths = head.map((_, k) => (k === 0 ? first : rest)); if (n === 1) widths[0] = total
    const mk = (cs, isHead) => new TableRow({ tableHeader: isHead, children: cs.slice(0, n).concat(Array(Math.max(0, n - cs.length)).fill('')).map((c, k) => new TableCell({ width: { size: widths[k], type: WidthType.DXA }, borders, shading: isHead ? { type: ShadingType.CLEAR, fill: 'E7E7E7', color: 'auto' } : undefined, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ children: runs(clean(c), isHead ? { bold: true, size: 26 } : { size: 26 }), spacing: { after: 0 } })] })) })
    body.push(new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows: [mk(head, true), ...data.map((r) => mk(r, false))] }))
    body.push(new Paragraph({ text: '', spacing: { after: 120 } }))
    continue
  }
  if ((m = line.match(/^\s*([-*]|\d+\.) (.*)/))) {
    const numbered = /\d/.test(m[1])
    body.push(new Paragraph({ children: runs(clean(m[2])), numbering: { reference: numbered ? 'nums' : 'bullets', level: line.search(/\S/) >= 2 ? 1 : 0 }, spacing: { after: 60 } }))
    i++; continue
  }
  if (line.startsWith('>')) {
    const q = []; while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''))
    body.push(new Paragraph({ children: runs(clean(q.join(' '))), indent: { left: 567 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: '8A8A8A', space: 8 } }, spacing: { after: 120 } }))
    continue
  }
  // paragraph: join consecutive text lines
  const para = []; while (i < lines.length && lines[i].trim() && !/^(#|\||```|!\[|>|---|\s*([-*]|\d+\.) )/.test(lines[i])) para.push(lines[i++].trim())
  body.push(P(para.join(' ')))
}
const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: SZ } } } },
  numbering: { config: [
    { reference: 'bullets', levels: [0, 1].map((l) => ({ level: l, format: LevelFormat.BULLET, text: l ? '–' : '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } } })) },
    { reference: 'nums', levels: [0, 1].map((l) => ({ level: l, format: LevelFormat.DECIMAL, text: '%' + (l + 1) + '.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } } })) },
  ] },
  sections: [{ properties: { page: { margin: { top: 1440, right: 1134, bottom: 1134, left: 1701 } } }, children: body }],
})
fs.writeFileSync(out, await Packer.toBuffer(doc))
console.log('wrote', out, fs.statSync(out).size, 'bytes;', body.length, 'blocks')
