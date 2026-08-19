// ============================================================
// Build the phased roadmap as a Word document.
//
//   npm i docx --no-save
//   node docs/build-roadmap-docx.cjs SteelBox-Roadmap.docx
//
// roadmap.html is the source of truth — this parses the Gantt rows,
// gates, phase cards and tables straight out of it, so the .docx can't
// drift from the page. Re-run after editing the HTML.
//
// The Gantt survives the trip: a 28-column table with shaded week cells
// is a real chart in Word, not a screenshot of one, so it prints and
// edits like the rest of the document.
// ============================================================
const fs = require('fs')
const path = require('path')
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  ShadingType, BorderStyle, PageOrientation, AlignmentType,
} = require('docx')

const NAVY = '0C1E3A'
const BLUE = '0057B8'
const AMBER = 'B45309'
const ORANGE = 'E65100'
const GREEN = '1B7A5A'
const LATER = '9DB8D8'
const INK = '1F2937'
const MUTED = '64748B'
const RULE = 'D8DCE3'
const BAND = 'F1F5F9'
const FONT = 'Calibri'

const PAGE_W = 15840          // Letter, landscape
const MARGIN = 720
const CONTENT_W = PAGE_W - MARGIN * 2   // 14,400 twips

const html = fs.readFileSync(path.join(__dirname, '..', 'roadmap.html'), 'utf8')

// ── tiny HTML helpers ───────────────────────────────────────
const strip = s => s
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .trim()

const all = (re, src = html) => {
  const out = []
  let m
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  while ((m = rx.exec(src))) out.push(m)
  return out
}

// ── parse: stat tiles ───────────────────────────────────────
const stats = all(/<div class="stat[^"]*">\s*<div class="n">([^<]*)<\/div>\s*<div class="k">([^<]*)<\/div>\s*<div class="d">([\s\S]*?)<\/div>/)
  .map(m => ({ n: strip(m[1]), k: strip(m[2]), d: strip(m[3]) }))

// ── parse: Gantt rows ───────────────────────────────────────
// Labels and bars are separate grid items keyed by grid-row, so collect
// both and join on the row number.
const labels = new Map()
for (const m of all(/<div class="label" style="grid-row: (\d+)"><span class="p">([\s\S]*?)<\/span><span class="t">([\s\S]*?)<\/span><span class="s">([\s\S]*?)<\/span><\/div>/)) {
  labels.set(+m[1], { id: strip(m[2]), title: strip(m[3]), sub: strip(m[4]) })
}

const bars = new Map()
for (const m of all(/<div class="bar([^"]*)" style="grid-row: (\d+); grid-column: (\d+) \/ (\d+)">(?:<span class="c">([^<]*)<\/span>)?<\/div>/)) {
  // grid columns are 1-based with column 1 holding the label, so the
  // first week sits in column 2.
  bars.set(+m[2], {
    kind: (m[1] || '').trim(),
    from: +m[3] - 1,
    to: +m[4] - 2,
    text: strip(m[5] || ''),
  })
}
// A one-week bar carries its label alongside instead of inside.
for (const m of all(/<div class="barnote" style="grid-row: (\d+); grid-column: \d+ \/ \d+">([^<]*)<\/div>/)) {
  const row = bars.get(+m[1])
  if (row && !row.text) row.text = strip(m[2])
}

const milestones = new Map()
for (const m of all(/<div class="milestone([^"]*)" style="grid-row: (\d+); grid-column: (\d+) \/ \d+"><span class="dia"><\/span><span class="txt">([\s\S]*?)<\/span><\/div>/)) {
  milestones.set(+m[2], { partner: /partner/.test(m[1]), week: +m[3] - 1, text: strip(m[4]) })
}

const bands = new Map()
for (const m of all(/<div class="band" style="grid-row: (\d+)">([\s\S]*?)<\/div>/)) {
  bands.set(+m[1], strip(m[2]))
}

const ganttRows = [...new Set([...labels.keys(), ...bands.keys()])]
  .sort((a, b) => a - b)
  .map(row => ({
    row,
    band: bands.get(row),
    label: labels.get(row),
    bar: bars.get(row),
    milestone: milestones.get(row),
  }))

// ── parse: gates, cards, tables, panels ─────────────────────
const gates = all(/<div class="gate">\s*<div class="who">([\s\S]*?)<\/div>\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/)
  .map(m => ({ who: strip(m[1]), title: strip(m[2]), body: strip(m[3]) }))

const cards = all(/<div class="card([^"]*)">\s*<div class="top"><span class="id">([\s\S]*?)<\/span><span class="wk">([\s\S]*?)<\/span><\/div>\s*<h3>([\s\S]*?)<\/h3>\s*<ul>([\s\S]*?)<\/ul>\s*<div class="foot"><span>([\s\S]*?)<\/span><span>([\s\S]*?)<\/span><\/div>/)
  .map(m => ({
    launch: /launch/.test(m[1]),
    id: strip(m[2]),
    weeks: strip(m[3]),
    title: strip(m[4]),
    points: all(/<li>([\s\S]*?)<\/li>/, m[5]).map(x => strip(x[1])),
    foot: [strip(m[6]), strip(m[7])],
  }))

