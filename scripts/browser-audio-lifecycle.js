async (page) => {
  await page.addInitScript(() => {
    window.__ownedAudioContexts = []
    const NativeContext = window.AudioContext
    window.AudioContext = class extends NativeContext {
      constructor(...args) { super(...args); window.__ownedAudioContexts.push(this) }
    }
  })
  await page.reload()
  await page.getByRole('button', { name: 'Start Piano', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Sẵn sàng chơi' }).waitFor()
  await page.getByRole('heading', { name: 'Salamander Grand' }).click()
  await page.keyboard.down('Space')
  await page.keyboard.down('z')
  await page.keyboard.up('z')
  await page.keyboard.down('x')
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
  await page.keyboard.up('x')
  await page.keyboard.up('Space')
  await page.waitForFunction(() => window.__ownedAudioContexts.length >= 2 && window.__ownedAudioContexts.every(c => c.state === 'closed'))
  if (await page.locator('button[data-note][aria-pressed=true]').count() !== 0 || await page.locator('button[data-note]:not(:disabled)').count() !== 0) throw new Error('Page hide retained notes or input readiness')
  const closedBeforeRestart = await page.evaluate(() => window.__ownedAudioContexts.length)
  await page.getByRole('button', { name: 'Start Piano', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Sẵn sàng chơi' }).waitFor()
  await page.getByRole('heading', { name: 'Salamander Grand' }).click()
  await page.keyboard.down('z')
  if (await page.locator('button[data-note][aria-pressed=true]').getAttribute('data-note') !== 'C3') throw new Error('Audio failed to restart after page hide')
  await page.keyboard.up('z')
  const states = await page.evaluate(() => window.__ownedAudioContexts.map(c => c.state))
  if (states.filter(s => s === 'running').length !== 1 || states.filter(s => s !== 'closed').length !== 1) throw new Error(`Unexpected retained contexts after restart: ${states}`)
  return { passed: true, closedBeforeRestart, statesAfterRestart: states, allContextsClosedOnPagehide: true, heldAndSustainedCleared: true, explicitRestartCreatesFreshContext: true, caveat: 'Pagehide handler uses a synthetic persisted event in the current document; actual OS/native app relaunch is separate' }
}
