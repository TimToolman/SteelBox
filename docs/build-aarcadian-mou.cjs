// ============================================================
// Build the SteelBox × Aarcadian MOU (v0.4).
//
//   node docs/build-aarcadian-mou.cjs SteelBox-Aarcadian-MOU-v0.4.docx
//
// The document text lives here, in the repo, on purpose: the MOU is
// negotiated over weeks and the .docx is regenerated each round, so
// keeping the source in git means a version is never one lost file
// away from being unrecoverable. Edit the content below, re-run, send.
//
// Requires the `docx` package (npm i docx --no-save is enough).
// Styling mirrors the original: blue section headings (#1D4ED8),
// 10pt body, 9pt tables with a blue header band and an orange first
// column, US Letter with 0.5" margins.
// ============================================================
const fs = require('fs')
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  ShadingType, BorderStyle, AlignmentType, LevelFormat, PageOrientation,
} = require('docx')

const BLUE = '1D4ED8'
const ORANGE = 'C2410C'
const INK = '111827'
const MUTED = '6B7280'
const RULE = 'D8DCE3'
const FONT = 'Calibri'
const TABLE_W = 10800

const heading = text => new Paragraph({
  spacing: { before: 320, after: 140 },
  children: [new TextRun({ text, bold: true, color: BLUE, size: 22, font: FONT })],
})

const body = text => new Paragraph({
  spacing: { after: 180, line: 252 },
  children: [new TextRun({ text, size: 20, font: FONT })],
})

const bullet = (lead, rest) => new Paragraph({
  numbering: { reference: 'mou-bullets', level: 0 },
  spacing: { after: 100, line: 252 },
  children: [
    new TextRun({ text: lead + ': ', bold: true, size: 20, font: FONT }),
    new TextRun({ text: rest, size: 20, font: FONT }),
  ],
})

// ── tables ──────────────────────────────────────────────────
const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

const cell = (width, text, { head = false, first = false } = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA },
  borders: cellBorders,
  shading: head ? { type: ShadingType.CLEAR, fill: BLUE, color: 'auto' } : undefined,
  margins: { top: 50, bottom: 50, left: 80, right: 80 },
  children: [new Paragraph({
    spacing: { after: 0, line: 240 },
    children: [new TextRun({
      text,
      bold: head || first,
      color: head ? 'FFFFFF' : first ? ORANGE : INK,
      size: 18,
      font: FONT,
    })],
  })],
})

const table = (widths, header, rows) => new Table({
  width: { size: TABLE_W, type: WidthType.DXA },
  columnWidths: widths,
  rows: [
    new TableRow({
      tableHeader: true,
      children: header.map((t, i) => cell(widths[i], t, { head: true })),
    }),
    ...rows.map(r => new TableRow({
      children: r.map((t, i) => cell(widths[i], t, { first: i === 0 })),
    })),
  ],
})

// ── §4 growth ladder ────────────────────────────────────────
const LADDER = table(
  [1700, 3800, 2760, 2540],
  ['Step', 'What it is', 'Aarcadian gets', 'SteelBox gets'],
  [
    ['1 · Gate-buys', 'Straight wholesale supply to Gulf depots (now)',
      'Volume without retail overhead', 'Reliable, quality supply'],
    ['2 · Consignment', 'Aarcadian inventory listed on the marketplace; paid on sale (mechanics in §6)',
      'Retail-level realization, faster placement', 'Inventory without capital outlay'],
    ['3 · Retail participation', 'Aarcadian shares in retail upside on agreed units',
      'A slice of every retail dollar', 'Deeper supply commitment'],
    ['4 · Rental fleet', 'Aarcadian capital funds rental units; recurring revenue shared',
      'Compounding monthly income', 'Fleet growth without balance-sheet strain'],
    ['5 · Joint venture', 'A shared entity for new markets, transfer stations, or custom builds',
      'Equity in what we build together', 'A truly aligned long-term partner'],
  ],
)

// ── §5 benefits — the deal has to pay three sides, not two ──
const BENEFITS = table(
  [1500, 3100, 3100, 3100],
  ['', 'Aarcadian gets', 'Resellers get', 'SteelBox gets'],
  [
    ['Money',
      'Retail-level realization instead of wholesale — without building a retail arm, a sales team or an ad budget.',
      'Retail margin on stock they never had to buy.',
      'A marketplace with real depth from day one, with no capital tied up in it.'],
    ['Risk',
      'Title stays with Aarcadian until sale, and payment lands before the box leaves the station.',
      'No unsold-unit risk and no floor-plan debt — they owe nothing while a unit sits.',
      'No inventory write-downs; we never own the ageing.'],
    ['Speed',
      'Units leave the depot instead of ageing in it.',
      'Stock within 45 miles — shorter delivery legs, better margins, faster promises to the customer.',
      'Stations sit next to demand rather than next to a depot.'],
    ['Proof',
      'Every unit photographed, graded and signed off by an inspector at SteelBox’s cost — the record a damage claim needs to be collectible.',
      'They sell from the listing instead of from a phone call.',
      'A defensible listing and a grading standard no one else in the region runs.'],
    ['Damage',
      '50/50 on documented estimates instead of a quiet write-down.',
      'A price point they cannot get anywhere else — honest as-is stock at a real discount.',
      'A category nobody else lists openly, and the claims desk that comes with it.'],
    ['Growth',
      'The ladder in §4 — retail participation, rental fleet, joint venture — each one optional and earned.',
      'New territories opening wherever supply can be staged.',
      'Expansion at supply speed, with a partner who has a reason to stay.'],
  ],
)