const tables = all(/<table>([\s\S]*?)<\/table>/).map(t => {
  const caption = strip((t[1].match(/<caption>([\s\S]*?)<\/caption>/) || [, ''])[1])
  const head = all(/<th[^>]*>([\s\S]*?)<\/th>/, t[1]).map(x => strip(x[1]))
  const rows = all(/<tr([^>]*)>([\s\S]*?)<\/tr>/, (t[1].match(/<tbody>([\s\S]*?)<\/tbody>/) || [, ''])[1])
    .map(r => ({
      hl: /class="hl"/.test(r[1]),
      cells: all(/<td[^>]*>([\s\S]*?)<\/td>/, r[2]).map(x => strip(x[1])),
    }))
  return { caption, head, rows }
})

const panels = all(/<div class="panel ([a-z]+)">\s*<h3>([\s\S]*?)<\/h3>\s*<ul>([\s\S]*?)<\/ul>/)
  .map(m => ({
    kind: m[1],
    title: strip(m[2]),
    items: all(/<li>([\s\S]*?)<\/li>/, m[3]).map(x => strip(x[1]).replace(/^[✓!]\s*/, '')),
  }))

const headline = strip((html.match(/<h1>([\s\S]*?)<\/h1>/) || [, ''])[1])
const lede = strip((html.match(/<h1>[\s\S]*?<\/h1>\s*<p>([\s\S]*?)<\/p>/) || [, ''])[1])

// ── document furniture ──────────────────────────────────────
const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  left: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  right: { style: BorderStyle.SINGLE, size: 4, color: RULE },
}

const text = (t, o = {}) => new TextRun({
  text: t, size: o.size ?? 18, color: o.color ?? INK, bold: !!o.bold,
  font: o.font ?? FONT, characterSpacing: o.spacing,
})

const para = (t, o = {}) => new Paragraph({
  spacing: { after: o.after ?? 120, before: o.before ?? 0, line: 264 },
  alignment: o.align,
  children: Array.isArray(t) ? t : [text(t, o)],
})

const h1 = t => para(t, { size: 40, bold: true, color: NAVY, after: 80 })
const h2 = t => new Paragraph({
  spacing: { before: 340, after: 140 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
  children: [text(t, { size: 26, bold: true, color: NAVY })],
})
const bullet = t => new Paragraph({
  bullet: { level: 0 }, spacing: { after: 60, line: 264 }, children: [text(t, { size: 17 })],
})

function cell(width, children, o = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: o.borders ?? cellBorders,
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
    margins: o.margins ?? { top: 60, bottom: 60, left: 90, right: 90 },
    columnSpan: o.span,
    verticalAlign: 'center',
    children,
  })
}

const tcell = (width, t, o = {}) => cell(width, [para(t, { ...o, after: 0 })], o)

// ── the Gantt ───────────────────────────────────────────────
const WEEKS = 28
const LABEL_W = 3000
const WEEK_W = Math.floor((CONTENT_W - LABEL_W) / WEEKS)   // 407
const GANTT_W = [LABEL_W, ...Array(WEEKS).fill(WEEK_W)]

const BAR_FILL = { '': BLUE, gated: AMBER, rev: GREEN, later: LATER }

const weekHeader = new TableRow({
  tableHeader: true,
  children: [
    tcell(LABEL_W, 'Phase', { bold: true, size: 16, color: 'FFFFFF', fill: NAVY }),
    ...Array.from({ length: WEEKS }, (_, i) => tcell(WEEK_W, String(i + 1), {
      bold: true, size: 13, color: 'FFFFFF', fill: NAVY, align: AlignmentType.CENTER,
    })),
  ],
})

function ganttRow(r) {
  if (r.band) {
    return new TableRow({
      children: [cell(CONTENT_W, [para(r.band, { size: 15, bold: true, color: MUTED, after: 0, spacing: 40 })], {
        span: WEEKS + 1, fill: BAND,
      })],
    })
  }
  const label = cell(LABEL_W, [
    para(`${r.label.id}  ${r.label.title}`, { size: 16, bold: true, after: 0 }),
    para(r.label.sub, { size: 14, color: MUTED, after: 0 }),
  ])
  const cells = [label]
  for (let w = 1; w <= WEEKS; w++) {
    if (r.bar && w >= r.bar.from && w <= r.bar.to) {
      // Print the bar's own label in its first cell; Word has no way to
      // span text across shaded cells without merging them away.
      const first = w === r.bar.from
      cells.push(cell(WEEK_W, [para(first ? r.bar.text : '', {
        size: 12, bold: true, color: 'FFFFFF', after: 0,
      })], { fill: BAR_FILL[r.bar.kind] ?? BLUE, margins: { top: 40, bottom: 40, left: 30, right: 30 } }))
    } else if (r.milestone && w === r.milestone.week) {
      cells.push(cell(WEEK_W, [para('◆', {
        size: 20, bold: true, color: r.milestone.partner ? GREEN : ORANGE, after: 0, align: AlignmentType.CENTER,
      })], { margins: { top: 20, bottom: 20, left: 20, right: 20 } }))
    } else {
      cells.push(cell(WEEK_W, [para('', { size: 12, after: 0 })]))
    }
  }
  return new TableRow({ children: cells })
}

