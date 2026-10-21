import { openTestBrowser, browserIdentities } from './test-browser.mjs'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { arch, cpus, platform, release, totalmem } from 'node:os'

const cli = fileURLToPath(new URL('../node_modules/.bin/playwright-cli', import.meta.url))
const session = `performance-check-${process.pid}`
const url = process.env.PIANO_TEST_URL || 'http://127.0.0.1:4173'
mkdirSync('output/playwright', { recursive: true })
function command(...args) {
  const result = spawnSync(cli, [`-s=${session}`, ...args], { encoding: 'utf8', timeout: 60000 })
  if (result.error || result.status !== 0 || result.stdout.includes('### Error')) throw new Error(result.error?.message || result.stdout + result.stderr)
  return result.stdout
}
try {
  await openTestBrowser(command, 'about:blank')
  const template = readFileSync('scripts/browser-performance.js', 'utf8')
  const result = command('run-code', template.replace("'__TARGET__'", JSON.stringify(url)))
  const measured = JSON.parse(result.match(/### Result\n([\s\S]*?)\n###/)[1])
  const pids = measured.processInfo.map(p => p.id)
  if (!pids.every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('Invalid Chrome process IDs')
  const rss = spawnSync('ps', ['-o', 'pid=,rss=', '-p', pids.join(',')], { encoding: 'utf8' })
  if (rss.status !== 0) throw new Error('Could not measure isolated Chrome process memory')
  const processes = rss.stdout.trim().split('\n').map(line => { const [id, rssKiB] = line.trim().split(/\s+/).map(Number); return { id, rssKiB, type: measured.processInfo.find(p => p.id === id)?.type } })
  const footprint = platform() === 'darwin' ? spawnSync('/usr/bin/footprint', ['--noCategories', '--format', 'bytes', ...pids.map(String)], { encoding: 'utf8', timeout: 20000 }) : null
  const totalPhysicalBytes = footprint?.stdout.match(/Summary Footprint: (\d+) B/)?.[1]
  const physicalFootprint = footprint ? { exitCode: footprint.status, totalBytes: totalPhysicalBytes ? Number(totalPhysicalBytes) : null, summary: footprint.stdout, error: footprint.error?.message || footprint.stderr } : { unavailable: 'macOS footprint command only' }
  const git = (...args) => spawnSync('git', args, { encoding: 'utf8' }).stdout.trim()
  const report = { browserIdentities: [...browserIdentities], sourceCommit: git('rev-parse', 'HEAD'), trackedChanges: Boolean(git('status', '--porcelain', '--untracked-files=no')), measurementScripts: ['scripts/performance-check.mjs', 'scripts/browser-performance.js'], physicalFootprint, ...measured, measuredAt: new Date().toISOString(), url, host: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, ramBytes: totalmem() }, memory: { processes, summedRssMiB: processes.reduce((sum, p) => sum + p.rssKiB, 0) / 1024, scope: 'one isolated automated Chromium-family browser and reported children; RSS sum may double-count shared pages; snapshot after active playback, not peak memory' }, requirementStatus: { audibleLatency: 'unmeasured; requires external wired-audio experiment', nativeScreenFps: 'unqualified; headless frame cadence only', memory: totalPhysicalBytes ? (Number(totalPhysicalBytes) < 500000000 ? 'physical snapshot below 500 MB; peak/native foreground qualification still required' : 'physical snapshot exceeds 500 MB; target unmet in this automated browser baseline') : 'unqualified: physical footprint unavailable; RSS includes shared pages', publicColdLoad: url.startsWith('http://127.0.0.1') ? 'unqualified: local preview only' : 'measured on public HTTPS under declared CDP conditions' } }
  writeFileSync('output/playwright/task603-performance-report.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ host: report.host, load: report.samples.map(({ trial, cache, uiVisibleMs, audioReadyAfterGestureMs, jsHeapUsedBytes }) => ({ trial, cache, uiVisibleMs, audioReadyAfterGestureMs, jsHeapUsedBytes })), frames: report.frames, rssMiB: report.memory.summedRssMiB, physicalFootprint: report.physicalFootprint, runtimeErrors: report.runtimeErrors, requirementStatus: report.requirementStatus }, null, 2))
} finally {
  try { command('close') } catch (error) { console.warn(`Browser cleanup: ${error.message}`) }
}