// ── signature block ─────────────────────────────────────────
const sigCell = lines => new TableCell({
  width: { size: TABLE_W / 2, type: WidthType.DXA },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  },
  margins: { top: 120, bottom: 120, left: 0, right: 120 },
  children: lines.map(([t, bold]) => new Paragraph({
    spacing: { after: 60, line: 240 },
    children: [new TextRun({ text: t, bold: !!bold, size: 20, font: FONT })],
  })),
})

const SIGNATURES = new Table({
  width: { size: TABLE_W, type: WidthType.DXA },
  columnWidths: [TABLE_W / 2, TABLE_W / 2],
  rows: [new TableRow({
    children: [
      sigCell([['For Nationwide SteelBox', true], ['Keith · Brandon · Tim'], ['Date: ____________']]),
      sigCell([['For Aarcadian', true], ['[Name], [Title]'], ['Date: ____________']]),
    ],
  })],
})

// ── document ────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [{
      reference: 'mou-bullets',
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: '•',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 220 } } },
      }],
    }],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
        margin: { top: 900, bottom: 900, left: 720, right: 720 },
      },
    },
    children: [
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: 'MEMORANDUM OF UNDERSTANDING', bold: true, size: 32, color: INK, font: FONT })],
      }),
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: 'Nationwide SteelBox  ×  Aarcadian', bold: true, size: 24, color: BLUE, font: FONT })],
      }),
      new Paragraph({
        spacing: { after: 240 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 8 } },
        children: [new TextRun({
          text: 'Working Draft v0.4 · Non-Binding · August 2026 · For discussion between teams',
          size: 18, color: MUTED, font: FONT,
        })],
      }),

      heading('1. Purpose & Spirit'),
      body('This is a “think big” sketch, not a contract: a plain-language picture of what a partnership between Nationwide SteelBox (“SteelBox”) and Aarcadian could look like, short and long term, so both teams can react, mark it up, and make it ours together. Nothing here is precious or binding. It should take about ten minutes to read.'),

      heading('2. The Fit'),
      body('Our two sides just fit. Aarcadian manufactures, imports, and sources containers — including depot delivery within ~45 miles of each depot. SteelBox builds and runs the retail machine: the marketplace platform, regional marketing, customers, sales, delivery logistics, rentals, and customer support, operated with independent resellers in each territory. Neither of us wants the other’s job — and that is exactly why this works. Said plainly: Aarcadian is the supply side of this business. Without a steady, well-priced, well-documented flow of containers there is no marketplace to run — which is why the commitments below are written to be worth Aarcadian’s while, and not only ours.'),

      heading('3. Phase 1 — Prove It (First 90 Days)'),
      body('Start simple: supply and gate-buys. Aarcadian supplies [20/40ft, one-trip and cargo-worthy] units to Gulf-region depots at agreed wholesale pricing; SteelBox lists every unit with full photo documentation and grading, sells and delivers through its reseller network, and reorders. Working targets to fill in together: [___] units/month to start, sell-through inside [___] days, reorder cadence [___]. Success here is the foundation for every step below.'),

      heading('4. The Growth Ladder'),
      LADDER,
      new Paragraph({ spacing: { before: 140, after: 180, line: 252 }, children: [new TextRun({ text: 'Each step is optional and earned — we climb when the numbers from the prior step say so.', size: 20, font: FONT })] }),

      heading('5. Benefits — What Each Side Gets'),
      body('The ladder above is what we build. This is who it pays, and it has to pay three sides, not two: Aarcadian, the independent resellers who actually sell and deliver the boxes, and SteelBox. If any column here looks thin, that is the part of the deal to renegotiate — a partnership only holds where all three are honestly served.'),
      BENEFITS,
      new Paragraph({ spacing: { before: 140, after: 180, line: 252 }, children: [new TextRun({ text: 'The test we would hold ourselves to: if Aarcadian could do this alone tomorrow, they should — and if a reseller can buy the same unit cheaper elsewhere, they will. Everything above is written so that neither is true.', size: 20, font: FONT })] }),

      heading('6. Consignment & Transfer Stations — How It Works'),
      bullet('Consignment listing', 'Aarcadian lists containers on consignment on the SteelBox marketplace. Title stays with Aarcadian until sale; SteelBox handles photo documentation, grading, listing, and the retail transaction.'),
      bullet('Transfer stations', 'consigned units are staged at transfer stations positioned close to demand — either standalone yards or on-site at a reseller’s location (the Amazon “On-Site” model). Stations sit within 45 miles of Aarcadian depots.'),
      bullet('Pay on sale, before pickup', 'resellers owe nothing while consigned units sit at a transfer station. Payment becomes due when a container sells, and is settled before the reseller picks the unit up from the transfer station for delivery. No upfront inventory cost for resellers; no unsold-unit risk for anyone but the box’s owner.'),
      bullet('Depot-to-station transfers', 'moves from Aarcadian depots to transfer stations are managed by Aarcadian, which may use SteelBox’s driver management software for scheduling, pickup tracking, photo collection, and AI grading at intake — so every unit arrives at a station already documented, graded, and marketplace-ready.'),
      bullet('Free drop-off radius — 45 miles', 'Aarcadian delivers consigned and gate-bought units to SteelBox transfer stations and depots within 45 miles of an Aarcadian depot at no delivery charge to SteelBox, its resellers, or the customer — expanded from the 25-mile radius we started from. The wider ring is what lets a station sit next to demand instead of next to a depot. Beyond 45 miles the move is quoted per trip at [agreed per-mile rate].'),
      bullet('Consignment is the working model', 'Aarcadian agrees that consignment — not one-off gate-buys — is how inventory moves once Phase 1 proves out. Gate-buys stay available for units either side wants to own outright; consignment becomes the default for everything staged at a transfer station.'),

      heading('7. Damaged Units — Repair, Estimate, and the 50/50 Split'),
      body('About one container in ten arrives with damage. Today that unit is either quietly repaired and sold as something it is not, or it becomes an argument. We would rather document it, price it honestly, and sell it as-is — then split what it earns. This section is the part of the partnership both teams build together.'),
      bullet('Designed together', 'Aarcadian works with SteelBox to design the repair → estimate → shipping-line workflow: what a repair estimate must contain to be accepted, which damage classes are worth repairing versus selling as-is, which repair yards we use, and what each line will actually pay on. Aarcadian’s experience with the lines is the reason this workflow can be built at all.'),
      bullet('Documented before it is priced', 'Every inbound unit is inspected in the SteelBox field app — a guided walk-around, photographs at each station, findings recorded with severity. A damaged unit is held off the marketplace until an inspector has graded it. Nothing is listed, claimed or split on an undocumented box.'),
      bullet('The estimate', 'A written repair estimate from the repair yard is attached to the claim record alongside the inspection photos and findings. That one document is what goes to the shipping line, and it is the number both sides work from.'),
      bullet('50/50 split', 'SteelBox and Aarcadian split the damage estimate 50/50. [To settle in the agreement: whether the 50/50 runs on the amount recovered from the line, or on the estimate value regardless of recovery. The two are very different in a year of slow-paying claims, and both teams should say out loud which one they mean.]'),
      bullet('Listed as-is, damaged — not refurbished', 'The unit goes on the marketplace at its damaged grade (D, with a 1–5 severity), with every damage photo on the listing and the findings written in plain language. We do not repaint a damaged box and sell it as refurbished. Refurbished (R) keeps the meaning it has always had — repainted, resealed, reconditioned — and is not the route a damaged unit takes to the marketplace. The same thing protects both sides here: the buyer was told.'),
      bullet('As-is pricing', 'The listing is discounted off the comparable sound-unit price by severity — roughly 10% at D·1 rising to about 55% at D·5 — pre-filled by the platform and editable by the supplier before the listing goes live.'),
      bullet('Claim to the line', 'The priced claim is handed to the supplier of record, who submits it to the shipping line. SteelBox supplies the evidence package — photos captioned by reason, notes, estimate and chain of custody — as one printable document or a signed link that needs no login.'),

      heading('8. The Exclusivity Vision'),
      body('Mutual, and earned by volume. The shared intent: Aarcadian becomes SteelBox’s exclusive supply and sourcing partner — for what Aarcadian manufactures and anything it can source — and SteelBox becomes Aarcadian’s exclusive retail outlet in agreed markets, so Aarcadian’s time shifts from managing one-off container sales to keeping our shared pipeline full and building bigger things. Exclusivity cuts both ways on purpose: SteelBox does not want to be one buyer among many, and Aarcadian should not carry a retail arm it never asked for.'),
      bullet('Defined markets', 'starting with [New Orleans / Gulf South radius], expanding as the network grows.'),
      bullet('Volume triggers', 'exclusivity activates at [___] units/month sustained for [___] months, and holds while volume holds.'),
      bullet('Review cadence', 'quarterly check-ins; either side can raise adjustments as we learn.'),

      heading('9. Thinking Big — Also on the Table'),
      bullet('Damage & claims desk', 'Built out in §7 above. SteelBox inspectors grade every inbound box; damaged units (~10% industry-wide) become documented claims and transparent as-is listings, split 50/50. At volume this stops being a loss-recovery chore and becomes a category we own — nobody else in the region lists damaged stock this openly.'),
      bullet('Growing the transfer station network', 'additional corridor yards (e.g., Lafayette between New Orleans and Houston) as demand data shows where Aarcadian supply should be staged next.'),
      bullet('Custom builds', 'Aarcadian manufacturing behind SteelBox’s custom-build (X-grade) orders.'),
      bullet('Shared data', 'marketplace demand signals flow back to Aarcadian for sourcing and production planning.'),
      bullet('New markets together', 'as SteelBox adds reseller territories, Aarcadian’s supply — and its global sourcing reach — scales with it.'),

      heading('10. Open Questions — To Work Through Together'),
      bullet('Titles', 'who manages container titles, and how — Aarcadian, SteelBox, or a shared process at the point of sale?'),
      bullet('Title format', 'are titles digital, and are they unique per state? What does transfer look like across our multi-state footprint?'),
      bullet('Volume pricing', 'is there a volume discount from Aarcadian to SteelBox as monthly unit counts climb — and if so, at what tiers?'),
      bullet('Estimate split mechanics', 'Is the 50/50 on the amount the line actually pays, or on the estimate value whether it is recovered or not? Who carries the shortfall when a line pays less than the estimate?'),
      bullet('Repair yard and approval', 'Who selects the repair yard, and does either side have approval rights over an estimate above [$___]?'),
      bullet('Radius scope', 'Does the 45-mile free drop-off apply to gate-buys as well as consigned units, and is it measured from the depot or from the nearest Aarcadian yard?'),
      bullet('Platform licence', 'Aarcadian’s use of the SteelBox driver-management and grading software (§6) is a licence, not a favour. Scope, seats, data ownership, support and what happens to Aarcadian’s data if we part ways all belong in the Phase 1 agreement.'),

      heading('11. What This Is — and Is Not'),
      body('This MOU creates no legal obligations, pricing commitments, or exclusivity on either side. It is a shared statement of intent and direction. Either side can walk away at any time, no hard feelings. Binding terms live in the Phase 1 agreement we’ll draft next — a supply and consignment agreement with a platform licence inside it — and only there, until we both choose to climb the ladder.'),

      heading('12. Next Steps'),
      body('Both teams mark up this draft and share internally the week of [8/24]. Working session to compare notes [week of 8/31]. Target: the Phase 1 supply, consignment and platform-licence agreement signed and the first gate-buy placed by [___]. Then we prove it — together. The named deliverables, and what each should take:'),
      bullet('Return the MOU with comments', 'Both teams mark up this draft and send it back. [Week of 8/24 · 1 week.]'),
      bullet('Sign the MOU', 'Working session to compare notes, settle the open questions in §10 in the room, and sign — aligned in spirit, still non-binding. [Week of 8/31 · one session.]'),
      bullet('NDA + IP assignment', 'Mutual NDA and an assignment covering the workflow design work in §7, signed before those sessions start rather than after. [Weeks 1–2 · counsel, both sides.]'),
      bullet('Identify containers for the New Orleans reseller', 'The first unit list for the MVP territory: sizes, grades, wholesale pricing, which depot each unit sits at today, and how many move to the transfer station first. This is the deliverable that turns this document into inventory. [Weeks 2–4 · both teams.]'),
      bullet('Establish the contract docs', 'Counsel drafts the master agreement with Schedule A (supply & consignment), Schedule B (damage, estimates, the 50/50) and Schedule C (platform licence); both sides review; executed. [Weeks 3–8 · counsel-paced, chased weekly.]'),
      bullet('Design the claims workflow together', 'The repair → estimate → shipping-line sessions described in §7. [Weeks 4–6 · joint.]'),
      bullet('First units staged and listed', 'Units at a transfer station, documented, graded and live on the marketplace — the first proof the machine runs end to end. [Weeks 5–6 · SteelBox.]'),

      new Paragraph({
        spacing: { before: 320, after: 100 },
        children: [new TextRun({ text: 'Aligned in spirit (non-binding):', bold: true, size: 20, font: FONT })],
      }),
      SIGNATURES,
    ],
  }],
})

const out = process.argv[2] || 'SteelBox-Aarcadian-MOU-v0.4.docx'
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(out, buf)
  console.log('wrote', out, buf.length, 'bytes')
})
