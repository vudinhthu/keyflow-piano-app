import { openTestBrowser, browserIdentities } from './test-browser.mjs'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../node_modules/.bin/playwright-cli', import.meta.url))
const dist = resolve('dist')
const originalWorker = readFileSync(resolve(dist, 'sw.js'), 'utf8')
const originalIndex = readFileSync(resolve(dist, 'index.html'), 'utf8')
const marker = originalWorker.indexOf('[{"integrity":"sha256-')
if (marker < 0) throw new Error('Cannot locate injected fixture manifest')
let depth = 0, end = marker
for (; end < originalWorker.length; end++) { if (originalWorker[end] === '[') depth++; if (originalWorker[end] === ']' && --depth === 0) { end++; break } }
const injected = originalWorker.slice(marker, end)
const version2Index = originalIndex.replace('</head>', '<meta name="cache-test-version" content="2"></head>')
const version2Entries = JSON.parse(injected).map(entry => entry.url === 'index.html' ? { ...entry, revision: createHash('md5').update(version2Index).digest('hex'), integrity: `sha256-${createHash('sha256').update(version2Index).digest('base64')}` } : entry)
const version2Worker = originalWorker.replace(injected, JSON.stringify(version2Entries))
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain' }
mkdirSync('output/playwright', { recursive: true })
function command(session, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, [`-s=${session}`, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('Browser command timed out')) }, 60000)
    child.stdout.on('data', chunk => { stdout += chunk }); child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => { clearTimeout(timer); if (code || stdout.includes('### Error')) reject(new Error(stdout + stderr)); else resolve(stdout) })
  })
}
const cases = [{ name: 'same-size-sri-failure', corrupt: true, quota: false, mode: 'initial-failure' }, { name: 'quota-failure', corrupt: false, quota: true, mode: 'initial-failure' }, { name: 'version-update', corrupt: false, quota: false, mode: 'update' }]
const reports = []
for (const test of cases) {
  const state = { version: 1, corrupt: test.corrupt, quota: test.quota }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    response.setHeader('Cache-Control', 'no-store')
    if (url.pathname === '/__test/control' && request.method === 'POST') {
      let body = ''; for await (const chunk of request) body += chunk
      Object.assign(state, JSON.parse(body)); response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(state)); return
    }
    try {
      const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1))
      const path = resolve(dist, name)
      if (!path.startsWith(dist + sep)) { response.statusCode = 403; response.end(); return }
      let body = readFileSync(path)
      if (name === 'index.html' && state.version === 2) body = Buffer.from(version2Index)
      if (name === 'sw.js') {
        let worker = state.version === 2 ? version2Worker : originalWorker
        if (state.quota) worker = 'Cache.prototype.put = () => Promise.reject(new DOMException("Test quota", "QuotaExceededError"));\n' + worker
        body = Buffer.from(worker)
      }
      if (state.corrupt && name === 'samples/salamander/C3.mp3') { body = Buffer.from(body); body[100] ^= 1 }
      response.setHeader('Content-Type', mime[extname(name)] || 'application/octet-stream')
      response.end(body)
    } catch { response.statusCode = 404; response.end('Not found') }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/`
  const session = `cache-atomic-${process.pid}-${test.name}`
  try {
    await openTestBrowser((...args) => command(session, ...args), url)
    const code = readFileSync('scripts/browser-cache-atomic.js', 'utf8').replace("'__MODE__'", JSON.stringify(test.mode))
    const result = await command(session, 'run-code', code)
    const report = { browserIdentities: [...browserIdentities], name: test.name, ...JSON.parse(result.match(/### Result\n([\s\S]*?)\n###/)[1]), url }
    reports.push(report); console.log(JSON.stringify(report))
  } finally {
    try { await command(session, 'close') } catch (error) { console.warn(error.message) }
    await new Promise(resolve => server.close(resolve))
  }
}
writeFileSync('output/playwright/task501-cache-atomic-report.json', JSON.stringify({ browserIdentities: [...browserIdentities], passed: true, cases: reports, fixtureScope: 'Copies of production dist bytes served by isolated localhost HTTP server. Source samples remain unmodified. Version 2 changes only index shell and corresponding embedded revision/SRI; quota/corruption are disposable test fault injection.' }, null, 2))
