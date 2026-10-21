async (page) => {
  const target = '__TARGET__'
  const origin = new URL(target).origin
  const context = page.context()
  const cdp = await context.newCDPSession(page)
  const browserCdp = await context.browser().newBrowserCDPSession()
  const browserVersion = await browserCdp.send('Browser.getVersion')
  await cdp.send('Network.enable')
  await cdp.send('Performance.enable')
  const audioContexts = new Map()
  const destroyedContexts = []
  cdp.on('WebAudio.contextCreated', ({ context }) => audioContexts.set(context.contextId, context))
  cdp.on('WebAudio.contextChanged', ({ context }) => audioContexts.set(context.contextId, context))
  cdp.on('WebAudio.contextWillBeDestroyed', ({ contextId }) => { destroyedContexts.push(contextId); audioContexts.delete(contextId) })
  await cdp.send('WebAudio.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 50, downloadThroughput: 20 * 1000000 / 8, uploadThroughput: 20 * 1000000 / 8, connectionType: 'wifi' })
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.addInitScript(() => {
    // Capture the origin's state before the application can register/install.
    // CDP CacheStorage lookup has no origin frame while on about:blank.
    window.__initialPwaState = Promise.all([caches.keys(), navigator.serviceWorker.getRegistrations()]).then(([cacheNames, registrations]) => ({ cacheNames, registrationScopes: registrations.map(registration => registration.scope), controllerScriptURL: navigator.serviceWorker.controller?.scriptURL ?? null }))
    window.__performanceErrors = []
    window.__decodedSampleBytes = 0
    window.__decodedSampleCount = 0
    const decode = BaseAudioContext.prototype.decodeAudioData
    BaseAudioContext.prototype.decodeAudioData = async function (...args) {
      const buffer = await decode.apply(this, args)
      window.__decodedSampleBytes += buffer.length * buffer.numberOfChannels * 4
      window.__decodedSampleCount++
      return buffer
    }
    window.__longTasks = []
    new PerformanceObserver(list => window.__longTasks.push(...list.getEntries().map(e => ({ startTimeMs: e.startTime, durationMs: e.duration })))).observe({ entryTypes: ['longtask'] })
    window.addEventListener('error', e => window.__performanceErrors.push(e.message))
    window.addEventListener('unhandledrejection', e => window.__performanceErrors.push(String(e.reason)))
    document.addEventListener('click', e => {
      if (e.target instanceof Element && e.target.closest('.start-button')) window.__audioGestureAt = performance.now()
    }, true)
    new MutationObserver(() => {
      if (document.querySelector('.audio-state')?.textContent.includes('Sẵn sàng chơi') && !window.__audioReadyAt) window.__audioReadyAt = performance.now()
    }).observe(document, { subtree: true, childList: true, characterData: true })
  })
  const samples = []
  for (let trial = 1; trial <= 3; trial++) {
    let retainedCacheNames = []
    for (const cache of ['cold', 'warm']) {
      let cacheReset = null
      if (cache === 'cold') {
        // Release the previous client before clearing only this test origin.
        // HTTP cache alone cannot make an installed PWA cold.
        await page.goto('about:blank')
        await cdp.send('Network.clearBrowserCache')
        await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'cache_storage,service_workers' })
        cacheReset = { origin, httpCacheCleared: true, storageTypes: ['cache_storage', 'service_workers'] }
      }
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
      if (cache === 'cold') await page.goto(target)
      else await page.reload()
      const initialPwa = await page.evaluate(() => window.__initialPwaState)
      if (cache === 'cold') {
        if (initialPwa.cacheNames.length || initialPwa.registrationScopes.length || initialPwa.controllerScriptURL !== null) throw new Error('Cold document retained PWA cache, registration or controller')
        cacheReset = { ...cacheReset, observedAtDocumentStart: initialPwa }
      }
      await page.getByRole('button', { name: 'Start Piano', exact: true }).waitFor()
      const load = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0]
        return { uiVisibleMs: performance.now(), domContentLoadedMs: nav.domContentLoadedEventEnd, loadEventMs: nav.loadEventEnd, firstContentfulPaintMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null }
      })
      await page.getByRole('button', { name: 'Start Piano', exact: true }).click()
      await page.getByRole('status').filter({ hasText: 'Sẵn sàng chơi' }).waitFor()
      const audio = await page.evaluate(() => ({ audioReadyAfterGestureMs: window.__audioReadyAt - window.__audioGestureAt, samples: performance.getEntriesByType('resource').filter(e => e.name.endsWith('.mp3')).map(e => ({ name: e.name, durationMs: e.duration, transferBytes: e.transferSize, encodedBytes: e.encodedBodySize, workerStartMs: e.workerStart })) }))
      const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))
      const errors = await page.evaluate(() => window.__performanceErrors)
      if (errors.length || audio.samples.length !== 21 || !Number.isFinite(audio.audioReadyAfterGestureMs)) throw new Error(`Invalid performance trial: ${JSON.stringify({ errors, audio })}`)
      // Readiness is outside the UI/audio timestamps above. It establishes the
      // complete paired warm cache, instead of racing its first installation.
      await page.waitForFunction(() => document.querySelector('.offline-panel')?.dataset.cachePhase === 'ready')
      const pwa = await page.evaluate(async () => ({ controllerScriptURL: navigator.serviceWorker.controller?.scriptURL ?? null, cacheNames: await caches.keys() }))
      if (cache === 'cold') {
        if (pwa.controllerScriptURL !== null) throw new Error('Cold navigation retained a controlling worker')
        retainedCacheNames = pwa.cacheNames
        if (retainedCacheNames.length !== 1) throw new Error('Cold trial did not establish one complete paired PWA cache')
      } else if (pwa.controllerScriptURL !== new URL('sw.js', target).href || JSON.stringify([...pwa.cacheNames].sort()) !== JSON.stringify([...retainedCacheNames].sort())) throw new Error('Warm trial did not retain the paired worker/cache')
      samples.push({ trial, cache, cacheReset, initialPwa, pwa, ...load, ...audio, jsHeapUsedBytes: metrics.JSHeapUsedSize, jsHeapTotalBytes: metrics.JSHeapTotalSize })
    }
  }
  await page.getByRole('heading', { name: 'Salamander Grand' }).click()
  await page.evaluate(() => {
    window.__framesDone = new Promise(resolve => {
      const times = []
      const start = performance.now()
      const frame = time => { times.push(time); if (time - start < 3000) requestAnimationFrame(frame); else resolve(times) }
      requestAnimationFrame(frame)
    })
  })
  const keys = ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm', 'q', '2', 'w', '3', 'e', 'r', '5', 't', '6', 'y', '7', 'u']
  let maxHeld = 0
  for (let cycle = 0; cycle < 6; cycle++) {
    for (const key of keys) await page.keyboard.down(key)
    maxHeld = Math.max(maxHeld, await page.locator('button[data-note][aria-pressed=true]').count())
    for (const key of keys) await page.keyboard.up(key)
  }
  const frameTimes = await page.evaluate(() => window.__framesDone)
  const deltas = frameTimes.slice(1).map((time, i) => time - frameTimes[i]).sort((a, b) => a - b)
  const elapsed = frameTimes.at(-1) - frameTimes[0]
  const frames = { durationMs: elapsed, frameCount: frameTimes.length, fps: (frameTimes.length - 1) * 1000 / elapsed, medianFrameMs: deltas[Math.floor(deltas.length * 0.5)], p95FrameMs: deltas[Math.floor(deltas.length * 0.95)], maxFrameMs: deltas.at(-1), maxHeld, cycles: 6, notePresses: keys.length * 6 }
  if (maxHeld !== 24 || await page.locator('button[data-note][aria-pressed=true]').count() !== 0) throw new Error('Performance playback did not exercise/release 24 physical positions')
  const diagnostics = await page.evaluate(() => ({ decodedSampleBytes: window.__decodedSampleBytes, decodedSampleCount: window.__decodedSampleCount, longTasks: window.__longTasks }))
  const realtimeChecks = await Promise.all([...audioContexts.keys()].map(async contextId => { try { return { contextId, data: await cdp.send('WebAudio.getRealtimeData', { contextId }) } } catch (error) { return { contextId, unavailable: error.message } } }))
  const audioContextLifecycle = { lastReported: [...audioContexts.values()], destroyedCount: destroyedContexts.length, realtimeChecks, caveat: 'CDP events may retain stale context states after document navigation; use direct pagehide native-state tests for closure evidence' }
  const processInfo = await browserCdp.send('SystemInfo.getProcessInfo')
  const errors = await page.evaluate(() => window.__performanceErrors)
  if (errors.length) throw new Error(`Performance stress runtime errors: ${errors.join('; ')}`)
  await page.screenshot({ path: 'output/playwright/task603-performance.png', fullPage: true })
  return { diagnostics, audioContextLifecycle, browserVersion, samples, frames, processInfo: processInfo.processInfo.map(p => ({ id: p.id, type: p.type })), runtimeErrors: errors, audibleLatencyMs: null, audioOutput: 'Default automated Chrome sink; physical wired device unverified', conditions: { transport: target.startsWith('http://127.0.0.1') ? 'local production preview, no public TLS/network' : target, cdpMinimumRequestLatencyMs: 50, downMbps: 20, upMbps: 20, cpuThrottle: 1, viewport: '1440x1100', cold: 'fresh navigation after leaving the origin and clearing browser HTTP cache, origin Cache Storage and service-worker registrations; asserts no controlling worker', warm: 'paired complete PWA cache and browser HTTP cache retained; reload asserts the matching active controller/cache; offline readiness wait is excluded from recorded UI/audio times', frameScope: 'headless requestAnimationFrame cadence during 6 cycles of 24-note press/release; native screen refresh unqualified' } }
}
