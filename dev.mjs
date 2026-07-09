#!/usr/bin/env node
// ============================================================
// MVP Container dev launcher — starts the CSV API and the web app
// together with prefixed output. Zero dependencies.
//   node dev.mjs   (or: npm run dev)
// ============================================================

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))

const services = [
  { name: 'api', color: '\x1b[36m', cmd: 'node', args: ['server.mjs'], cwd: join(root, 'apps', 'api') },
  { name: 'web', color: '\x1b[35m', cmd: 'npm', args: ['run', 'dev'], cwd: join(root, 'apps', 'web') },
]
const reset = '\x1b[0m'

const children = []
let shuttingDown = false

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exit(code)
}

for (const svc of services) {
  const child = spawn(svc.cmd, svc.args, { cwd: svc.cwd, shell: process.platform === 'win32' })
  children.push(child)

  const tag = `${svc.color}[${svc.name}]${reset} `
  const prefix = (stream, write) => {
    let buffer = ''
    stream.on('data', chunk => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) write(`${tag}${line}\n`)
    })
  }
  prefix(child.stdout, s => process.stdout.write(s))
  prefix(child.stderr, s => process.stderr.write(s))

  child.on('exit', code => {
    if (!shuttingDown) {
      process.stdout.write(`${tag}exited with code ${code}. Shutting down.\n`)
      shutdown(code ?? 0)
    }
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('MVP Container dev: api → http://localhost:4000  ·  web → http://localhost:3000')
console.log('Press Ctrl+C to stop both.\n')
