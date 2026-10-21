async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const checks = []
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const slider = page.getByRole('slider', { name: 'Âm lượng' })
  const pressed = () => page.locator('button[data-note][aria-pressed="true"]').count()
  const signal = () => page.evaluate(() => Math.max(0, ...window.__pianoAudio.analysers.map((analyser) => {
    const values = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(values)
    return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length)
  })))
  const setVolume = async (value) => {
    await slider.focus()
    await page.keyboard.press(value === 0 ? 'Home' : 'End')
    for (let i = 100; value > 0 && i > value; i--) await page.keyboard.press('ArrowLeft')
    assert(await slider.inputValue() === String(value), `Slider did not reach ${value}%`)
    assert(await page.locator('output[for="piano-volume"]').textContent() === `${value}%`, 'Volume label mismatch')
    assert(await slider.getAttribute('aria-valuetext') === (value === 0 ? 'Tắt tiếng' : `${value}%`), 'Accessible volume mismatch')
    await page.getByRole('heading', { name: 'Salamander Grand' }).click()
  }
  await page.getByRole('status').filter({ hasText: 'Sẵn sàng chơi' }).waitFor()
  assert(await slider.inputValue() === '0', 'Pre-start volume lost on initialize')
  await page.keyboard.down('z')
  await page.waitForTimeout(100)
  const initialMuteRms = await signal()
  assert(await pressed() === 1 && initialMuteRms < 0.000001, 'Pre-start mute failed')
  checks.push('Pre-start 0% silences real audio while note ownership remains active')

  const sources = await page.evaluate(() => window.__pianoAudio.sources)
  await page.evaluate(() => {
    const connection = window.__pianoAudio.connections.find(({ source, destination }) => source instanceof GainNode && source.context.state === 'running' && Math.abs(source.gain.value - Math.pow(10, -10 / 20)) < 0.00001 && destination instanceof GainNode && destination.gain.value === 0)
    if (!connection) throw new Error('Cannot locate muted common output gain')
    window.__masterParam = connection.destination.gain
    window.__rampMarker = window.__pianoAudio.automation.length
  })
  await setVolume(100)
  // Observe real rendering rather than assuming the audio thread advanced during 100 ms wall time.
  // The same waveform threshold remains required; this is not a latency qualification.
  await page.waitForFunction(() => window.__pianoAudio.analysers.some(analyser => {
    const values = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(values)
    return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) > 0.0001
  }), undefined, { timeout: 2000 })
  const unmutedHeldRms = await signal()
  assert(unmutedHeldRms > 0.0001 && await pressed() === 1, 'Held note did not unmute')
  assert(await page.evaluate(() => window.__pianoAudio.sources) === sources, 'Volume change retriggered a sample')
  const gainRampSeconds = await page.evaluate(() => {
    const events = window.__pianoAudio.automation.slice(window.__rampMarker).filter((event) => event.param === window.__masterParam)
    const ramp = events.find((event) => event.method === 'linearRampToValueAtTime' && event.value === 1)
    if (!ramp) throw new Error('Volume did not schedule a native linear ramp')
    if (events.some((event) => event.method === 'setValueAtTime' && event.value > 0.00001)) throw new Error('Unmute started with an abrupt gain step')
    return ramp.time - ramp.now
  })
  assert(gainRampSeconds > 0.01 && gainRampSeconds <= 0.025, `Unexpected native gain ramp lead: ${gainRampSeconds}`)
  checks.push('Native volume automation uses a 20 ms linear ramp with no abrupt unmute gain step')
  checks.push('100% unmutes the existing held sample without retriggering or losing ownership')

  await setVolume(0)
  await page.waitForTimeout(100)
  const heldMuteRms = await signal()
  assert(heldMuteRms < 0.000001 && await pressed() === 1, 'Held note did not mute')
  await page.keyboard.down('c')
  await page.waitForTimeout(100)
  const newMuteRms = await signal()
  assert(newMuteRms < 0.000001 && await pressed() === 2, 'New note ignored mute')
  await page.keyboard.up('z')
  await page.keyboard.up('c')
  await page.waitForTimeout(500)
  checks.push('0% mutes held and new notes without clearing input owners')

  await setVolume(50)
  for (const key of ['z', 'c', 'b']) await page.keyboard.down(key)
  await page.waitForFunction(() => window.__pianoAudio.connections.some(({ source, destination }) => source.context.state === 'running' && destination instanceof GainNode && destination.gain === window.__masterParam && Math.abs(destination.gain.value - 0.5) < 0.00001), undefined, { timeout: 5000 })
  await page.evaluate(() => {
    const connection = window.__pianoAudio.connections.find(({ destination }) => destination instanceof GainNode && destination.gain === window.__masterParam && Math.abs(destination.gain.value - 0.5) < 0.00001)
    if (!connection) throw new Error('No shared 50% output gain')
    const before = connection.source.context.createAnalyser()
    const after = connection.source.context.createAnalyser()
    before.fftSize = after.fftSize = 2048
    connection.source.connect(before)
    connection.destination.connect(after)
    window.__pianoVolume = { before, after }
  })
  // Both analysers must be sampled within one native render quantum.
  // Do not wait for a passing ratio: a stable wrong ratio still fails the original assertion.
  await page.waitForFunction(() => {
    const { before, after } = window.__pianoVolume
    const rms = analyser => {
      const values = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(values)
      return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length)
    }
    const sampledContextTime = before.context.currentTime
    const fullVolumeRms = rms(before)
    const halfVolumeRms = rms(after)
    if (sampledContextTime !== before.context.currentTime || fullVolumeRms <= 0.0001) return false
    window.__pianoVolume.measurement = { fullVolumeRms, halfVolumeRms, sampledContextTime }
    return true
  }, undefined, { timeout: 2000 })
  const { fullVolumeRms, halfVolumeRms, sampledContextTime } = await page.evaluate(() => window.__pianoVolume.measurement)
  const halfVolumeRatio = halfVolumeRms / fullVolumeRms
  assert(fullVolumeRms > 0.0001 && halfVolumeRatio > 0.49 && halfVolumeRatio < 0.51, `50% shared gain has wrong waveform ratio: ${halfVolumeRatio}`)
  for (const key of ['z', 'c', 'b']) await page.keyboard.up(key)
  await page.waitForTimeout(500)
  await page.evaluate(() => { window.__pianoVolume.before.disconnect(); window.__pianoVolume.after.disconnect() })
  checks.push('50% attenuates newly played chords in the real output waveform')

  await slider.focus()
  const beforeTyping = await slider.inputValue()
  await page.keyboard.press('z')
  assert(await pressed() === 0 && await slider.inputValue() === beforeTyping, 'QWERTY intercepted focused slider input')
  await page.keyboard.press('Home')
  await page.keyboard.press('End')
  assert(await slider.inputValue() === '100', 'Native slider keyboard controls failed')
  checks.push('Focused slider keeps native keyboard controls and does not play QWERTY notes')
  await page.getByRole('heading', { name: 'Salamander Grand' }).click()

  await page.screenshot({ path: 'output/playwright/task401-volume-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert(await slider.isVisible() && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Volume caused narrow viewport overflow')
  await page.screenshot({ path: 'output/playwright/task401-volume-narrow.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.locator('.orientation-popup').waitFor({ state: 'hidden' })
  checks.push('Volume control fits desktop and 390 px layouts')
  await setVolume(0)
  await page.evaluate(async () => {
    const analyser = window.__pianoAudio.analysers.find((item) => item.context.state === 'running')
    await analyser.context.suspend()
  })
  await page.getByRole('button', { name: 'Start Piano', exact: true }).waitFor()
  assert(errors.length === 0, `Volume runtime errors: ${errors.join(', ')}`)
  return { passed: true, checks, gainRampSeconds, initialMuteRms, unmutedHeldRms, heldMuteRms, newMuteRms, fullVolumeRms, halfVolumeRms, halfVolumeRatio, sampledContextTime, runtimeErrors: errors }
}
