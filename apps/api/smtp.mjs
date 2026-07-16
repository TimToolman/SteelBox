// ============================================================
// Minimal SMTP sender — zero-dependency, built for Gmail SMTP
// (smtp.gmail.com:465, implicit TLS, AUTH LOGIN with an app
// password). Configure via env:
//   SMTP_USER  Gmail address to authenticate as
//   SMTP_PASS  Gmail app password (myaccount.google.com/apppasswords)
//   MAIL_FROM  optional From header (defaults to SMTP_USER)
//   SMTP_HOST / SMTP_PORT  optional overrides for other providers
// When SMTP_USER/PASS are unset, sendEmail rejects and callers fall
// back to log-only mode (outbox.csv), keeping local dev working.
// ============================================================

import { connect } from 'node:tls'

const HOST = process.env.SMTP_HOST || 'smtp.gmail.com'
const PORT = Number(process.env.SMTP_PORT || 465)
const USER = process.env.SMTP_USER || ''
const PASS = process.env.SMTP_PASS || ''
const FROM = process.env.MAIL_FROM || USER
const FROM_NAME = process.env.MAIL_FROM_NAME || 'MVP Container'

export function smtpConfigured() {
  return Boolean(USER && PASS)
}

// RFC 2047 encode a header word if it contains non-ASCII.
function headerWord(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}

// Send one plain-text email. `to` is a string or array of addresses.
// Resolves on the server's 250 after DATA; rejects on any error/timeout.
export function sendEmail({ to, subject, text }) {
  const recipients = (Array.isArray(to) ? to : [to]).map(a => String(a).trim()).filter(Boolean)
  return new Promise((resolve, reject) => {
    if (!smtpConfigured()) return reject(new Error('SMTP not configured (set SMTP_USER + SMTP_PASS)'))
    if (!recipients.length) return reject(new Error('No recipients'))

    const message = [
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

    // Conversation script: [expected status code, line to send next].
    const script = [
      [220, `EHLO mvpcontainer.local`],
      [250, `AUTH LOGIN`],
      [334, Buffer.from(USER).toString('base64')],
      [334, Buffer.from(PASS).toString('base64')],
      [235, `MAIL FROM:<${FROM}>`],
      ...recipients.map((r, i) => [250, `RCPT TO:<${r}>`]),
      [250, `DATA`],
      [354, `${message}\r\n.`],
      [250, `QUIT`],
    ]

    const socket = connect(PORT, HOST, { servername: HOST })
    socket.setEncoding('utf8')
    socket.setTimeout(20000)
    let step = 0
    let buffer = ''
    let settled = false

    const fail = (err) => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(err instanceof Error ? err : new Error(String(err)))
    }
    socket.on('error', fail)
    socket.on('timeout', () => fail(new Error('SMTP timeout')))

    socket.on('data', (chunk) => {
      buffer += chunk
      // Responses end with "<code><space>...\r\n"; "<code>-" lines continue.
      let m
      while ((m = buffer.match(/^(\d{3})([ -])[^\r\n]*\r\n/))) {
        const [line, code, sep] = m
        buffer = buffer.slice(line.length)
        if (sep === '-') continue // multi-line response, keep reading
        if (step >= script.length) return
        const [expect, send] = script[step]
        if (Number(code) !== expect) {
          return fail(new Error(`SMTP step ${step} expected ${expect}, got: ${line.trim().slice(0, 200)}`))
        }
        step++
        socket.write(send + '\r\n')
        // The DATA payload was accepted (its 250 triggered this QUIT) — the
        // mail is sent; QUIT's 221 reply is a courtesy we don't wait for.
        if (send === 'QUIT' && !settled) { settled = true; socket.end(); resolve() }
      }
    })
  })
}
