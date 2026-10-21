async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const verify = () => page.evaluate(async () => {
    const worker = navigator.serviceWorker.controller || (await navigator.serviceWorker.ready).active
    const channel = new MessageChannel()
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Cache verification timed out')), 10000)
      channel.port1.onmessage = event => { clearTimeout(timeout); resolve(event.data) }
      worker.postMessage({ type: 'VERIFY_CACHE' }, [channel.port2])
    })
  })
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const contractResponse = await page.request.get(new URL('/offline-cache-contract.json', page.url()).href)
  assert(contractResponse.ok(), 'Built cache contract is unavailable')
  const contract = await contractResponse.json()
  const expectedCount = new Set(contract.entries.map(entry => new URL(entry.url, page.url()).href)).size
  const noticeEntry = contract.entries.find(entry => entry.url === 'THIRD_PARTY_NOTICES.md')
  assert(noticeEntry?.integrity, 'Library notices are not bound to the built cache contract')
  const initial = await verify()
  assert(initial.ready && initial.expectedCount === expectedCount, 'Full build cache was not verified')
  const paths = await page.evaluate(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname), initial.cacheName)
  assert(new Set(paths.filter(path => path.endsWith('.mp3'))).size === 21, 'Core samples missing')
  // Leave the app scope, closing its document, then open a fresh document offline.
  const url = page.url()
  await page.goto('about:blank')
  await page.context().setOffline(true)
  await page.goto(url)
  const offlineNotices = await page.evaluate(async () => {
    const response = await fetch('/THIRD_PARTY_NOTICES.md')
    const bytes = await response.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return { ok: response.ok, bytes: bytes.byteLength, integrity: `sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}` }
  })
  assert(offlineNotices.ok && offlineNotices.integrity === noticeEntry.integrity, 'Original library notices are unavailable or changed offline')
  assert(await page.locator('button[data-note]:not(:disabled)').count() === 0, 'Reopening restored audio readiness without gesture')
  await page.getByRole('button', { name: 'Start Piano', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Sẵn sàng chơi' }).waitFor()
  assert(await page.locator('button[data-note]:not(:disabled)').count() === 61, 'Offline decode did not enable full instrument')
  const defocus = () => page.getByRole('heading', { name: 'Salamander Grand' }).click()
  const rms = () => page.evaluate(() => Math.max(0, ...window.__pianoAudio.analysers.map(a => { const data = new Float32Array(a.fftSize); a.getFloatTimeDomainData(data); return Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length) })))
  await defocus()
  for (const key of ['z', 'c', 'b']) await page.keyboard.down(key)
  await page.waitForTimeout(100)
  const chordRms = await rms()
  assert(chordRms > 0.0001 && await page.locator('button[data-note][aria-pressed=true]').count() === 3, 'Offline chord did not produce signal')
  for (const key of ['z', 'c', 'b']) await page.keyboard.up(key)
  await page.waitForTimeout(500)
  const releaseRms = await rms()
  assert(releaseRms < 0.000001, 'Offline note release did not decay')
  const endpoints = []
  for (const note of ['C2', 'C7']) {
    const button = page.locator(`button[data-note="${note}"]`)
    await button.focus()
    await page.keyboard.down('Enter')
    await page.waitForTimeout(100)
    // Qualify sustained signal across advancing audio quanta, rather than one
    // wall-clock snapshot. This is signal coverage, not a latency measurement.
    const observation = await page.evaluate(async note => {
      const audio = window.__pianoAudio
      const contexts = [...new Set(audio.analysers.map(analyser => analyser.context))].filter(context => context.state === 'running')
      const start = performance.now()
      const initialAudioTime = contexts[0]?.currentTime
      const samples = []
      do {
        const signal = Math.max(0, ...audio.analysers.map(analyser => {
          const values = new Float32Array(analyser.fftSize)
          analyser.getFloatTimeDomainData(values)
          return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length)
        }))
        samples.push({ wallMs: performance.now() - start, audioTime: contexts[0]?.currentTime, rms: signal, held: document.querySelector(`button[data-note="${note}"]`)?.getAttribute('aria-pressed') === 'true' })
        await new Promise(resolve => setTimeout(resolve, 20))
      } while (performance.now() - start < 300)
      return { samples, initialAudioTime, finalAudioTime: contexts[0]?.currentTime, runningContexts: contexts.length, focus: document.activeElement?.getAttribute('data-note'), visibility: document.visibilityState }
    }, note)
    assert(observation.samples.every(sample => sample.held), `Offline endpoint ${note} lost input: ${JSON.stringify(observation)}`)
    assert(observation.runningContexts === 1 && observation.finalAudioTime > observation.initialAudioTime + 0.05, `Offline endpoint ${note} audio clock did not advance: ${JSON.stringify(observation)}`)
    const signal = Math.max(...observation.samples.map(sample => sample.rms))
    assert(signal > 0.00001, `Offline endpoint ${note} produced no signal: ${JSON.stringify(observation)}`)
    endpoints.push({ note, rms: signal, observation })
    await page.keyboard.up('Enter')
    await page.waitForTimeout(500)
    assert(await button.getAttribute('aria-pressed') === 'false' && await rms() < 0.000001, `Offline endpoint ${note} did not release/decay`)
  }
  const offlineVerified = await verify()
  assert(offlineVerified.ready && offlineVerified.version === initial.version, 'Offline cache contract changed')
  // Presence and byte length alone must not pass when a cached body is corrupted.
  await page.evaluate(async name => {
    const cache = await caches.open(name)
    const request = (await cache.keys()).find(request => new URL(request.url).pathname.endsWith('/C3.mp3'))
    const response = await cache.match(request)
    const bytes = new Uint8Array(await response.arrayBuffer()); bytes[100] ^= 1
    await cache.put(request, new Response(bytes, { headers: response.headers }))
  }, initial.cacheName)
  const corrupt = await verify()
  assert(!corrupt.ready && corrupt.corrupt.some(url => url.endsWith('C3.mp3')), 'Same-size cache corruption incorrectly reported ready')
  await page.evaluate(async name => {
    const cache = await caches.open(name)
    const request = (await cache.keys()).find(request => new URL(request.url).pathname.endsWith('/C2.mp3'))
    await cache.delete(request)
  }, initial.cacheName)
  const missing = await verify()
  assert(!missing.ready && missing.missing.some(url => url.endsWith('C2.mp3')), 'Evicted asset incorrectly reported ready')
  await page.context().setOffline(false)
  const errors = await page.evaluate(() => window.__pianoAudio.errors)
  assert(errors.length === 0, errors.join('; '))
  return { passed: true, version: initial.version, expectedAssets: initial.expectedCount, mp3Count: 21, offlineNotices, closedReopenedOffline: true, requiresGesture: true, enabledKeys: 61, chordRms, releaseRms, endpoints, sameSizeCorruptionDetected: true, evictionDetected: true, runtimeErrors: errors, nativeInstallation: 'unqualified; browser document reopen only' }
}
