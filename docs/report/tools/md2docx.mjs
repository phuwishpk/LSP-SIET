// Markdown → .docx in thesis/report style (TH Sarabun New 16 pt, thesis margins, page numbers,
// table captions above tables, figure captions below figures, numbered headings kept from the text).
// Supports: headings, paragraphs (bold/code/italic), bullet & numbered lists, pipe tables, fenced
// code, images, blockquotes. <details> blocks are dropped.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const D = require('docx')
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, ImageRun, AlignmentType, BorderStyle, ShadingType, LevelFormat, Header, Footer, PageNumber, TabStopType } = D

const [,, src, out] = process.argv
const md = fs.readFileSync(src, 'utf8').replace(/<details>[\s\S]*?<\/details>/g, '')
const base = path.dirname(src)
const FONT = 'TH Sarabun New'
const SZ = 32            // 16 pt body
const SZ_TABLE = 28      // 14 pt inside tables
const TEXT_W = 9072      // 6.3 in of text width (A4 − 1.5 in − 1 in) in DXA
const IMG_W = 454        // the same width in points

const run = (t, o = {}) => new TextRun({ text: t, font: FONT, size: SZ, ...o })
function runs(text, extra = {}) {
  const out = []
  const re = /(\*\*.+?\*\*|`[^`]+`|\*[^*]+\*)/g
  let last = 0, m
  const push = (t, o = {}) => { if (t) out.push(run(t, { ...extra, ...o })) }
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(...runs(tok.slice(2, -2), { ...extra, bold: true }))   // bold may wrap inline code
    else if (tok.startsWith('`')) push(tok.slice(1, -1), { font: 'Courier New', size: (extra.size ?? SZ) - 8 })
    else push(tok.slice(1, -1), { italics: true })
    last = m.index + tok.length
  }
  push(text.slice(last))
  return out
}
const clean = (t) => t.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/<\/?(details|summary|br|b|i|sub|sup)\b[^>]*>/g, '').replace(/&ldquo;|&rdquo;/g, '"').replace(/\\\|/g, '|')
const isTableCaption = (t) => /^\*\*ตารางที่ \d/.test(t)
const isFigureCaption = (t) => /^\*\*รูปที่ \d/.test(t)
const body = []
const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const borders = { top: border, bottom: border, left: border, right: border }
const lines = md.split('\n')
let i = 0
let pendingFigure = null  // an image waits for its caption so both stay on one page
let inList = false, listInstance = 0
let landscapeFigure = null
const landscapeMarks = []  // [start, end) ranges of body that go on a landscape page  // the wide ER diagram gets a landscape page of its own

function flushParagraph(text) {
  const t = clean(text)
  if (isTableCaption(text)) {
    // caption above the table, bold label, kept with the table
    body.push(new Paragraph({ children: runs(text), spacing: { before: 200, after: 80 }, keepNext: true }))
  } else if (isFigureCaption(text)) {
    if (pendingFigure) { body.push(pendingFigure); pendingFigure = null }
    body.push(new Paragraph({ children: runs(text), alignment: AlignmentType.CENTER, spacing: { after: 240 } }))
    if (landscapeFigure !== null) { landscapeMarks.push([landscapeFigure, body.length]); landscapeFigure = null }
  } else {
    body.push(new Paragraph({ children: runs(t), alignment: AlignmentType.THAI_DISTRIBUTE, indent: { firstLine: 720 }, spacing: { after: 120, line: 276 } }))
  }
}

