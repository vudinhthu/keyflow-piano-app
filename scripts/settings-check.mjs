import { openTestBrowser, browserIdentities } from './test-browser.mjs'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../node_modules/.bin/playwright-cli', import.meta.url))
const session = `settings-check-${process.pid}`
const url = process.env.PIANO_TEST_URL || 'http://127.0.0.1:5173'
mkdirSync('output/playwright', { recursive: true })
function command(...args) {
  const result = spawnSync(cli, [`-s=${session}`, ...args], { encoding: 'utf8', timeout: 60000 })
  if (result.error || result.status !== 0 || result.stdout.includes('### Error')) throw new Error(result.error?.message || result.stdout + result.stderr)
  return result.stdout
}
try {
  await openTestBrowser(command, url)
  command('run-code', '--filename', 'scripts/browser-prepare.js')
  const result = command('run-code', '--filename', 'scripts/browser-settings.js')
  const report = { browserIdentities: [...browserIdentities], ...JSON.parse(result.match(/### Result\n([\s\S]*?)\n###/)[1]), url }
  writeFileSync('output/playwright/task503-settings-browser-report.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  const report = { browserIdentities: [...browserIdentities], passed: false, url, error: error.message }
  try {
    const result = command('run-code', `async page => {
      await page.screenshot({ path: 'output/playwright/task503-settings-failure.png', fullPage: true })
      return page.evaluate(() => ({
        audio: document.querySelector('.audio-state')?.textContent,
        held: [...document.querySelectorAll('button[data-note][aria-pressed=true]')].map(key => key.dataset.note),
        settings: localStorage.getItem('keyflow-piano:settings'),
        errors: window.__pianoAudio?.errors,
        sources: window.__pianoAudio?.sources,
        sourceConnections: window.__pianoAudio?.connections.filter(({ source }) => source instanceof AudioBufferSourceNode).map(({ source, destination }) => ({ context: source.context.state, gain: destination instanceof GainNode ? destination.gain.value : null })),
        gainAutomation: window.__pianoAudio?.automation.map(({ method, value, time, now }) => ({ method, value, time, now }))
      }))
    }`)
    report.failureState = JSON.parse(result.match(/### Result\n([\s\S]*?)\n###/)[1])
  } catch (probeError) { report.probeError = probeError.message }
  writeFileSync('output/playwright/task503-settings-browser-report.json', JSON.stringify(report, null, 2))
  throw error
} finally {
  try { command('close') } catch (error) { console.warn(`Browser cleanup: ${error.message}`) }
}
