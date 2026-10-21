import { openTestBrowser, browserIdentities } from './test-browser.mjs'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../node_modules/.bin/playwright-cli', import.meta.url))
const session = `offline-check-${process.pid}`
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
  const result = command('run-code', '--filename', 'scripts/browser-offline.js')
  const report = { browserIdentities: [...browserIdentities], ...JSON.parse(result.match(/### Result\n([\s\S]*?)\n###/)[1]), url }
  writeFileSync('output/playwright/task501-offline-browser-report.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  try { command('close') } catch (error) { console.warn(`Browser cleanup: ${error.message}`) }
}
