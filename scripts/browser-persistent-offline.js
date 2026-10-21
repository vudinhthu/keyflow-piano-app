async (page) => {
  const target = '__TARGET__'
  await page.context().setOffline(true)
  await page.goto(target)
  if (await page.locator('button[data-note]:not(:disabled)').count() !== 0) throw new Error('Reopening browser restored audio without gesture')
  const result = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    const channel = new MessageChannel()
    const status = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Persistent cache query timed out')), 10000)
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data) }
      registration.active.postMessage({ type: 'VERIFY_CACHE' }, [channel.port2])
    })
    return { status, controlled: navigator.serviceWorker.controller !== null }
  })
  if (!result.status.ready || !result.controlled) throw new Error('Persistent offline worker/cache missing')
  await page.getByRole('button', { name: 'Start Piano', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Sẵn sàng chơi' }).waitFor()
  await page.getByRole('heading', { name: 'Salamander Grand' }).click()
  for (const key of ['z', 'c', 'b']) await page.keyboard.down(key)
  await page.waitForTimeout(100)
  const rms = await page.evaluate(() => Math.max(0, ...window.__pianoAudio.analysers.map(a => { const data = new Float32Array(a.fftSize); a.getFloatTimeDomainData(data); return Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length) })))
  if (rms < 0.0001 || await page.locator('button[data-note]:not(:disabled)').count() !== 61) throw new Error('Reopened offline browser could not decode/play full piano')
  for (const key of ['z', 'c', 'b']) await page.keyboard.up(key)
  await page.context().setOffline(false)
  return { passed: true, version: result.status.version, expectedAssets: result.status.expectedCount, controlled: result.controlled, enabledKeys: 61, chordRms: rms, gestureRequired: true, noNativeInstallClaim: true }
}