while (i < lines.length) {
  const line = lines[i]
  if (!line.trim() || /^---+$/.test(line.trim())) { i++; continue }
  let m
  if ((m = line.match(/^(#{1,4}) (.*)/))) {
    const lvl = m[1].length
    const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][lvl - 1]
    body.push(new Paragraph({ heading: level, keepNext: true, children: [new TextRun({ text: clean(m[2]), font: FONT, bold: true, size: lvl === 1 ? 40 : lvl === 2 ? 36 : 32, color: '000000' })], spacing: { before: lvl === 1 ? 0 : 280, after: 120 } }))
    i++; continue
  }
  if (line.startsWith('```')) {
    const code = []; i++
    while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
    i++
    code.forEach((c, k) => body.push(new Paragraph({ children: [new TextRun({ text: c || ' ', font: 'Courier New', size: 20 })], spacing: { after: 0, line: 240 }, indent: { left: 360, right: 360 }, shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' }, keepNext: k < code.length - 1, keepLines: true })))
    body.push(new Paragraph({ text: '', spacing: { after: 120 } }))
    continue
  }
  if ((m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/))) {
    const file = path.join(base, m[2])
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file)
      const w = data.readUInt32BE(16), h = data.readUInt32BE(20)
      let W = IMG_W, H = Math.round(W * h / w)
      if (H > 560) { H = 560; W = Math.round(H * w / h) }   // keep tall figures on one page
      if (w / h > 1.6 && w > 3000) { W = 662; H = Math.round(W * h / w); landscapeFigure = body.length }   // ER diagram: landscape page
      pendingFigure = new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [new ImageRun({ type: 'png', data, transformation: { width: W, height: H }, altText: { title: m[1], description: m[1], name: m[1] } })], spacing: { before: 120, after: 80 } })
    } else flushParagraph(`[ภาพ ${m[2]}]`)
    i++; continue
  }
  if (line.startsWith('|')) {
    const rows = []
    while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++ }
    const cells = (r) => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim())
    const head = cells(rows[0]); const data = rows.slice(2).map(cells)
    const n = head.length
    // column widths from content length, first column never narrower than 18%
    const lens = head.map((_, k) => Math.max(...[head, ...data].map((r) => (r[k] || '').length), 4))
    const sum = lens.reduce((a, b) => a + b, 0)
    let widths = lens.map((l) => Math.round(TEXT_W * l / sum))
    const minW = Math.round(TEXT_W * 0.12)
    widths = widths.map((w) => Math.max(w, minW))
    const scale = TEXT_W / widths.reduce((a, b) => a + b, 0)
    widths = widths.map((w) => Math.round(w * scale))
    widths[n - 1] += TEXT_W - widths.reduce((a, b) => a + b, 0)
    const mk = (cs, isHead) => new TableRow({ tableHeader: isHead, cantSplit: true, children: cs.slice(0, n).concat(Array(Math.max(0, n - cs.length)).fill('')).map((c, k) => new TableCell({ width: { size: widths[k], type: WidthType.DXA }, borders, shading: isHead ? { type: ShadingType.CLEAR, fill: 'E7E7E7', color: 'auto' } : undefined, margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ children: runs(clean(c), isHead ? { bold: true, size: SZ_TABLE } : { size: SZ_TABLE }), alignment: isHead ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { after: 0, line: 240 } })] })) })
    body.push(new Table({ width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: widths, rows: [mk(head, true), ...data.map((r) => mk(r, false))] }))
    body.push(new Paragraph({ text: '', spacing: { after: 160 } }))
    continue
  }
  if ((m = line.match(/^(\s*)([-*]|\d+\.) (.*)/))) {
    const numbered = /\d/.test(m[2]); const lvl = m[1].length >= 2 ? 1 : 0
    if (!inList) { listInstance += 1; inList = true }
    const text = [m[3]]; i++
    // a wrapped item continues on indented lines that are not themselves items
    while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.) /.test(lines[i])) text.push(lines[i++].trim())
    body.push(new Paragraph({ children: runs(clean(text.join(' '))), numbering: { reference: numbered ? 'nums' : 'bullets', level: lvl, instance: listInstance }, alignment: AlignmentType.THAI_DISTRIBUTE, spacing: { after: 60, line: 276 } }))
    continue
  }
  inList = false
  if (line.startsWith('>')) {
    const q = []; while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''))
    body.push(new Paragraph({ children: runs(clean(q.join(' '))), indent: { left: 720, right: 360 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: '8A8A8A', space: 8 } }, spacing: { after: 120, line: 276 } }))
    continue
  }
  const para = []
  while (i < lines.length && lines[i].trim() && !/^(#|\||```|!\[|>|---|\s*([-*]|\d+\.) )/.test(lines[i])) para.push(lines[i++].trim())
  flushParagraph(para.join(' '))
}
if (pendingFigure) body.push(pendingFigure)

const levels = (fmt, text) => [0, 1].map((l) => ({ level: l, format: fmt, text: text(l), alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 + 540 * l, hanging: 360 } }, run: { font: FONT, size: SZ } } }))
const { PageOrientation } = D
const header = () => new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SZ })] })] })
// thesis margins: top 1.5", left 1.5", right 1", bottom 1"
const portrait = (children) => ({ properties: { page: { margin: { top: 2160, right: 1440, bottom: 1440, left: 2160, header: 1134 } } }, headers: { default: header() }, children })
const landscape = (children) => ({ properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 2160, right: 1440, bottom: 1440, left: 1440, header: 1134 } } }, headers: { default: header() }, children })
function sections() {
  const out = []; let cursor = 0
  for (const [a, b] of landscapeMarks) { if (a > cursor) out.push(portrait(body.slice(cursor, a))); out.push(landscape(body.slice(a, b))); cursor = b }
  out.push(portrait(body.slice(cursor)))
  return out
}
const doc = new Document({
  creator: 'LSP-SIET project',
  styles: {
    default: { document: { run: { font: FONT, size: SZ } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 40, bold: true, color: '000000' }, paragraph: { outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 36, bold: true, color: '000000' }, paragraph: { outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 32, bold: true, color: '000000' }, paragraph: { outlineLevel: 2 } },
    ],
  },
  numbering: { config: [
    { reference: 'bullets', levels: levels(LevelFormat.BULLET, (l) => (l ? '–' : '•')) },
    { reference: 'nums', levels: levels(LevelFormat.DECIMAL, (l) => '%' + (l + 1) + ')') },
  ] },
  sections: sections(),
})
fs.writeFileSync(out, await Packer.toBuffer(doc))
console.log('wrote', out, fs.statSync(out).size, 'bytes;', body.length, 'blocks')
