import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm' }
createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/SteelBox/, '') || '/'
  let f = join(DIST, p)
  if (p.endsWith('/')) f = join(f, 'index.html')
  if (!existsSync(f)) f = join(DIST, 'app.html') // SPA fallback like Pages' 404.html
  try { var buf = readFileSync(f) } catch { res.statusCode = 404; return res.end() }
  res.setHeader('Content-Type', MIME[extname(f)] || 'application/octet-stream')
  res.end(buf)
}).listen(4890, () => console.log('serving'))
