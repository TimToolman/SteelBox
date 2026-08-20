// ============================================================
// Build the manual test plan as a Word document.
//
//   npm i docx --no-save
//   node docs/build-testplan-docx.cjs SteelBox-Test-Plan.docx
//
// TESTPLAN.md is the source of truth — this parses it rather than
// restating it, so the .docx can never drift from the list the team
// actually maintains. Re-run after editing the markdown.
//
// Landscape: the case tables are five columns and two of them hold
// full sentences; portrait squeezes Steps and Expect into slivers.
// ============================================================
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  ShadingType, BorderStyle, PageOrientation, AlignmentType, HeadingLevel,
} = require('docx')

const NAVY = '0C1E3A'
const ORANGE = 'C2410C'
const INK = '1F2937'
const MUTED = '64748B'
const RULE = 'D8DCE3'
const BAND = 'F1F5F9'
const FONT = 'Calibri'

// Letter landscape, 0.6" margins → 13,680 twips of usable width.
const PAGE_W = 15840
const MARGIN = 864
const CONTENT_W = PAGE_W - MARGIN * 2

const SRC = path.join(__dirname, '..', 'TESTPLAN.md')
const md = fs.readFileSync(SRC, 'utf8')

// ── inline markdown → runs ──────────────────────────────────
// Handles **bold** and `code`, which is everything TESTPLAN.md uses.
function runs(text, { size = 18, color = INK, bold = false } = {}) {
  const out = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), size, color, bold, font: FONT }))
    const tok = m[0]
    if (tok.startsWith('**')) {
      out.push(new TextRun({ text: tok.slice(2, -2), size, color, bold: true, font: FONT }))
    } else {
      out.push(new TextRun({ text: tok.slice(1, -1), size: size - 1, color: ORANGE, font: 'Consolas' }))
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), size, color, bold, font: FONT }))
  return out.length ? out : [new TextRun({ text: '', size, font: FONT })]
}

const para = (text, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 120, line: 264 },
  children: runs(text, opts),
})

const bullet = text => new Paragraph({
  bullet: { level: 0 },
  spacing: { after: 80, line: 264 },
  children: runs(text, { size: 18 }),
})

const h1 = text => new Paragraph({
  spacing: { after: 80 },
  children: [new TextRun({ text, bold: true, size: 40, color: NAVY, font: FONT })],
})

const h2 = text => new Paragraph({
  spacing: { before: 360, after: 140 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
  children: [new TextRun({ text, bold: true, size: 26, color: NAVY, font: FONT })],
})

// ── tables ──────────────────────────────────────────────────
const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
}

function cell(width, text, { head = false, mono = false, shade } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: cellBorders,
    shading: head
      ? { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' }
      : shade ? { type: ShadingType.CLEAR, fill: shade, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({
      spacing: { after: 0, line: 240 },
      children: head
        ? [new TextRun({ text, bold: true, size: 16, color: 'FFFFFF', font: FONT })]
        : mono
          ? [new TextRun({ text, size: 15, color: ORANGE, font: 'Consolas' })]
          : runs(text, { size: 16 }),
    })],
  })
}

function table(widths, header, rows, { firstColBold = true } = {}) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: header.map((t, i) => cell(widths[i], t, { head: true })),
      }),
      ...rows.map((r, ri) => new TableRow({
        children: r.map((t, i) => cell(widths[i], t, {
          shade: ri % 2 ? BAND : undefined,
          mono: false,
        })),
      })),
    ],
  })
}

