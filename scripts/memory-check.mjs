import { openTestBrowser, browserIdentities } from './test-browser.mjs'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { arch, cpus, platform, totalmem } from 'node:os'

const cli = fileURLToPath(new URL('../node_modules/.bin/playwright-cli', import.meta.url))
const session = `memory-check-${process.pid}`
const url = process.env.PIANO_TEST_URL || 'http://127.0.0.1:4173'
const heapDiagnostic = process.env.PIANO_HEAP_DIAGNOSTIC === '1'
const reportPath = heapDiagnostic ? 'output/playwright/task603-reload-heap-report.json' : 'output/playwright/task603-staged-memory-report.json'
const phases = heapDiagnostic ? ['blank', 'ui', 'ready', 'reloadReady1', 'reloadReady2', 'reloadReady3', 'reloadReady4', 'reloadReady5'] : ['blank', 'ui', 'ready', 'held24', 'released24', 'burst144', 'idle5s', 'disposed']
mkdirSync('output/playwright', { recursive: true })
function command(...args) {
  const result = spawnSync(cli, [`-s=${session}`, ...args], { encoding: 'utf8', timeout: 60000 })
  if (result.error || result.status !== 0 || result.stdout.includes('### Error')) throw new Error(result.error?.message || result.stdout + result.stderr)
  return result.stdout
}
try {
  await openTestBrowser(command, 'about:blank')
  const template = readFileSync('scripts/browser-memory-stage.js', 'utf8')
  const measurements = []
  for (const phase of phases) {
    const code = template.replace("'__PHASE__'", JSON.stringify(phase)).replace("'__TARGET__'", JSON.stringify(url))
    const result = command('run-code', code)
    const stage = JSON.parse(result.match(/### Result\n([\s\S]*?)\n###/)[1])
    const pids = stage.processInfo.map(p => p.id)
    if (!pids.every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('Invalid owned-browser process IDs')
    const footprint = spawnSync('/usr/bin/footprint', ['--noCategories', '--format', 'bytes', ...pids.map(String)], { encoding: 'utf8', timeout: 20000 })
    const total = footprint.stdout.match(/Summary Footprint: (\d+) B/)?.[1]
    if (footprint.status !== 0 || !total) throw new Error(`Physical footprint unavailable: ${footprint.stderr}`)
    const processes = [...footprint.stdout.matchAll(/([^\n]+) \[(\d+)\]:[^\n]*Footprint: (\d+) B[\s\S]*?phys_footprint_peak: (\d+) B/g)].map(([, name, id, bytes, peak]) => ({ name, id: Number(id), bytes: Number(bytes), peakBytes: Number(peak), type: stage.processInfo.find(p => p.id === Number(id))?.type }))
    const measurement = { ...stage, physicalTotalBytes: Number(total), processes, footprintSummary: footprint.stdout }
    measurements.push(measurement)
    writeFileSync(reportPath, JSON.stringify({ browserIdentities: [...browserIdentities], complete: false, url, measurements, heapPending: heapDiagnostic }, null, 2))
    console.log(JSON.stringify({ phase, physicalMiB: Number(total) / 1048576, rendererMiB: processes.filter(p => p.type === 'renderer').map(p => p.bytes / 1048576), gpuMiB: processes.find(p => p.type === 'GPU')?.bytes / 1048576, jsHeapMiB: stage.jsHeapUsedBytes / 1048576, audio: stage.audio }))
  }
  let heap = null
  if (heapDiagnostic) {
    const result = command('run-code', '--filename', 'scripts/browser-heap-diagnostic.js')
    heap = JSON.parse(result.match(/### Result\n([\s\S]*?)\n###/)[1])
  }
  const git = (...args) => spawnSync('git', args, { encoding: 'utf8' }).stdout.trim()
  const report = { browserIdentities: [...browserIdentities], sourceCommit: git('rev-parse', 'HEAD'), trackedChanges: Boolean(git('status', '--porcelain', '--untracked-files=no')), measurementScripts: ['scripts/memory-check.mjs', 'scripts/browser-memory-stage.js'], complete: true, heap, measuredAt: new Date().toISOString(), host: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model, ramBytes: totalmem() }, url, measurements, scope: 'Same isolated automated Chromium-family browser session; all reported browser processes included. Stage snapshots, process lifetime peaks and baseline overhead are retained without subtracting baseline from the 500 MB requirement.', sourceCounterCaveat: 'Started minus ended event counts can include Tone helper sources or sources from a closed context; this is not a leaked-source claim.', audibleLatencyMs: null, nativeForegroundQualified: false }
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
} finally {
  try { command('close') } catch (error) { console.warn(`Browser cleanup: ${error.message}`) }
}
