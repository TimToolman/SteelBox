// Runs every sweep against the built demo and totals the result.
//
//   cd apps/web
//   VITE_DEMO_STATIC=1 npm run build
//   node e2e/serve-dist.mjs &
//   node e2e/run-all.mjs
//
// PLAYWRIGHT_LIB / PW_CHROMIUM are only needed when Playwright isn't on the
// module path (they are preset in Claude's remote environment).

import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'

const dir = new URL('.', import.meta.url).pathname
const sweeps = readdirSync(dir).filter(f => f.startsWith('smoke-') && f.endsWith('.mjs')).sort()

let pass = 0, fail = 0, broke = []
for (const file of sweeps) {
  const out = await new Promise(resolve => {
    let buf = ''
    const p = spawn(process.execPath, [dir + file], { env: process.env })
    p.stdout.on('data', d => { buf += d })
    p.stderr.on('data', d => { buf += d })
    p.on('close', code => resolve({ buf, code }))
  })
  const m = /(\d+) passed, (\d+) failed/.exec(out.buf)
  const name = file.replace(/\.mjs$/, '').padEnd(20)
  if (m) {
    pass += Number(m[1]); fail += Number(m[2])
    console.log(`${name} ${m[1]} passed, ${m[2]} failed`)
    if (Number(m[2]) > 0) console.log(out.buf.split('\n').filter(l => l.includes('✗')).join('\n'))
  } else {
    broke.push(file)
    console.log(`${name} DID NOT COMPLETE`)
    console.log(out.buf.split('\n').slice(-12).join('\n'))
  }
}

console.log(`\n── ${sweeps.length} sweeps · ${pass} passed, ${fail} failed${broke.length ? `, ${broke.length} crashed` : ''} ──`)
process.exit(fail || broke.length ? 1 : 0)