// ── parse TESTPLAN.md ───────────────────────────────────────
const lines = md.split('\n')
const blocks = []          // {type:'h1'|'h2'|'p'|'ul'|'table', ...}
let i = 0
while (i < lines.length) {
  const line = lines[i]
  if (/^#\s/.test(line)) { blocks.push({ type: 'h1', text: line.replace(/^#\s+/, '') }); i++; continue }
  if (/^##\s/.test(line)) { blocks.push({ type: 'h2', text: line.replace(/^##\s+/, '') }); i++; continue }
  if (/^\|/.test(line)) {
    const rows = []
    while (i < lines.length && /^\|/.test(lines[i])) {
      const cells = lines[i].split('|').slice(1, -1).map(c => c.trim())
      if (!cells.every(c => /^-+$/.test(c))) rows.push(cells)
      i++
    }
    blocks.push({ type: 'table', rows })
    continue
  }
  if (/^-\s/.test(line)) {
    const items = []
    while (i < lines.length && /^-\s/.test(lines[i])) { items.push(lines[i].replace(/^-\s+/, '')); i++ }
    blocks.push({ type: 'ul', items })
    continue
  }
  if (line.trim()) {
    // Fold hard-wrapped paragraphs back into one run of prose.
    let text = line.trim()
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^[#|\-]/.test(lines[i + 1])) {
      i++
      text += ' ' + lines[i].trim()
    }
    blocks.push({ type: 'p', text })
  }
  i++
}

// Column widths per table shape: the 5-col case tables, the 4-col demo
// accounts roster, and the 3-col regression table.
const CASE_W = [780, 1900, 4400, 4900, 1700]
const ACCT_W = [2600, 3200, 2800, 5080]
const REG_W = [2600, 7480, 3600]

const children = []
let caseCount = 0
let firstSectionAt = -1   // where the summary tiles go: after the intro, before § 1

for (const b of blocks) {
  if (b.type === 'h1') {
    children.push(h1(b.text))
    continue
  }
  if (b.type === 'h2') {
    if (firstSectionAt < 0) firstSectionAt = children.length
    children.push(h2(b.text))
    continue
  }
  if (b.type === 'p') {
    // "**Sign in:** …" lines introduce a persona — give them the tinted callout.
    if (/^\*\*Sign in:\*\*/.test(b.text)) {
      children.push(new Paragraph({
        spacing: { after: 100, line: 264 },
        shading: { type: ShadingType.CLEAR, fill: BAND, color: 'auto' },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: ORANGE, space: 8 } },
        children: runs(b.text, { size: 18 }),
      }))
    } else {
      children.push(para(b.text))
    }
    continue
  }
  if (b.type === 'ul') {
    b.items.forEach(t => children.push(bullet(t)))
    continue
  }
  if (b.type === 'table') {
    const [header, ...rows] = b.rows
    const widths = header.length === 5 ? CASE_W : header.length === 4 ? ACCT_W : REG_W
    if (header.length === 5) caseCount += rows.length
    children.push(table(widths, header, rows))
    children.push(new Paragraph({ spacing: { after: 120 }, children: [] }))
    continue
  }
}

// Cover strip: what this is and how big it is, before the first persona.
const cover = [
  new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: 'NATIONAL STEELBOX', bold: true, size: 18, color: ORANGE, font: FONT, characterSpacing: 60 })],
  }),
]
// Splice the summary FIRST — inserting the cover strip ahead of it would
// shift firstSectionAt by one and land the tiles above the subtitle.

const summary = new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: [CONTENT_W / 3, CONTENT_W / 3, CONTENT_W / 3],
  rows: [new TableRow({
    children: [
      [String(caseCount), 'Test cases'],
      ['10', 'Personas'],
      ['208 + 146', 'Automated checks per ship'],
    ].map(([n, k]) => new TableCell({
      width: { size: CONTENT_W / 3, type: WidthType.DXA },
      borders: cellBorders,
      shading: { type: ShadingType.CLEAR, fill: BAND, color: 'auto' },
      margins: { top: 120, bottom: 120, left: 140, right: 140 },
      children: [
        new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: n, bold: true, size: 36, color: ORANGE, font: FONT })] }),
        new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: k.toUpperCase(), bold: true, size: 14, color: MUTED, font: FONT, characterSpacing: 40 })] }),
      ],
    })),
  })],
})

children.splice(firstSectionAt, 0, summary, new Paragraph({ spacing: { after: 200 }, children: [] }))
children.splice(0, 0, ...cover)

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: FONT, size: 18, color: INK }, paragraph: { spacing: { line: 264 } } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_W, height: 12240, orientation: PageOrientation.LANDSCAPE },
        margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      },
    },
    children,
  }],
})

const out = process.argv[2] || 'SteelBox-Test-Plan.docx'
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(out, buf)
  console.log(`wrote ${out} — ${caseCount} test cases, ${buf.length} bytes`)
})
