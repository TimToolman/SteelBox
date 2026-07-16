// ============================================================
// Minimal SMTP sender — zero-dependency, built for Gmail SMTP.
// Speaks both submission flavors:
//   port 587 (default): plain TCP → STARTTLS upgrade → AUTH
//   port 465:           implicit TLS from the first byte
// Configure via env:
//   SMTP_USER  Gmail address to authenticate as
//   SMTP_PASS  Gmail app password (myaccount.google.com/apppasswords)
//   SMTP_PORT  587 (default) or 465; SMTP_HOST for other providers
//   MAIL_FROM / MAIL_FROM_NAME  optional From header parts
// When SMTP_USER/PASS are unset, sendEmail rejects and callers fall
// back to log-only mode (outbox.csv), keeping local dev working.
// ============================================================

import { connect as tlsConnect } from 'node:tls'
import { connect as netConnect } from 'node:net'

const HOST = process.env.SMTP_HOST || 'smtp.gmail.com'
const PORT = Number(process.env.SMTP_PORT || 587)
const USER = process.env.SMTP_USER || ''
const PASS = process.env.SMTP_PASS || ''
const FROM = process.env.MAIL_FROM || USER
const FROM_NAME = process.env.MAIL_FROM_NAME || 'MVP Container'
const TIMEOUT_MS = 25000

export function smtpConfigured() {
  return Boolean(USER && PASS)
}

// RFC 2047 encode a header word if it contains non-ASCII.
function headerWord(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}

function buildMessage(recipients, subject, text) {
  return [
    `From: ${headerWord(FROM_NAME)} <${FROM}>`,
    `To: ${recipients.join(', ')}`,
    `Subject: ${headerWord(subject || '')}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@mvpcontainer>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    String(text || ''),
  ].join('\r\n')
    .replace(/\r?\n/g, '\r\n')
    .replace(/\r\n\./g, '\r\n..') // dot-stuffing
}

// Sequential command/response driver over a socket that can be swapped
// mid-session (the STARTTLS upgrade replaces the plain socket with a TLS one).
function makeIO(onFatal) {
  let socket = null
  let buffer = ''
  let waiter = null

  const onData = (chunk) => {
    buffer += chunk
    // A reply is complete at the first "NNN<space>…" line (NNN- lines continue).
    const lines = buffer.split('\r\n')
    for (let i = 0; i < lines.length - 1; i++) {
      const m = /^(\d{3})([ -])/.exec(lines[i])
      if (m && m[2] === ' ') {
        // Strictly sequential protocol — nothing pipelined follows the reply.
        const reply = { code: Number(m[1]), line: lines[i] }
        buffer = ''
        const w = waiter
        waiter = null
        w?.resolve(reply)
        return
      }
    }
  }

  return {
    attach(s) {
      if (socket) { socket.removeAllListeners('data'); socket.removeAllListeners('error'); socket.removeAllListeners('timeout') }
      socket = s
      socket.setEncoding('utf8')
      socket.setTimeout(TIMEOUT_MS, () => onFatal(new Error('SMTP timeout')))
      socket.on('data', onData)
      socket.on('error', err => onFatal(err))
    },
    raw() { return socket },
    write(s) { socket.write(s) },
    expect(code, label) {
      return new Promise((resolve, reject) => {
        waiter = { resolve, reject }
        // onFatal settles the outer promise; this also unblocks the await.
        waiter.fail = reject
      }).then(reply => {
        if (reply.code !== code) throw new Error(`SMTP ${label || ''} expected ${code}, got: ${reply.line.slice(0, 200)}`)
        return reply
      })
    },
    async cmd(send, code, label) {
      socket.write(send + '\r\n')
      return this.expect(code, label)
    },
    failWaiter(err) { const w = waiter; waiter = null; w?.reject(err) },
  }
}

// Send one plain-text email. `to` is a string or array of addresses.
export function sendEmail({ to, subject, text }) {
  const recipients = (Array.isArray(to) ? to : [to]).map(a => String(a).trim()).filter(Boolean)
  return new Promise((resolve, reject) => {
    if (!smtpConfigured()) return reject(new Error('SMTP not configured (set SMTP_USER + SMTP_PASS)'))
    if (!recipients.length) return reject(new Error('No recipients'))

    let settled = false
    let io
    const fail = (err) => {
      if (settled) return
      settled = true
      try { io?.raw()?.destroy() } catch { /* already gone */ }
      io?.failWaiter(err)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
    const done = () => {
      if (settled) return
      settled = true
      try { io?.raw()?.end() } catch { /* already gone */ }
      resolve()
    }

    io = makeIO(fail)
    const implicitTls = PORT === 465
    const first = implicitTls
      ? tlsConnect(PORT, HOST, { servername: HOST })
      : netConnect(PORT, HOST)
    io.attach(first)

    ;(async () => {
      await io.expect(220, 'greeting')
      await io.cmd('EHLO mvpcontainer.local', 250, 'EHLO')
      if (!implicitTls) {
        // Upgrade the plain connection before any credentials move.
        await io.cmd('STARTTLS', 220, 'STARTTLS')
        const secured = tlsConnect({ socket: io.raw(), servername: HOST })
        await new Promise((res, rej) => {
          secured.once('secureConnect', res)
          secured.once('error', rej)
        })
        io.attach(secured)
        await io.cmd('EHLO mvpcontainer.local', 250, 'EHLO(TLS)')
      }
      await io.cmd('AUTH LOGIN', 334, 'AUTH')
      await io.cmd(Buffer.from(USER).toString('base64'), 334, 'username')
      await io.cmd(Buffer.from(PASS).toString('base64'), 235, 'password')
      await io.cmd(`MAIL FROM:<${FROM}>`, 250, 'MAIL FROM')
      for (const r of recipients) await io.cmd(`RCPT TO:<${r}>`, 250, `RCPT ${r}`)
      await io.cmd('DATA', 354, 'DATA')
      await io.cmd(`${buildMessage(recipients, subject, text)}\r\n.`, 250, 'message body')
      // Mail accepted — QUIT is a courtesy; don't wait for its 221.
      io.write('QUIT\r\n')
      done()
    })().catch(fail)
  })
}
