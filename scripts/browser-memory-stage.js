async (page) => {
  const phase = '__PHASE__'
  const target = '__TARGET__'
  const keys = ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm', 'q', '2', 'w', '3', 'e', 'r', '5', 't', '6', 'y', '7', 'u']
  if (phase === 'blank') {
    await page.goto('about:blank')
  } else if (phase === 'ui') {
    await page.addInitScript(() => {
      window.__memoryAudio = { decodedBytes: 0, decodeCalls: 0, startedSources: 0, endedSources: 0, liveSources: 0, peakLiveSources: 0, errors: [] }
      window.addEventListener('error', e => window.__memoryAudio.errors.push(e.message))
      window.addEventListener('unhandledrejection', e => window.__memoryAudio.errors.push(String(e.reason)))
      const decode = BaseAudioContext.prototype.decodeAudioData
      BaseAudioContext.prototype.decodeAudioData = async function (...args) {
        const buffer = await decode.apply(this, args)
        window.__memoryAudio.decodedBytes += buffer.length * buffer.numberOfChannels * 4
        window.__memoryAudio.decodeCalls++
        return buffer
      }
      const create = AudioContext.prototype.createBufferSource
      AudioContext.prototype.createBufferSource = function (...args) {
        const source = create.apply(this, args)
        const start = source.start
        let started = false
        source.start = function (...args) {
          const result = start.apply(this, args)
          if (!started) {
            started = true
            window.__memoryAudio.startedSources++
            window.__memoryAudio.liveSources++
            window.__memoryAudio.peakLiveSources = Math.max(window.__memoryAudio.peakLiveSources, window.__memoryAudio.liveSources)
          }
          return result
        }
        source.addEventListener('ended', () => {
          if (started) { window.__memoryAudio.endedSources++; window.__memoryAudio.liveSources-- }
        }, { once: true })
        return source
      }
    })
    await page.goto(target)
    await page.getByRole('button', { name: 'Start Piano', exact: true }).waitFor()
  } else if (phase === 'ready') {
    await page.getByRole('button', { name: 'Start Piano', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Sẵn sàng chơi' }).waitFor()
  } else if (phase.startsWith('reloadReady')) {
    await page.reload()
    await page.getByRole('button', { name: 'Start Piano', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Sẵn sàng chơi' }).waitFor()
  } else if (phase === 'held24') {
    await page.getByRole('heading', { name: 'Salamander Grand' }).click()
    for (const key of keys) await page.keyboard.down(key)
    if (await page.locator('button[data-note][aria-pressed=true]').count() !== 24) throw new Error('Missing held input in memory phase')
  } else if (phase === 'released24') {
    for (const key of keys) await page.keyboard.up(key)
    await page.waitForTimeout(450)
  } else if (phase === 'burst144') {
    for (let cycle = 0; cycle < 6; cycle++) {
      for (const key of keys) await page.keyboard.down(key)
      for (const key of keys) await page.keyboard.up(key)
    }
    await page.waitForTimeout(450)
  } else if (phase === 'idle5s') {
    await page.waitForTimeout(5000)
  } else if (phase === 'disposed') {
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    await page.waitForTimeout(450)
  } else throw new Error(`Unknown memory phase ${phase}`)
  const pageCdp = await page.context().newCDPSession(page)
  await pageCdp.send('Performance.enable')
  const metrics = Object.fromEntries((await pageCdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))
  await pageCdp.detach()
  const browserCdp = await page.context().browser().newBrowserCDPSession()
  const processInfo = (await browserCdp.send('SystemInfo.getProcessInfo')).processInfo.map(p => ({ id: p.id, type: p.type }))
  const browser = await browserCdp.send('Browser.getVersion')
  await browserCdp.detach()
  const audio = await page.evaluate(() => window.__memoryAudio || null)
  if (audio?.errors.length) throw new Error(audio.errors.join('; '))
  return { phase, audio, jsHeapUsedBytes: metrics.JSHeapUsedSize, jsHeapTotalBytes: metrics.JSHeapTotalSize, processInfo, browser, ownPageCount: page.context().pages().length, viewport: page.viewportSize(), devicePixelRatio: await page.evaluate(() => devicePixelRatio), url: page.url() }
}
