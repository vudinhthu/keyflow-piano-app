async (page) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]').href
    const response = await fetch(href)
    if (!response.ok) throw new Error('Manifest request failed')
    const manifest = await response.json()
    for (const icon of manifest.icons) {
      const image = new Image()
      image.src = icon.src
      await image.decode()
      if (`${image.naturalWidth}x${image.naturalHeight}` !== icon.sizes) throw new Error('Incorrect icon dimensions')
    }
    return manifest
  })
  if (manifest.id !== '/' || manifest.display !== 'standalone' || manifest.start_url !== '/' || manifest.scope !== '/') throw new Error('Manifest contract changed')
  const worker = await page.evaluate(async () => {
    const registration = await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('SW readiness timed out')), 10000))])
    return { scope: registration.scope, state: registration.active.state }
  })
  if (worker.state !== 'activated') throw new Error('SW not active')
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null).catch(error => { throw new Error(`Controller after reload: ${error.message}`) })
  const cdp = await page.context().newCDPSession(page)
  const nativeManifest = await cdp.send('Page.getAppManifest')
  const installability = await cdp.send('Page.getInstallabilityErrors')
  await cdp.detach()
  const applicationErrors = installability.installabilityErrors.filter((error) => error.errorId !== 'in-incognito')
  if (nativeManifest.errors.length || applicationErrors.length) throw new Error(JSON.stringify({ manifestErrors: nativeManifest.errors, installability }))
  const caches = await page.evaluate(async () => {
    const result = []
    for (const name of await window.caches.keys()) {
      const cache = await window.caches.open(name)
      result.push(...(await cache.keys()).map((request) => new URL(request.url).pathname))
    }
    return result
  })
  if (new Set(caches.filter(path => path.endsWith('.mp3'))).size !== 21) throw new Error('Full core sample cache missing')
  const panel = page.getByRole('complementary', { name: 'Cài đặt KeyFlow' })
  await panel.locator('summary').click()
  if (!(await panel.textContent()).includes('Add to Dock')) throw new Error('Safari guidance missing')
  if (!(await panel.textContent()).includes('Lần tải đầu cần mạng')) throw new Error('Offline limitation missing')
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.screenshot({ path: 'output/playwright/task003-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Install guidance overflows page')
  await page.screenshot({ path: 'output/playwright/task003-narrow.png', fullPage: true })
  await page.getByRole('button', { name: 'Đóng lời nhắc xoay ngang' }).click()
  // Isolate modeled offers from Chrome's independently arriving native offer.
  // Native installability is checked above; these events only test UI handling.
  await page.evaluate(() => window.addEventListener('beforeinstallprompt', event => {
    if (event.isTrusted) { event.preventDefault(); event.stopImmediatePropagation() }
  }, { capture: true }))
  async function offer(outcome, reject = false) {
    await page.evaluate(({ outcome, reject }) => {
      window.__installCalls = 0
      const event = new Event('beforeinstallprompt', { cancelable: true })
      event.prompt = () => { window.__installCalls++; return reject ? Promise.reject(new Error('Synthetic prompt failure')) : Promise.resolve() }
      event.userChoice = Promise.resolve({ outcome })
      window.dispatchEvent(event)
    }, { outcome, reject })
    // An older native offer may already have a button. Wait for React's new
    // event capture to commit before activating the modeled offer.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.getByRole('button', { name: 'Cài ứng dụng', exact: true }).waitFor()
    if (await page.evaluate(() => window.__installCalls) !== 0) throw new Error('Install prompted without user action')
    await page.getByRole('button', { name: 'Cài ứng dụng', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => window.__installCalls === 1).catch(async error => {
      const state = await page.evaluate(() => ({ calls: window.__installCalls, focus: { tag: document.activeElement?.tagName, label: document.activeElement?.textContent?.slice(0, 80) }, popupOpen: document.querySelector('.orientation-popup').open }))
      throw new Error(`Install offer ${outcome}/${reject}: ${JSON.stringify(state)}; ${error.message}`)
    })
    await page.getByRole('button', { name: 'Cài ứng dụng', exact: true }).waitFor({ state: 'hidden' })
  }
  await offer('dismissed')
  if (!(await panel.textContent()).includes('cài sau')) throw new Error('Dismissal state missing')
  await offer('dismissed', true)
  if (!(await panel.textContent()).includes('Chưa mở được')) throw new Error('Failure feedback missing')
  await offer('accepted')
  if (!(await panel.textContent()).includes('Đã gửi yêu cầu')) throw new Error('Accepted feedback missing')
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
  await panel.waitFor({ state: 'hidden' })
  if (await page.locator('button[data-note]:not(:disabled)').count()) throw new Error('Install flow unlocked audio')
  await page.emulateMedia({ colorScheme: 'dark' })
  if (errors.length) throw new Error(errors.join('; '))
  return { passed: true, manifest, worker, manifestErrors: nativeManifest.errors, chromiumInstallabilityErrors: installability.installabilityErrors, cachedPaths: caches, runtimeErrors: errors, userAgent: await page.evaluate(() => navigator.userAgent), checks: ['Manifest/icon dimensions and standalone scope', 'Activated service worker and controlled reload', 'Chrome CDP manifest and installability validation', 'Desktop/390px installation guidance and honest network requirement', 'Synthetic install prompt dismissal, rejection, acceptance and installed UI', 'No automatic install prompt or audio unlock'], nativeChromeInstall: 'pending', nativeEdgeInstall: 'pending', safariAddToDock: 'pending', offlinePiano: 'core cache present; closed/reopened audio verified separately in TASK-501' }
}
