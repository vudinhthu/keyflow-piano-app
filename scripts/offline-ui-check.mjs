import { openTestBrowser, browserIdentities } from './test-browser.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { cpSync, readFileSync, mkdirSync, writeFileSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, resolve, sep, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../node_modules/.bin/playwright-cli', import.meta.url))
const fixture = mkdtempSync(join(tmpdir(), 'keyflow-update-'))
for (const name of ['src', 'public', 'scripts', 'index.html', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'tsconfig.json']) cpSync(name, join(fixture, name), { recursive: true })
symlinkSync(resolve('node_modules'), join(fixture, 'node_modules'))
const index = join(fixture, 'index.html')
writeFileSync(index, readFileSync(index, 'utf8').replace('</head>', '<meta name="ui-test-version" content="2"></head>'))
const built = spawnSync('corepack', ['pnpm', 'build'], { cwd: fixture, encoding: 'utf8' })
if (built.status !== 0) throw new Error(built.stdout + built.stderr)
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain' }
mkdirSync('output/playwright', { recursive: true })
function command(session, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, [`-s=${session}`, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('Browser command timed out')) }, 60000)
    child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
    child.on('error', reject)
    child.on('close', code => { clearTimeout(timer); if (code || output.includes('### Error')) reject(new Error(output)); else resolve(output) })
  })
}
const reports = []
try {
  for (const mode of ['integrity', 'quota', 'update']) {
    const state = { version: 1, corrupt: mode === 'integrity', quota: mode === 'quota' }
    const server = createServer(async (request, response) => {
      const url = new URL(request.url, 'http://localhost')
      response.setHeader('Cache-Control', 'no-store')
      if (url.pathname === '/__test/control' && request.method === 'POST') {
        let body = ''; for await (const chunk of request) body += chunk
        Object.assign(state, JSON.parse(body)); response.end(JSON.stringify(state)); return
      }
      try {
        const dist = state.version === 2 ? join(fixture, 'dist') : resolve('dist')
        const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1))
        const path = resolve(dist, name)
        if (!path.startsWith(dist + sep)) { response.statusCode = 403; response.end(); return }
        let body = readFileSync(path)
        if (name === 'sw.js' && state.quota) body = Buffer.from('Cache.prototype.put = () => Promise.reject(new DOMException("Test quota", "QuotaExceededError"));\n' + body)
        if (state.corrupt && name === 'samples/salamander/C3.mp3') { body = Buffer.from(body); body[100] ^= 1 }
        response.setHeader('Content-Type', mime[extname(name)] || 'application/octet-stream'); response.end(body)
      } catch { response.statusCode = 404; response.end('Not found') }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const session = `offline-ui-${process.pid}-${mode}`
    try {
      await openTestBrowser((...args) => command(session, ...args), `http://127.0.0.1:${server.address().port}/`)
      const code = readFileSync('scripts/browser-offline-ui.js', 'utf8').replace("'__MODE__'", JSON.stringify(mode))
      const output = await command(session, 'run-code', code)
      const report = { browserIdentities: [...browserIdentities], mode, ...JSON.parse(output.match(/### Result\n([\s\S]*?)\n###/)[1]) }
      reports.push(report); console.log(JSON.stringify(report))
    } finally {
      try { await command(session, 'close') } catch (error) { console.warn(error.message) }
      await new Promise(resolve => server.close(resolve))
    }
  }
  writeFileSync('output/playwright/task502-offline-ui-report.json', JSON.stringify({ browserIdentities: [...browserIdentities], passed: true, cases: reports, fixtureScope: 'Two actual source builds with matching client/worker identities; disposable localhost SRI/quota injection. No source samples modified.' }, null, 2))
} finally { rmSync(fixture, { recursive: true, force: true }) }
