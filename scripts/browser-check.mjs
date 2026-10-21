import { openTestBrowser, browserIdentities } from './test-browser.mjs'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../node_modules/.bin/playwright-cli', import.meta.url))
const session = `piano-check-${process.pid}`
const url = process.env.PIANO_TEST_URL || 'http://127.0.0.1:5173'
mkdirSync('output/playwright', { recursive: true })

function command(...args) {
  const result = spawnSync(cli, [`-s=${session}`, ...args], { encoding: 'utf8', timeout: 60000 })
  appendFileSync('output/playwright/cli-transcript.txt', `${args.join(' ')}\n${result.stdout}\n${result.stderr}\n`)
  if (result.error || result.status !== 0 || result.stdout.includes('### Error')) throw new Error(result.error?.message || result.stdout + result.stderr)
  return result.stdout
}
function button(snapshot, label) {
  const file = snapshot.match(/\[Snapshot\]\(([^)]+)\)/)?.[1]
  if (file) snapshot = readFileSync(file, 'utf8')
  const line = snapshot.split('\n').find((line) => line.includes(`button "${label}"`))
  const ref = line?.match(/\[ref=([A-Za-z0-9]+)\]/)?.[1]
  if (!ref) throw new Error(`Button not present in fresh snapshot: ${label}\n${snapshot.slice(0, 1500)}`)
  return ref
}
try {
  await openTestBrowser(command, url)
  command('run-code', '--filename', 'scripts/browser-prepare.js')
  command('run-code', 'async (page) => { const slider = page.getByRole("slider", {name:"Âm lượng"}); if (await slider.inputValue() !== "100") throw new Error("Default volume changed"); await slider.focus(); await page.keyboard.press("Home"); if (await slider.inputValue() !== "0") throw new Error("Volume unavailable before Start"); return { initialMute: true }; }')
  command('click', button(command('snapshot'), 'Start Piano'))
  const volume = command('run-code', '--filename', 'scripts/browser-volume.js')
  command('click', button(command('snapshot'), 'Start Piano'))
  const volumeResume = command('run-code', 'async (page) => { await page.getByRole("status").filter({hasText:"Sẵn sàng chơi"}).waitFor(); const slider = page.getByRole("slider", {name:"Âm lượng"}); if (await slider.inputValue() !== "0") throw new Error("Audio resume lost volume"); await page.getByRole("heading", {name:"Salamander Grand"}).click(); await page.keyboard.down("z"); await page.waitForTimeout(100); const rms = await page.evaluate(() => Math.max(0, ...window.__pianoAudio.analysers.map(a => { const v = new Float32Array(a.fftSize); a.getFloatTimeDomainData(v); return Math.sqrt(v.reduce((s,x) => s+x*x,0)/v.length) }))); if (rms > 0.000001) throw new Error("Audio resume ignored mute"); await page.keyboard.up("z"); await slider.focus(); await page.keyboard.press("End"); await page.getByRole("heading", {name:"Salamander Grand"}).click(); return { resumeMuteRms: rms }; }')
  const octave = command('run-code', '--filename', 'scripts/browser-octave.js')
  const sustain = command('run-code', '--filename', 'scripts/browser-sustain.js')
  const velocity = command('run-code', '--filename', 'scripts/browser-velocity.js')
  const animation = command('run-code', '--filename', 'scripts/browser-animation.js')
  const scenarios = command('run-code', '--filename', 'scripts/browser-scenarios.js')
  const initialRuntime = command('run-code', 'async (page) => page.evaluate(() => { if (window.__pianoAudio.errors.length) throw new Error(window.__pianoAudio.errors.join("; ")); return { errors: window.__pianoAudio.errors }; })')
  command('click', button(command('snapshot'), 'Start Piano'))
  const resume = command('run-code', 'async (page) => { await page.getByRole("status").filter({hasText:"Sẵn sàng chơi"}).waitFor(); await page.keyboard.up("z"); await page.keyboard.down("z"); if (await page.locator("button[data-note][aria-pressed=true]").count() !== 1) throw new Error("Input failed after audio resume"); await page.keyboard.up("z"); return { audioResumed: true }; }')
  command('run-code', '--filename', 'scripts/browser-retry.js')
  command('run-code', 'async (page) => { await page.getByRole("slider", {name:"Âm lượng"}).focus(); await page.keyboard.press("Home"); return { mutedBeforeRetry: true }; }')
  command('click', button(command('snapshot'), 'Tải dữ liệu tiếng đàn'))
  command('run-code', 'async (page) => { await page.locator(".download-data-control").getByRole("alert").waitFor(); if (await page.locator("button[data-note]:not(:disabled)").count()) throw new Error("Keys enabled after sample failure"); return { failureHandled: true }; }')
  command('run-code', 'async (page) => { await page.unroute("**/samples/salamander/C3.mp3"); return { mockRemoved: true }; }')
  command('click', button(command('snapshot'), 'Thử lại tải dữ liệu'))
  command('run-code', 'async (page) => { await page.waitForFunction(() => !document.querySelector(".start-button").disabled); }')
  command('click', button(command('snapshot'), 'Start Piano'))
  const retry = command('run-code', 'async (page) => { await page.getByRole("status").filter({hasText:"Sẵn sàng chơi"}).waitFor(); return { retryRecovered: true, enabledKeys: await page.locator("button[data-note]:not(:disabled)").count() }; }')
  const volumeRetry = command('run-code', 'async (page) => { const slider = page.getByRole("slider", {name:"Âm lượng"}); if (await slider.inputValue() !== "0") throw new Error("Retry lost volume"); await page.getByRole("heading", {name:"Salamander Grand"}).click(); await page.keyboard.down("z"); await page.waitForTimeout(100); const rms = await page.evaluate(() => Math.max(0, ...window.__pianoAudio.analysers.map(a => { const v = new Float32Array(a.fftSize); a.getFloatTimeDomainData(v); return Math.sqrt(v.reduce((s,x) => s+x*x,0)/v.length) }))); if (rms > 0.000001) throw new Error("Retry ignored mute"); await page.keyboard.up("z"); await slider.focus(); await page.keyboard.press("End"); return { retryMuteRms: rms, finalVolume: await slider.inputValue() }; }')
  const parseResult = (text) => JSON.parse(text.match(/### Result\n([\s\S]*?)\n###/)[1])
  const report = { browserIdentities: [...browserIdentities], ...parseResult(scenarios), resume: parseResult(resume), retry: parseResult(retry), url }
  writeFileSync('output/playwright/phase1-browser-report.json', JSON.stringify(report, null, 2))
  const volumeReport = { ...parseResult(volume), ...parseResult(volumeResume), ...parseResult(volumeRetry), url }
  writeFileSync('output/playwright/task401-volume-browser-report.json', JSON.stringify(volumeReport, null, 2))
  writeFileSync('output/playwright/task402-octave-browser-report.json', JSON.stringify({ ...parseResult(octave), url }, null, 2))
  writeFileSync('output/playwright/task403-sustain-browser-report.json', JSON.stringify({ ...parseResult(sustain), url }, null, 2))
  writeFileSync('output/playwright/task404-velocity-browser-report.json', JSON.stringify({ ...parseResult(velocity), url }, null, 2))
  writeFileSync('output/playwright/task102-animation-browser-report.json', JSON.stringify({ ...parseResult(animation), url }, null, 2))
  const finalRuntime = parseResult(command('run-code', 'async (page) => page.evaluate(() => { if (window.__pianoAudio.errors.length) throw new Error(window.__pianoAudio.errors.join("; ")); return { errors: window.__pianoAudio.errors }; })'))
  const phase2 = { browserIdentities: [...browserIdentities], passed: true, url, volume: volumeReport, octave: parseResult(octave), sustain: parseResult(sustain), velocity: parseResult(velocity), animation: parseResult(animation), core: report, runtimeErrors: [...parseResult(initialRuntime).errors, ...finalRuntime.errors] }
  writeFileSync('output/playwright/phase2-browser-report.json', JSON.stringify(phase2, null, 2))
  console.log(JSON.stringify(phase2, null, 2))
} finally {
  try { command('close') } catch (error) { console.warn(`Browser cleanup: ${error.message}`) }
}