const gantt = new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: GANTT_W,
  rows: [weekHeader, ...ganttRows.map(ganttRow)],
})

// Milestone captions can't live in a 407-twip cell, so they read underneath.
const milestoneKey = ganttRows
  .filter(r => r.milestone)
  .map(r => bullet(`◆ Week ${r.milestone.week} — ${r.label.title}: ${r.milestone.text}`))

// ── assemble ────────────────────────────────────────────────
const children = [
  para('NATIONAL STEELBOX', { size: 18, bold: true, color: ORANGE, spacing: 60, after: 60 }),
  h1(headline),
  para(lede, { size: 20, color: INK, after: 200 }),
]

// Stat tiles across the top.
children.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: Array(stats.length).fill(Math.floor(CONTENT_W / stats.length)),
  rows: [new TableRow({
    children: stats.map(s => cell(Math.floor(CONTENT_W / stats.length), [
      para(s.n, { size: 40, bold: true, color: s.k.includes('launch') ? ORANGE : BLUE, after: 20 }),
      para(s.k.toUpperCase(), { size: 13, bold: true, color: MUTED, spacing: 40, after: 40 }),
      para(s.d, { size: 15, color: INK, after: 0 }),
    ], { fill: BAND, margins: { top: 140, bottom: 140, left: 140, right: 140 } })),
  })],
}))

children.push(h2('The 28 weeks'))
children.push(para('Each bar is a phase; the number on it is how many open items it carries. Amber bars wait on an outside party — they start early because their length is not ours to shorten. The Aarcadian partnership runs in its own band underneath, on the partner\'s calendar.', { size: 17, color: MUTED, after: 160 }))
children.push(gantt)
children.push(para('', { after: 120 }))
children.push(para('Milestones', { size: 18, bold: true, color: NAVY, after: 80 }))
children.push(...milestoneKey)

children.push(h2('Three things set the date — none of them are engineering'))
children.push(new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: Array(gates.length).fill(Math.floor(CONTENT_W / gates.length)),
  rows: [new TableRow({
    children: gates.map(g => cell(Math.floor(CONTENT_W / gates.length), [
      para(g.who.toUpperCase(), { size: 13, bold: true, color: AMBER, spacing: 40, after: 40 }),
      para(g.title, { size: 20, bold: true, color: NAVY, after: 60 }),
      para(g.body, { size: 16, color: INK, after: 0 }),
    ], { fill: 'FBEEDB', margins: { top: 140, bottom: 140, left: 140, right: 140 } })),
  })],
}))

children.push(h2('What each phase delivers'))
for (const c of cards) {
  children.push(new Paragraph({
    spacing: { before: 180, after: 60 },
    children: [
      text(`${c.id}   `, { size: 15, bold: true, color: c.launch ? ORANGE : BLUE, spacing: 30 }),
      text(c.title, { size: 21, bold: true, color: NAVY }),
      text(`   ${c.weeks}`, { size: 15, color: MUTED }),
    ],
  }))
  c.points.forEach(p => children.push(bullet(p)))
  children.push(para(c.foot.join('  ·  '), { size: 14, color: MUTED, after: 40 }))
}

for (const t of tables) {
  children.push(h2(t.caption.split('.')[0]))
  if (t.caption.includes('.')) children.push(para(t.caption.slice(t.caption.indexOf('.') + 1).trim(), { size: 16, color: MUTED, after: 120 }))
  const n = t.head.length
  const w = n === 4 ? [4600, 1700, 2100, 6000] : [5200, 2000, 2200, 5000]
  children.push(new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: w,
    rows: [
      new TableRow({
        tableHeader: true,
        children: t.head.map((hh, i) => tcell(w[i], hh, { bold: true, size: 16, color: 'FFFFFF', fill: NAVY })),
      }),
      ...t.rows.map((r, ri) => new TableRow({
        children: r.cells.map((c, i) => tcell(w[i], c, {
          size: 16, bold: r.hl, fill: r.hl ? 'DCE8F8' : (ri % 2 ? BAND : undefined),
        })),
      })),
    ],
  }))
  children.push(para('', { after: 120 }))
}

for (const p of panels) {
  children.push(h2(p.title))
  p.items.forEach(it => children.push(bullet(it)))
}

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 18, color: INK } } } },
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

const out = process.argv[2] || 'SteelBox-Roadmap.docx'
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(out, buf)
  console.log(`wrote ${out} — ${ganttRows.length} gantt rows, ${cards.length} phase cards, ${tables.length} tables, ${buf.length} bytes`)
})
