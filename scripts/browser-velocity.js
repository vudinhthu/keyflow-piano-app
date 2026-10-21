async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const control = page.getByRole('combobox', { name: 'Sắc thái' })
  const key = page.getByRole('button', { name: 'Nốt C3, phím Z', exact: true })
  const defocus = () => page.getByRole('heading', { name: 'Salamander Grand' }).click()
  const marker = () => page.evaluate(() => window.__pianoAudio.connections.length)
  const gainForAttack = async (start, velocity, input) => {
    const initialAudioTimes = await page.evaluate(() => [...new Set(window.__pianoAudio.connections.map(({ source }) => source.context))].map(context => ({ state: context.state, time: context.currentTime })))
    try {
      await page.waitForFunction(({ start, velocity }) => {
      const connection = window.__pianoAudio.connections.slice(start).find(({ source, destination }) => source instanceof AudioBufferSourceNode && source.context.state === 'running' && destination instanceof GainNode && Math.abs(destination.gain.value - velocity) < 0.00001)
      if (!connection) return false
      window.__velocityGain = connection.destination
      window.__velocityObserved = connection.destination.gain.value
      return true
      }, { start, velocity }, { timeout: 5000 })
    } catch (error) {
      const diagnostic = await page.evaluate(({ start, velocity, input, initialAudioTimes }) => ({
        input, expectedVelocity: velocity, connectionMarker: start, initialAudioTimes,
        selectedVelocity: document.querySelector('#piano-velocity')?.value,
        status: document.querySelector('.audio-state')?.textContent,
        visibility: document.visibilityState,
        focusedElement: { tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label'), id: document.activeElement?.id },
        heldNotes: [...document.querySelectorAll('button[data-note][aria-pressed=true]')].map(note => note.getAttribute('data-note')),
        sources: window.__pianoAudio.sources,
        connectionsAfterMarker: window.__pianoAudio.connections.slice(start).map(({ source, destination }) => ({
          source: source.constructor.name, destination: destination.constructor.name,
          contextState: source.context.state, audioTime: source.context.currentTime,
          sampleDuration: source.buffer?.duration, gain: destination.gain?.value,
          isBufferSource: source instanceof AudioBufferSourceNode, isGain: destination instanceof GainNode,
        })),
        runtimeErrors: [...window.__pianoAudio.errors],
      }), { start, velocity, input, initialAudioTimes })
      try { await page.screenshot({ path: `output/playwright/task404-velocity-${input}-failure.png`, fullPage: true }) } catch (captureError) { diagnostic.screenshotError = String(captureError) }
      throw new Error(`${error.message}; velocity observation diagnostic: ${JSON.stringify(diagnostic)}`, { cause: error })
    }
    return page.evaluate(() => window.__velocityObserved)
  }
  assert(await control.inputValue() === '0.72', 'Default velocity changed')
  await control.selectOption('0.4')
  await defocus()
  let start = await marker()
  await page.keyboard.down('z')
  const lightGain = await gainForAttack(start, 0.4, 'light-keyboard')
  const sources = await page.evaluate(() => window.__pianoAudio.sources)
  await control.selectOption('1')
  assert(await page.evaluate(() => window.__velocityGain.gain.value) === lightGain, 'Changing velocity altered an existing note')
  assert(await page.evaluate(() => window.__pianoAudio.sources) === sources, 'Velocity change retriggered an existing note')
  await page.keyboard.up('z')
  await defocus()
  await page.waitForTimeout(500)
  start = await marker()
  await page.keyboard.down('z')
  const strongGain = await gainForAttack(start, 1, 'strong-keyboard')
  await page.keyboard.up('z')
  await page.waitForTimeout(500)
  await control.selectOption('0.4')
  const box = await key.boundingBox()
  start = await marker()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 20)
  await page.mouse.down()
  const pointerGain = await gainForAttack(start, 0.4, 'pointer')
  await page.mouse.up()
  await page.waitForTimeout(500)
  await control.selectOption('0.72')
  await key.focus()
  start = await marker()
  await page.keyboard.down('Enter')
  const accessibleGain = await gainForAttack(start, 0.72, 'accessible')
  await page.keyboard.up('Enter')
  await control.focus()
  await page.keyboard.press('z')
  assert(await page.locator('button[data-note][aria-pressed=true]').count() === 0, 'QWERTY intercepted select input')
  await defocus()
  await page.waitForTimeout(500)
  return { passed: true, lightGain, strongGain, pointerGain, accessibleGain, checks: ['Default 0.72 and light/strong keyboard note-on gains reach real sample voices', 'Changing velocity does not retrigger or alter held notes', 'Pointer and accessible Enter use the selected velocity', 'Focused select keeps native input'], finalVelocity: await control.inputValue() }
}
