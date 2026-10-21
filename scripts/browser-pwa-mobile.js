async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const panel = page.getByRole('complementary', { name: 'Dữ liệu và cập nhật' })
  const ready = () => page.waitForFunction(() => document.querySelector('.offline-panel')?.dataset.cachePhase === 'ready')
  const dataReady = () => page.waitForFunction(() => document.querySelector('.offline-panel')?.dataset.sampleStatus === 'ready')
  await ready(); await dataReady()
  assert(await panel.getByRole('button', { name: /tải dữ liệu/i }).count() === 0, 'Download visible despite verified cache and prepared samples')
  const popup = page.getByRole('dialog', { name: 'Xoay ngang màn hình' })
  const settleViewport = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const resize = async size => {
    const isPortrait = size.width <= 900 && size.height >= size.width
    const changed = await page.evaluate(expected => {
      const media = matchMedia('(orientation: portrait) and (max-width: 900px)')
      const changed = media.matches !== expected
      window.__pianoOrientationObserved = !changed
      if (changed) media.addEventListener('change', () => { window.__pianoOrientationObserved = true }, { once: true })
      return changed
    }, isPortrait)
    await page.setViewportSize(size)
    // A dismissed dialog is already hidden when rotating to landscape. Observe
    // the media event itself, so that transition completes before another resize.
    await page.waitForFunction(() => window.__pianoOrientationObserved)
    // Different MediaQueryList objects can dispatch in different order. Two frames
    // also let the application's listener and the modal accessibility tree settle.
    await settleViewport()
    if (changed) await popup.waitFor({ state: isPortrait ? 'visible' : 'hidden' })
  }
  await resize({ width: 390, height: 844 })
  const closePopup = page.getByRole('button', { name: 'Đóng lời nhắc xoay ngang' })
  const dismissPopup = async () => {
    await closePopup.click()
    await popup.waitFor({ state: 'hidden' })
    await settleViewport()
  }
  await popup.waitFor({ state: 'visible' })
  assert(await popup.getByRole('button').count() === 1 && await closePopup.locator('svg').count() === 1, 'Popup must have only its X icon action')
  assert(await closePopup.evaluate(button => button === document.activeElement), 'Popup did not focus its dismissal button')
  await page.keyboard.press('Tab')
  assert(await closePopup.evaluate(button => button === document.activeElement), 'Popup did not contain keyboard focus')
  await page.keyboard.press('Shift+Tab')
  assert(await closePopup.evaluate(button => button === document.activeElement), 'Popup did not contain reverse keyboard focus')
  await page.screenshot({ path: 'output/playwright/task505-portrait-popup.png' })
  await resize({ width: 844, height: 390 })
  await popup.waitFor({ state: 'hidden' })
  await resize({ width: 390, height: 844 })
  await popup.waitFor({ state: 'visible' })
  await dismissPopup()
  await popup.waitFor({ state: 'hidden' })
  await resize({ width: 320, height: 844 })
  assert(!await popup.isVisible(), 'Dismissed popup reopened within the same portrait session')
  await resize({ width: 844, height: 390 })
  const sampleRequests = []
  page.on('request', request => { if (request.url().endsWith('.mp3')) sampleRequests.push(request.url()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Start Piano', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Sẵn sàng chơi' }).waitFor()
  await page.waitForFunction(() => Math.abs(document.querySelector('.playing-area').getBoundingClientRect().top - 8) < 2)
  assert(sampleRequests.length === 0, `Start performed sample network requests: ${sampleRequests.length}`)
  await page.screenshot({ path: 'output/playwright/task505-landscape-start.png' })
  assert(await page.locator('.offline-panel').isHidden(), 'Verified data leaves a visible empty status panel')
  assert(!await page.getByText(/Sẵn sàng offline|Đang ngoại tuyến|Đã tải tiếng đàn/).count(), 'Removed readiness/network notice is still in the UI')
  for (const width of [320, 390, 844, 1440]) {
    await resize({ width, height: width < 700 ? 844 : 800 })
    if (await popup.isVisible()) await dismissPopup()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Page overflow at ${width}px`)
    const fullWidth = await page.evaluate(() => {
      const main = document.querySelector('main').getBoundingClientRect()
      const piano = document.querySelector('.instrument').getBoundingClientRect()
      return Math.abs(main.left - piano.left) < 1 && Math.abs(main.width - piano.width) < 1 && getComputedStyle(document.querySelector('.instrument')).marginLeft === '0px'
    })
    assert(fullWidth, `Piano has a left gutter or is narrower than its container at ${width}px`)
  }
  await page.getByRole('heading', { name: 'Salamander Grand' }).click()
  await page.keyboard.down('z'); await page.keyboard.down('Space'); await page.keyboard.up('z')
  await resize({ width: 390, height: 844 })
  await popup.waitFor({ state: 'visible' })
  assert(await page.locator('button[data-note][aria-pressed=true], [data-sustained=true]').count() === 0, 'Opening popup left notes held/sustained')
  assert(await page.getByRole('button', { name: 'Sustain — giữ pedal', includeHidden: true }).getAttribute('aria-pressed') === 'false', 'Opening popup left pedal held')
  const octaveBeforePopup = await page.getByRole('group', { name: 'Octave', includeHidden: true }).textContent()
  await page.keyboard.press('z'); await page.keyboard.press('ArrowUp')
  assert(await page.locator('button[data-note][aria-pressed=true]').count() === 0, 'Popup keyboard interaction played notes')
  assert(await page.getByRole('group', { name: 'Octave', includeHidden: true }).textContent() === octaveBeforePopup, 'Popup keyboard interaction shifted octave')
  await page.keyboard.up('Space'); await page.keyboard.press('Escape'); await popup.waitFor({ state: 'hidden' })
  await resize({ width: 1440, height: 800 })
  await page.locator('.orientation-popup').waitFor({ state: 'hidden' })
  const floating = page.getByRole('complementary', { name: 'Octave và Sustain nổi' })
  await floating.waitFor({ state: 'visible' })
  const grip = floating.getByRole('button', { name: 'Di chuyển điều khiển', exact: true })
  const range = page.getByRole('group', { name: 'Octave', exact: true })
  const beforeDrag = await floating.boundingBox()
  await page.getByRole('heading', { name: 'Salamander Grand' }).click()
  await page.keyboard.down('z')
  const gripBox = await grip.boundingBox()
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
  await page.mouse.down(); await page.mouse.move(360, 260, { steps: 8 }); await page.mouse.up()
  const moved = await floating.boundingBox()
  assert(moved.x > beforeDrag.x + 100, 'Grip did not drag the floating wrapper')
  assert(await page.locator('button[data-note][aria-pressed=true]').count() === 1, 'Dragging changed held-note ownership')
  await page.keyboard.up('z')
  const octaveBeforeMove = await range.textContent()
  await grip.focus(); await page.keyboard.press('ArrowUp')
  assert(await range.textContent() === octaveBeforeMove, 'Grip keyboard movement also shifted octave')
  const savedPosition = await page.evaluate(() => JSON.parse(localStorage.getItem('keyflow-piano:floating-controls')))
  assert(savedPosition.version === 1 && savedPosition.x > 0 && savedPosition.y >= 0, 'Drag position was not saved')
  const pedal = floating.getByRole('button', { name: 'Sustain — giữ pedal', exact: true })
  const actionPosition = await floating.boundingBox()
  const pedalBox = await pedal.boundingBox()
  await page.mouse.move(pedalBox.x + pedalBox.width / 2, pedalBox.y + pedalBox.height / 2)
  await page.mouse.down()
  assert(await pedal.getAttribute('aria-pressed') === 'true', 'Hamburger sustain did not hold pedal')
  await page.mouse.up()
  assert(await pedal.getAttribute('aria-pressed') === 'false', 'Hamburger sustain stayed held after release')
  assert(Math.abs((await floating.boundingBox()).x - actionPosition.x) < 1, 'Action button dragged the wrapper')
  for (const width of [320, 390, 844]) {
    await resize({ width, height: width < 700 ? 844 : 390 })
    // CDP resizing returns before the window resize event on some runners.
    // Observe the completed clamp; the same edge bounds remain mandatory.
    await page.waitForFunction(width => {
      const box = document.querySelector('.floating-controls').getBoundingClientRect()
      return box.x >= 7 && box.y >= 7 && box.right <= width - 7 && box.bottom <= innerHeight - 7
    }, width)
    if (await popup.isVisible()) await dismissPopup()
    // Resizing can leave the piano below a short landscape viewport. The panel
    // intentionally hides outside the playing area; restore the user's play view.
    await page.locator('.playing-area').scrollIntoViewIfNeeded()
    await floating.waitFor({ state: 'visible' })
    const box = await floating.boundingBox()
    assert(box.x >= 7 && box.y >= 7 && box.x + box.width <= width - 7, 'Floating controls exceeded resized viewport')
    const volumeBox = await page.locator('.volume-control').boundingBox()
    const velocityBox = await page.locator('.velocity-control').boundingBox()
    assert(volumeBox.x + volumeBox.width <= velocityBox.x + 1 && Math.max(volumeBox.y, velocityBox.y) < Math.min(volumeBox.y + volumeBox.height, velocityBox.y + velocityBox.height), 'Velocity no longer sits beside volume')
  }
  await resize({ width: 1440, height: 800 })
  await page.locator('.orientation-popup').waitFor({ state: 'hidden' })
  const slider = page.getByRole('slider', { name: 'Âm lượng' })
  await slider.focus(); await page.keyboard.press('Home')
  for (let index = 0; index < 37; index++) await page.keyboard.press('ArrowRight')
  await page.context().setOffline(true)
  await page.reload(); await ready(); await dataReady()
  assert(await slider.inputValue() === '37', 'Offline reopen lost settings')
  const restoredPosition = await page.evaluate(() => JSON.parse(localStorage.getItem('keyflow-piano:floating-controls')))
  assert(JSON.stringify(restoredPosition) === JSON.stringify(savedPosition), 'Reopen lost the floating position')
  assert(await page.locator('button[data-note]:not(:disabled)').count() === 0, 'Offline reopen autoplayed audio')
  await page.getByRole('button', { name: 'Start Piano', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Sẵn sàng chơi' }).waitFor()
  await page.getByRole('heading', { name: 'Salamander Grand' }).click()
  await page.keyboard.down('z')
  assert(await page.locator('button[data-note][aria-pressed=true]').count() === 1, 'Offline reopen failed to play')
  await page.evaluate(() => scrollTo(0, 0))
  // Model touch sequences in the DOM; this verifies event guards, not device-native PWA gestures.
  const gesture = async (targetSelector, dx, dy, end = true, multiple = false) => page.evaluate(({ targetSelector, dx, dy, end, multiple }) => {
    const target = document.querySelector(targetSelector)
    const emit = (type, x, y, empty = false) => {
      const touch = new Touch({ identifier: 1, target, clientX: x, clientY: y })
      const touches = empty ? [] : multiple ? [touch, new Touch({ identifier: 2, target, clientX: x + 10, clientY: y })] : [touch]
      target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches, changedTouches: [touch] }))
    }
    emit('touchstart', 150, 120); emit('touchmove', 150 + dx, 120 + dy)
    if (end) emit('touchend', 150 + dx, 120 + dy, true)
  }, { targetSelector, dx, dy, end, multiple })
  await gesture('.intro', 0, 140, false)
  assert(!await page.locator('.pull-refresh').isVisible(), 'Refresh accepted while a note was held')
  await page.keyboard.up('z')
  await page.waitForTimeout(1300)
  for (const [selector, dx, dy, multiple] of [['.piano-key', 0, 140, false], ['.volume-control input', 0, 140, false], ['.intro', 140, 30, false], ['.intro', 0, 140, true]]) {
    await gesture(selector, dx, dy, true, multiple)
    assert(!await page.locator('.pull-refresh').isVisible(), 'Refresh accepted excluded control/direction/multitouch')
  }
  await gesture('.intro', 0, 50, false)
  await page.getByRole('status').filter({ hasText: 'Kéo xuống để làm mới' }).waitFor()
  await page.evaluate(() => document.querySelector('.intro').dispatchEvent(new TouchEvent('touchcancel', { bubbles: true })))
  assert(!await page.locator('.pull-refresh').isVisible(), 'Canceled pull remained armed')
  await gesture('.intro', 0, 140, false)
  await page.getByRole('status').filter({ hasText: 'Thả để làm mới' }).waitFor()
  await page.screenshot({ path: 'output/playwright/task504-pull-ready.png' })
  const navigation = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() })
  await page.evaluate(() => document.querySelector('.intro').dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] })))
  await navigation; await ready(); await dataReady()
  assert(await slider.inputValue() === '37', 'Pull refresh lost settings')
  assert(await page.locator('button[data-note]:not(:disabled)').count() === 0, 'Pull refresh autoplayed audio')
  assert(sampleRequests.length === 0, 'Offline reload or Start attempted sample network requests')
  assert(!errors.length, `Runtime errors: ${errors.join('; ')}`)
  return { passed: true, portraitPopup: true, popupFocusContained: true, closeIconAndEscapeDismissPopup: true, landscapePopupCloses: true, popupClearsNotesPedalAndBlocksKeyboard: true, offlineNoticeRemoved: true, fullWidthPianoWithoutLeftGutter: true, startOnlyDecodesPreparedData: true, startSampleRequests: sampleRequests, reducedMotionScroll: true, responsiveWidths: [320,390,844,1440], offlineReloadRetainsCacheSettings: true, offlineExplicitStartPlays: true, modeledPullGuards: ['held note','piano','slider','horizontal','multitouch','cancellation'], modeledPullReloadPreservesCacheSettings: true, floatingGripDragPreservesHeldNotes: true, gripKeyboardMovementDoesNotShiftOctave: true, sustainIconOwnership: true, floatingPositionPersistsAndClampsOnResize: true, velocityBesideVolume: true, nativeMobileGestureAcceptance: 'not measured', runtimeErrors: errors }
}
