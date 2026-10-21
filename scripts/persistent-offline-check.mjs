import { openTestBrowser, browserIdentities } from './test-browser.mjs'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../node_modules/.bin/playwright-cli', import.meta.url))
const session = `persistent-offline-${process.pid}`
const profile = `output/playwright/${session}-profile`
const url = process.env.PIANO_TEST_URL || 'http://127.0.0.1:4173'
mkdirSync('output/playwright', { recursive: true })
function command(...args) {
  const result = spawnSync(cli, [`-s=${session}`, ...args], { encoding: 'utf8', timeout: 60000 })
  if (result.error || result.status || result.stdout.includes('### Error')) throw new Error(result.error?.message || result.stdout + result.stderr)
  return result.stdout
}
const parse = result => JSON.parse(result.match(/### Result\n([\s\S]*?)\n###/)[1])
try {
  await openTestBrowser(command, url, '--profile', profile)
  const initial = parse(command('run-code', 'async page => { await page.evaluate(async () => { await navigator.serviceWorker.ready }); await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller !== null); const cdp = await page.context().browser().newBrowserCDPSession(); const processes = await cdp.send("SystemInfo.getProcessInfo"); await cdp.detach(); return { browserPid: processes.processInfo.find(p => p.type === "browser").id }; }'))
  command('close')
  let exited = false
  for (let i = 0; i < 30; i++) {
    try { process.kill(initial.browserPid, 0) } catch (error) { if (error.code === 'ESRCH') { exited = true; break }; throw error }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!exited) throw new Error('Original owned Chrome process did not exit; reopen not proven')
  await openTestBrowser(command, 'about:blank', '--profile', profile)
  const preparation = readFileSync('scripts/browser-prepare.js', 'utf8').split('  await page.reload()')[0] + '  return { prepared: true };\n}'
  command('run-code', preparation)
  const code = readFileSync('scripts/browser-persistent-offline.js', 'utf8').replace("'__TARGET__'", JSON.stringify(url))
  const report = { browserIdentities: [...browserIdentities], ...parse(command('run-code', code)), browserProcessExited: true, originalOwnedBrowserPid: initial.browserPid, profile, url }
  writeFileSync('output/playwright/task501-persistent-offline-report.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally { try { command('close') } catch (error) { console.warn(error.message) } }
