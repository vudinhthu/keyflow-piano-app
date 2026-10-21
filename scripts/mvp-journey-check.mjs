import { openTestBrowser, browserIdentities } from './test-browser.mjs'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const cli = fileURLToPath(new URL('../node_modules/.bin/playwright-cli', import.meta.url))
const session = `mvp-journey-${process.pid}`
const profile = `output/playwright/${session}-profile`
const url = process.env.PIANO_TEST_URL || 'http://127.0.0.1:4173'
mkdirSync('output/playwright', { recursive: true })
function command(...args) {
  const result = spawnSync(cli, [`-s=${session}`, ...args], { encoding: 'utf8', timeout: 90000 })
  if (result.error || result.status || result.stdout.includes('### Error')) throw new Error(result.error?.message || result.stdout + result.stderr)
  return result.stdout
}
const parse = result => JSON.parse(result.match(/### Result\n([\s\S]*?)\n###/)[1])
const preparation = readFileSync('scripts/browser-prepare.js', 'utf8').split('  await page.reload()')[0] + `
  await page.addInitScript(() => {
    window.__holdDecoded = false; window.__decodedWaiters = []; window.__nativeDecodedSizes = []
    const decode = AudioContext.prototype.decodeAudioData
    AudioContext.prototype.decodeAudioData = function (...args) {
      const bytes = args[0].byteLength
      return decode.apply(this, args).then(async buffer => {
        window.__nativeDecodedSizes.push(bytes)
        if (window.__holdDecoded) await new Promise(resolve => window.__decodedWaiters.push(resolve))
        return buffer
      })
    }
  })
  return { prepared: true };
}`
const journey = phase => readFileSync('scripts/browser-mvp-journey.js', 'utf8').replace("'__PHASE__'", JSON.stringify(phase)).replace("'__TARGET__'", JSON.stringify(url))
const report = { browserIdentities, passed: false, url, profile, checks: [] }
try {
  await openTestBrowser(command, 'about:blank', '--profile', profile)
  command('run-code', preparation); command('goto', url)
  const online = parse(command('run-code', journey('online')))
  report.checks.push(online)
  const ownArguments = execFileSync('ps', ['-p', String(online.browserPid), '-o', 'args='], { encoding: 'utf8' })
  const browserProfile = ownArguments.match(/--user-data-dir=(.+?)(?: --|$)/)?.[1]
  if (!browserProfile || realpathSync(browserProfile) !== realpathSync(resolve(profile))) throw new Error('Browser did not use the requested owned profile')
  const storageFiles = () => {
    const directory = join(browserProfile, 'Default', 'Local Storage', 'leveldb')
    return readdirSync(directory).map(name => ({ name, bytes: statSync(join(directory, name)).size }))
  }
  // Observe Chrome's own asynchronous disk commit; never write/import a browser profile.
  // This journey qualifies reopening committed settings, not an immediate quit/crash during a pending write.
  const commitStarted = Date.now()
  const record = Buffer.from(online.storedSettingsRecord, 'utf8')
  let committed = false
  while (Date.now() - commitStarted < 15000) {
    const directory = join(browserProfile, 'Default', 'Local Storage', 'leveldb')
    committed = readdirSync(directory).filter(name => /^\d+\.log$/.test(name)).some(name => readFileSync(join(directory, name)).includes(record))
    if (committed) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  report.settingsDiskCommit = { observed: committed, elapsedMs: Date.now() - commitStarted, scope: 'Chrome background commit in the owned disposable profile; immediate-quit/crash durability unqualified' }
  if (!committed) throw new Error('Chrome did not commit the chosen settings to the owned profile within 15 seconds')
  report.storageFilesBeforeClose = storageFiles()
  // Ask Chrome itself to quit and require its protocol acknowledgement before observing PID exit.
  // This avoids stopping the CLI daemon while Chrome is still flushing the persistent profile.
  const shutdown = parse(command('run-code', `async page => {
    const browser = await page.context().browser().newBrowserCDPSession()
    await browser.send('Browser.close')
    return { gracefulBrowserCloseRequested: true }
  }`))
  if (!shutdown.gracefulBrowserCloseRequested) throw new Error('Chrome did not acknowledge graceful shutdown')
  report.browserShutdown = { method: 'CDP Browser.close', ...shutdown }
  let exited = false
  for (let i = 0; i < 150; i++) {
    try { process.kill(online.browserPid, 0) } catch (error) { if (error.code === 'ESRCH') { exited = true; break }; throw error }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!exited) throw new Error('Owned initial browser process did not exit')
  report.browserProcessExited = true; report.originalOwnedBrowserPid = online.browserPid
  report.storageFilesAfterClose = storageFiles()
  await openTestBrowser(command, 'about:blank', '--profile', profile)
  command('run-code', preparation)
  const offline = parse(command('run-code', journey('offline')))
  if (offline.cacheVersion !== online.cacheVersion || offline.buildId !== online.buildId) throw new Error('Reopened cached build did not match the verified original')
  report.checks.push(offline); report.passed = true
  report.scope = 'Real owned Chrome process exit and persistent-profile offline navigation; native installation, foreground focus and device listening remain unqualified. Decoder return is gated only to make the loading UI observable; original native decoding still executes.'
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.error = error.message
  try {
    report.failureState = parse(command('run-code', `async page => {
      await page.screenshot({ path: 'output/playwright/task602-journey-failure.png', fullPage: true })
      return page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration()
        let cache
        if (registration?.active) {
          const channel = new MessageChannel()
          cache = await new Promise(resolve => {
            const timer = setTimeout(() => { channel.port1.close(); resolve({ error: 'probe-timeout' }) }, 3000)
            channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data) }
            registration.active.postMessage({ type: 'VERIFY_CACHE' }, [channel.port2])
          })
        }
        return { url: location.href, online: navigator.onLine, audio: document.querySelector('.audio-state')?.textContent, offline: document.querySelector('.offline-panel')?.textContent, enabledKeys: document.querySelectorAll('button[data-note]:not(:disabled)').length, storedSettings: localStorage.getItem('keyflow-piano:settings'), cache }
      })
    }`))
  } catch (probeError) { report.probeError = probeError.message }
  throw error
}
finally {
  writeFileSync('output/playwright/task602-mvp-journey-report.json', JSON.stringify(report, null, 2))
  try { command('close') } catch (error) { console.warn(error.message) }
}
