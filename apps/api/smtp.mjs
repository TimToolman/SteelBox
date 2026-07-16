// ============================================================
// Minimal email sender — zero-dependency, two transports:
//
//   1. SendGrid HTTP API (preferred when SENDGRID_API_KEY is set).
//      Plain HTTPS, so it works on hosts that block outbound SMTP
//      (Railway does). Free tier + Single Sender Verification needs
//      no DNS setup. The From address must be the verified sender.
//   2. SMTP (Gmail-style) via SMTP_USER + SMTP_PASS (app password).
//      Port 587 STARTTLS by default, implicit TLS via SMTP_PORT=465.
//
// Env: SENDGRID_API_KEY | SMTP_USER/SMTP_PASS/SMTP_HOST/SMTP_PORT,
// plus MAIL_FROM / MAIL_FROM_NAME (From defaults to SMTP_USER).
// With neither transport configured, sendEmail rejects and callers
// fall back to log-only mode (outbox.csv), keeping local dev working.
// ============================================================

import { connect as tlsConnect } from 'node:tls'
import { connect as netConnect } from 'node:net'

const SENDGRID_KEY = process.env.SENDGRID_API_KEY || ''
const HOST = process.env.SMTP_HOST || 'smtp.gmail.com'
const PORT = Number(process.env.SMTP_PORT || 587)
const USER = process.env.SMTP_USER || ''
const PASS = process.env.SMTP_PASS || ''
const FROM = process.env.MAIL_FROM || USER
const FROM_NAME = process.env.MAIL_FROM_NAME || 'MVP Container'
const TIMEOUT_MS = 25000

export function smtpConfigured() {
  return Boolean(SENDGRID_KEY || (USER && PASS))
}

// ── Transport 1: SendGrid HTTP API ─────────────────────────

async function sendViaSendgrid(recipients, subject, text) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${SENDGRID_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: recipients.map(email => ({ email })) }],
        from: { email: FROM, name: FROM_NAME },
        subject: subject || '',
        content: [{ type: 'text/plain', value: String(text || ' ') }],
      }),
    })
    if (res.status !== 202) {
      const detail = await res.text().catch(() => '')
      throw new Error(`SendGrid ${res.status}: ${detail.slice(0, 200)}`)
    }
  } catch (e) {
    throw e.name === 'AbortError' ? new Error('SendGrid timeout') : e
  } finally {
    clearTimeout(timer)
  }
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
// Routes to SendGrid (HTTPS) when a key is set, else the SMTP transport.
export function sendEmail({ to, subject, text }) {
  const recipients = (Array.isArray(to) ? to : [to]).map(a => String(a).trim()).filter(Boolean)
  if (!recipients.length) return Promise.reject(new Error('No recipients'))
  if (SENDGRID_KEY) return sendViaSendgrid(recipients, subject, text)
  return new Promise((resolve, reject) => {
    if (!smtpConfigured()) return reject(new Error('Email not configured (set SENDGRID_API_KEY, or SMTP_USER + SMTP_PASS)'))

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
