async (page) => {
  await page.addInitScript(() => {
    window.__pianoAudio = { analysers: [], decodedSizes: [], sources: 0, connections: [], automation: [], errors: [], gainContexts: new WeakMap() }
    window.addEventListener('error', (event) => { if (event.error) window.__pianoAudio.errors.push(event.message) })
    window.addEventListener('unhandledrejection', (event) => window.__pianoAudio.errors.push(String(event.reason)))
    const decode = AudioContext.prototype.decodeAudioData
    AudioContext.prototype.decodeAudioData = function (bytes, ...args) {
      const size = bytes.byteLength
      return decode.call(this, bytes, ...args).then(buffer => { window.__pianoAudio.decodedSizes.push(size); return buffer })
    }
    const createGain = AudioContext.prototype.createGain
    AudioContext.prototype.createGain = function (...args) {
      const node = createGain.apply(this, args)
      window.__pianoAudio.gainContexts.set(node.gain, node.context)
      return node
    }
    for (const method of ['setValueAtTime', 'linearRampToValueAtTime']) {
      const original = AudioParam.prototype[method]
      AudioParam.prototype[method] = function (value, time) {
        const context = window.__pianoAudio.gainContexts.get(this)
        if (context) window.__pianoAudio.automation.push({ param: this, method, value, time, now: context.currentTime })
        return original.call(this, value, time)
      }
    }
    const originalConnect = AudioNode.prototype.connect
    AudioNode.prototype.connect = function (destination, ...args) {
      const result = originalConnect.call(this, destination, ...args)
      if (destination instanceof AudioNode) window.__pianoAudio.connections.push({ source: this, destination })
      if (destination instanceof AudioDestinationNode) {
        const analyser = this.context.createAnalyser()
        analyser.fftSize = 2048
        originalConnect.call(this, analyser)
        window.__pianoAudio.analysers.push(analyser)
      }
      return result
    }
    const originalSource = AudioContext.prototype.createBufferSource
    AudioContext.prototype.createBufferSource = function (...args) {
      window.__pianoAudio.sources++
      return originalSource.apply(this, args)
    }
  })
  await page.reload()
  const download = page.getByRole('button', { name: 'Tải dữ liệu tiếng đàn', exact: true })
  if (await download.count() && await download.isEnabled()) await download.click()
  await page.setViewportSize({ width: 1440, height: 1100 })
  return { keys: await page.locator('button[data-note]').count(), status: await page.locator('.audio-state').textContent() }
}
