import { testBrowser } from './test-browser.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { once } from 'node:events'

mkdirSync('output/playwright', { recursive: true })
const output = 'output/playwright/task602-mvp-suite-report.json'
const stages = [
  { name: 'online-controls', script: 'browser-check.mjs', report: 'phase2-browser-report.json' },
  { name: 'settings-and-storage-faults', script: 'settings-check.mjs', report: 'task503-settings-browser-report.json' },
  { name: 'manifest-and-install-ui', script: 'pwa-check.mjs', report: 'task003-pwa-browser-report.json' },
  { name: 'process-exit-offline-controls-and-recovery', script: 'mvp-journey-check.mjs', report: 'task602-mvp-journey-report.json' },
  { name: 'offline-endpoints-and-integrity', script: 'offline-check.mjs', report: 'task501-offline-browser-report.json' },
  { name: 'atomic-cache-install-and-versions', script: 'cache-atomic-check.mjs', report: 'task501-cache-atomic-report.json' },
  { name: 'two-build-safe-update-ui', script: 'offline-ui-check.mjs', report: 'task502-offline-ui-report.json' },
  { name: 'pwa-mobile-download-scroll-and-pull-refresh', script: 'pwa-mobile-check.mjs', report: 'task504-pwa-mobile-report.json' },
]
const git = (...args) => spawnSync('git', args, { encoding: 'utf8' }).stdout.trim()
const report = { requestedBrowser: testBrowser, browserIdentities: [], passed: false, startedAt: new Date().toISOString(), sourceCommit: git('rev-parse', 'HEAD'), trackedChanges: Boolean(git('status', '--porcelain', '--untracked-files=no')), node: process.version, platform: process.platform, stages: [], acceptance: { automatedChrome: testBrowser === 'chrome' ? 'running' : 'not run; see requestedBrowser', automatedBrowser: 'running', deviceListening: 'pending', nativeInstallAndSupportedBrowserQualification: 'pending', externallyMeasuredLatencyFpsAndMemory: 'pending' } }
const persist = () => writeFileSync(output, JSON.stringify(report, null, 2))
persist()
function run(command, args, env = process.env, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.stdout.on('data', chunk => process.stdout.write(chunk)); child.stderr.on('data', chunk => process.stderr.write(chunk))
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', (code, signal) => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`${command} ${args.join(' ')} failed (${signal || code})`)) })
  })
}
let preview
try {
  await run('corepack', ['pnpm', 'build'])
  const probe = createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve))
  const url = `http://127.0.0.1:${port}/`
  let previewLog = ''
  preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] })
  preview.stdout.on('data', chunk => { previewLog += chunk }); preview.stderr.on('data', chunk => { previewLog += chunk })
  preview.on('error', error => { previewLog += error.message })
  let available = false
  for (let attempt = 0; attempt < 50; attempt++) {
    if (preview.exitCode !== null || preview.signalCode !== null) throw new Error(`Owned preview exited: ${previewLog}`)
    try { if ((await fetch(url)).ok) { available = true; break } } catch { /* Wait for this owned preview only. */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!available) throw new Error(`Owned preview did not become ready: ${previewLog}`)
  report.url = url
  for (const stage of stages) {
    const path = `output/playwright/${stage.report}`
    rmSync(path, { force: true }) // A previous successful report cannot satisfy this run.
    const start = Date.now()
    console.log(`\n[MVP E2E] ${stage.name}`)
    await run(process.execPath, [`scripts/${stage.script}`], { ...process.env, PIANO_TEST_URL: url })
    const evidence = JSON.parse(readFileSync(path, 'utf8'))
    if (evidence.passed !== true) throw new Error(`${stage.name} did not provide passing current evidence`)
    const expectedProduct = testBrowser === 'msedge' ? 'Edg/' : 'Chrome/'
    if (!evidence.browserIdentities?.length || evidence.browserIdentities.some(identity => identity.requestedBrowser !== testBrowser || !identity.product.startsWith(expectedProduct))) throw new Error(`${stage.name} lacks requested-browser identity evidence`)
    report.browserIdentities.push(...evidence.browserIdentities)

    report.stages.push({ name: stage.name, passed: true, durationMs: Date.now() - start, report: path })
    persist()
  }
  report.passed = true; report.acceptance.automatedChrome = testBrowser === 'chrome' ? 'passed' : 'not run; see requestedBrowser'
  report.acceptance.automatedBrowser = 'passed'
  console.log(`\n[MVP E2E] All ${stages.length} automated ${testBrowser} stages passed. Device listening/native/performance acceptance remain pending.`)
} catch (error) {
  report.error = error.message; report.acceptance.automatedChrome = testBrowser === 'chrome' ? 'failed' : 'not run; see requestedBrowser'
  report.acceptance.automatedBrowser = 'failed'; process.exitCode = 1
  console.error(error)
} finally {
  if (preview && preview.exitCode === null && preview.signalCode === null) {
    preview.kill('SIGTERM')
    await Promise.race([once(preview, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))])
    if (preview.exitCode === null && preview.signalCode === null) preview.kill('SIGKILL')
  }
  report.finishedAt = new Date().toISOString(); persist()
}
