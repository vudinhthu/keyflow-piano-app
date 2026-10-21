async (page) => {
  const phase = '__PHASE__'
  const target = '__TARGET__'
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const panel = page.getByRole('complementary', { name: 'Dữ liệu và cập nhật' })
  const offlineReady = () => page.waitForFunction(() => document.querySelector('.offline-panel')?.dataset.cachePhase === 'ready')
  const playingReady = () => page.getByRole('status').filter({ hasText: 'Sẵn sàng chơi' }).waitFor()
  const held = () => page.locator('button[data-note][aria-pressed=true]')
  const pedal = () => page.getByRole('button', { name: 'Sustain — giữ pedal', exact: true })
  const defocus = () => page.getByRole('heading', { name: 'Salamander Grand' }).click()
  const rms = () => page.evaluate(() => Math.max(0, ...window.__pianoAudio.analysers.map(a => {
    const data = new Float32Array(a.fftSize); a.getFloatTimeDomainData(data)
    return Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length)
  })))
  const cacheStatus = () => page.evaluate(async () => {
    const worker = (await navigator.serviceWorker.ready).active
    const channel = new MessageChannel()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Cache status timed out')) }, 10000)
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data) }
      worker.postMessage({ type: 'VERIFY_CACHE' }, [channel.port2])
    })
  })
  async function startWithLoading() {
    const expected = await page.evaluate(async () => (await (await fetch('/samples/salamander/manifest.json')).json()).assets.map(asset => asset.bytes).sort((a, b) => a - b))
    await page.evaluate(() => { window.__holdDecoded = true })
    await page.getByRole('button', { name: 'Start Piano', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Đang chuẩn bị âm thanh' }).waitFor()
    await page.waitForFunction(() => window.__decodedWaiters.length > 0)
    assert(await page.locator('button[data-note]:not(:disabled)').count() === 0, 'Notes enabled while loading')
    assert(await page.getByRole('button', { name: 'Đang chuẩn bị…', exact: true }).isDisabled(), 'Start not disabled while loading')
    await page.evaluate(() => { window.__holdDecoded = false; window.__decodedWaiters.splice(0).forEach(resolve => resolve()) })
    await playingReady()
    const decoded = await page.evaluate(expected => window.__nativeDecodedSizes.filter(size => expected.includes(size)).sort((a, b) => a - b), expected)
    assert(JSON.stringify(decoded) === JSON.stringify(expected), `Ready without all 21 pinned sample decodes: ${decoded.length} observed`)
    assert(await page.locator('button[data-note]:not(:disabled)').count() === 61, 'Full piano not enabled after all decoded')
  }
  if (phase === 'online') {
    await offlineReady()
    await page.reload(); await offlineReady()
    const before = await cacheStatus()
    assert(before.ready && before.pinnedSamples === 21 && before.expectedCount >= 29, 'Complete cache not confirmed before close')
    assert(await page.locator('button[data-note]:not(:disabled)').count() === 0, 'Fresh document autoplayed audio')
    await startWithLoading()
    await defocus()
    for (const key of ['z', 'x', 'c']) await page.keyboard.down(key)
    const notes = await held().evaluateAll(keys => keys.map(key => key.getAttribute('data-note')))
    assert(notes.join(',') === 'C3,D3,E3', 'PRD Z X C did not trigger the exact three physical notes')
    await page.waitForTimeout(100)
    const signal = await rms(); assert(signal > 0.0001, 'Online three-note audio missing')
    for (const key of ['z', 'x', 'c']) await page.keyboard.up(key)
    await page.waitForTimeout(1200)
    assert(await rms() < 0.000001 && await held().count() === 0, 'Online release did not reach silence')
    const slider = page.getByRole('slider', { name: 'Âm lượng' })
    await slider.focus(); await page.keyboard.press('Home')
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight')
    await page.getByRole('button', { name: 'Octave cao hơn', exact: true }).click()
    await page.getByRole('combobox', { name: 'Sắc thái' }).selectOption('1')
    const storedSettingsRecord = await page.evaluate(() => localStorage.getItem('keyflow-piano:settings'))
    const settings = JSON.parse(storedSettingsRecord)
    assert(settings.volume === 40 && settings.octaveShift === 1 && settings.velocity === 1, `Chosen settings not stored before close: ${JSON.stringify(settings)}`)
    await defocus(); await page.keyboard.down('Space'); await page.keyboard.down('z'); await page.keyboard.up('z'); await page.keyboard.down('x')
    assert(await held().count() === 1 && await page.locator('[data-sustained=true]').count() === 1, 'No held/sustained state before process close')
    const cdp = await page.context().browser().newBrowserCDPSession()
    const processes = await cdp.send('SystemInfo.getProcessInfo'); await cdp.detach()
    return { passed: true, phase, browserPid: processes.processInfo.find(p => p.type === 'browser').id, cacheVersion: before.version, buildId: before.buildId, declaredAssets: before.expectedCount, pinnedSamples: before.pinnedSamples, startLoadingReady: true, prdPhysicalNotes: notes, signalRms: signal, releaseSilence: true, settingsBeforeClose: { volume: 40, octaveShift: 1, velocity: 1 }, storedSettingsRecord, heldAndSustainedBeforeClose: true }
  }
  await page.context().setOffline(true)
  await page.goto(target)
  await offlineReady(); await page.waitForFunction(() => !navigator.onLine)
  assert(await page.evaluate(() => navigator.serviceWorker.controller !== null), 'Reopened offline document not controlled')
  assert(await page.locator('button[data-note]:not(:disabled)').count() === 0, 'Process reopen restored audio without gesture')
  assert(await held().count() === 0 && await page.locator('[data-sustained=true]').count() === 0 && await pedal().getAttribute('aria-pressed') === 'false', 'Process reopen restored transient owners or pedal')
  const slider = page.getByRole('slider', { name: 'Âm lượng' })
  const restored = { volume: await slider.inputValue(), velocity: await page.getByRole('combobox', { name: 'Sắc thái' }).inputValue(), octave: await page.getByRole('group', { name: 'Octave', exact: true }).textContent(), stored: await page.evaluate(() => localStorage.getItem('keyflow-piano:settings')) }
  assert(restored.volume === '40' && restored.velocity === '1' && restored.octave.includes('C4 — B5'), `Persistent process reopen lost chosen settings: ${JSON.stringify(restored)}`)
  await startWithLoading(); await defocus()
  for (const key of ['z', 'c', 'b']) await page.keyboard.down(key)
  const chord = await held().evaluateAll(keys => keys.map(key => key.getAttribute('data-note')))
  assert(chord.join(',') === 'C4,E4,G4', 'Offline chord did not use restored octave')
  await page.waitForTimeout(100)
  const chordRms = await rms(); assert(chordRms > 0.0001, 'Persistent offline chord has no audio')
  await slider.focus(); await page.keyboard.press('Home'); await page.waitForTimeout(100)
  assert(await rms() < 0.000001 && await held().count() === 3, 'Offline mute failed or discarded owners')
  await page.keyboard.press('End'); await defocus()
  await page.getByRole('button', { name: 'Octave cao hơn', exact: true }).click(); await defocus()
  for (const key of ['z', 'c', 'b']) await page.keyboard.up(key)
  assert(await held().count() === 0, 'Offline octave change lost original release ownership')
  await page.keyboard.down('z'); assert(await held().getAttribute('data-note') === 'C5', 'New offline note ignored shifted octave'); await page.keyboard.up('z')
  await page.keyboard.down('Space'); await page.keyboard.down('z'); await page.keyboard.up('z')
  assert(await page.locator('[data-sustained=true]').count() === 1, 'Offline sustain did not retain released note')
  await page.waitForTimeout(100); const sustainRms = await rms(); assert(sustainRms > 0.0001, 'Offline sustained waveform missing')
  await page.keyboard.up('Space'); await page.waitForTimeout(1200)
  assert(await page.locator('[data-sustained=true]').count() === 0 && await rms() < 0.000001, 'Offline pedal release failed to reach silence')
  await page.keyboard.down('Space'); await page.keyboard.down('z'); await page.keyboard.up('z'); await page.keyboard.down('x')
  // Models focus-loss delivery; native foreground behavior is TASK-604 qualification.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.keyboard.up('x'); await page.keyboard.up('Space'); await page.waitForTimeout(1200)
  assert(await held().count() === 0 && await page.locator('[data-sustained=true]').count() === 0 && await pedal().getAttribute('aria-pressed') === 'false' && await rms() < 0.000001, 'Offline focus cleanup left sounding owners')
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.screenshot({ path: 'output/playwright/task602-offline-playing.png', fullPage: true })
  const verified = await cacheStatus()
  const evictSample = (allowMissing = false) => page.evaluate(async ({ name, allowMissing }) => {
    const cache = await caches.open(name)
    const sample = (await cache.keys()).find(request => new URL(request.url).pathname.endsWith('/C3.mp3'))
    if ((!sample && !allowMissing) || (sample && !await cache.delete(sample))) throw new Error('Test eviction failed')
  }, { name: verified.cacheName, allowMissing })
  await evictSample()
  await page.reload()
  await page.waitForFunction(() => document.querySelector('.offline-panel')?.dataset.cachePhase === 'error')
  await panel.getByRole('button', { name: 'Tải dữ liệu tiếng đàn', exact: true }).click()
  // HTTP cache is separate from Cache Storage and may legitimately repair an evicted entry offline.
  await page.waitForFunction(() => document.querySelector('.audio-error') || !document.querySelector('.start-button')?.disabled, null, { timeout: 35000 })
  const fallbackRecovered = await page.getByRole('button', { name: 'Start Piano', exact: true }).isEnabled()
  if (fallbackRecovered) { await page.getByRole('button', { name: 'Start Piano', exact: true }).click(); await playingReady() }
  if (fallbackRecovered) {
    const repaired = await cacheStatus()
    assert(repaired.ready && await page.locator('button[data-note]:not(:disabled)').count() === 61, 'Offline fallback enabled a partial/unverified piano')
  }
  // Control HTTP fallback in the owned worker target as well as the page.
  // Page offline + global clear alone can still allow an intact HTTP fallback to repair Cache Storage.
  const workerNetwork = await page.context().browser().newBrowserCDPSession()
  const targets = (await workerNetwork.send('Target.getTargets')).targetInfos.filter(info => info.type === 'service_worker' && info.url === new URL('sw.js', target).href)
  assert(targets.length === 1, `Expected one owned active worker network target, got ${targets.length}`)
  const { sessionId: workerSessionId } = await workerNetwork.send('Target.attachToTarget', { targetId: targets[0].targetId, flatten: false })
  let workerCommandId = 0
  const workerRequests = new Map()
  const workerFailures = []
  workerNetwork.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== workerSessionId) return
    const packet = JSON.parse(event.message)
    if (packet.method === 'Network.requestWillBeSent') workerRequests.set(packet.params.requestId, packet.params.request.url)
    if (packet.method === 'Network.loadingFailed') workerFailures.push({ url: workerRequests.get(packet.params.requestId), error: packet.params.errorText })
  })
  const workerCommand = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++workerCommandId
    const timer = setTimeout(() => { workerNetwork.off('Target.receivedMessageFromTarget', reply); reject(new Error(`Owned worker protocol timed out: ${method}`)) }, 10000)
    const reply = event => {
      if (event.sessionId !== workerSessionId) return
      const packet = JSON.parse(event.message)
      if (packet.id !== id) return
      clearTimeout(timer); workerNetwork.off('Target.receivedMessageFromTarget', reply)
      if (packet.error) reject(new Error(`${method}: ${packet.error.message}`))
      else resolve(packet.result)
    }
    workerNetwork.on('Target.receivedMessageFromTarget', reply)
    workerNetwork.send('Target.sendMessageToTarget', { sessionId: workerSessionId, message: JSON.stringify({ id, method, params }) }).catch(error => {
      clearTimeout(timer); workerNetwork.off('Target.receivedMessageFromTarget', reply); reject(error)
    })
  })
  await workerCommand('Network.enable')
  await workerCommand('Network.setCacheDisabled', { cacheDisabled: true })
  await workerCommand('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  const cacheSession = await page.context().newCDPSession(page)
  await cacheSession.send('Network.clearBrowserCache'); await cacheSession.detach()
  await evictSample(true)
  const missing = await cacheStatus()
  assert(!missing.ready && missing.missing.length === 1 && missing.missing[0].endsWith('/C3.mp3'), 'Strict loss did not remove exactly the declared sample')
  await page.reload()
  await page.waitForFunction(() => document.querySelector('.offline-panel')?.dataset.cachePhase === 'error')
  assert(await page.getByRole('button', { name: 'Start Piano', exact: true }).isDisabled(), 'Start enabled before missing data repaired')
  await panel.getByRole('button', { name: 'Tải dữ liệu tiếng đàn', exact: true }).click()
  await page.getByRole('alert').waitFor({ timeout: 35000 })
  assert(await page.locator('button[data-note]:not(:disabled)').count() === 0, 'Evicted offline sample enabled partial piano')
  await page.getByRole('button', { name: 'Thử lại tải dữ liệu', exact: true }).click()
  await page.getByRole('alert').waitFor()
  assert(await page.locator('button[data-note]:not(:disabled)').count() === 0, 'Offline retry falsely enabled partial piano')
  const failedMissingSample = workerFailures.filter(failure => failure.url?.endsWith('/C3.mp3'))
  assert(failedMissingSample.length > 0, 'Strict missing sample did not fail in the owned worker network target')
  await page.context().setOffline(false)
  await workerCommand('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await workerCommand('Network.setCacheDisabled', { cacheDisabled: false })
  await workerNetwork.send('Target.detachFromTarget', { sessionId: workerSessionId }); await workerNetwork.detach()
  // Reconnect may already repair the cache through a verified fetch/worker notification.
  // The download button intentionally disappears once that automatic recovery is complete.
  // Reconnection starts asynchronous verification. Wait for its result before
  // deciding whether the explicit repair is still needed and can be clicked.
  await page.waitForFunction(() => {
    const panel = document.querySelector('.offline-panel')
    const repair = document.querySelector('.download-data-control button')
    return panel?.dataset.cachePhase === 'ready' || (repair && !repair.disabled)
  })
  await page.evaluate(() => {
    const repair = document.querySelector('.download-data-control button')
    if (repair && !repair.disabled) repair.click()
  })
  await offlineReady()
  await page.getByRole('button', { name: 'Start Piano', exact: true }).click(); await playingReady(); await defocus()
  await page.keyboard.down('z'); await page.waitForTimeout(100)
  const recoveredRms = await rms(); assert(recoveredRms > 0.0001, 'Reconnected/repaired piano did not generate audio')
  await page.keyboard.up('z')
  const errors = await page.evaluate(() => window.__pianoAudio.errors)
  assert(errors.length === 0, `Unhandled runtime errors: ${errors.join('; ')}`)
  return { passed: true, phase, offlineBeforeNavigation: true, cacheVersion: verified.version, buildId: verified.buildId, gestureRequired: true, settingsSurviveProcessExit: true, transientOwnersExcluded: true, loadingGateWithAll21Decodes: true, chord, chordRms, volumeMutePreservesOwners: true, octaveHeldRelease: true, sustainRms, pedalReleaseSilence: true, modeledFocusLossSilence: true, cacheStorageOnlyFallbackRecovery: fallbackRecovered, bothCacheLayersEvicted: true, workerHttpCacheDisabled: true, workerNetworkOffline: true, failedMissingSample, evictionDisablesPartialPiano: true, offlineDownloadRetryStaysFailedAndStartDisabled: true, reconnectCacheRepairAndExplicitStart: true, recoveredRms, runtimeErrors: errors, nativeInstallAndDeviceListening: 'pending' }
}
