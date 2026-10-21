async (page) => {
  const mode = '__MODE__'
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const contractResponse = await page.request.get(new URL('/offline-cache-contract.json', page.url()).href)
  assert(contractResponse.ok(), 'Built cache contract is unavailable')
  const contract = await contractResponse.json()
  const expectedCount = new Set(contract.entries.map(entry => new URL(entry.url, page.url()).href)).size
  assert(contract.entries.some(entry => entry.url === 'THIRD_PARTY_NOTICES.md' && entry.integrity), 'Library notices are missing from the cache contract')
  const control = options => page.evaluate(options => fetch('/__test/control', { method: 'POST', body: JSON.stringify(options) }).then(r => r.json()), options)
  const verify = which => page.evaluate(async which => {
    const registration = await navigator.serviceWorker.getRegistration()
    const worker = which === 'waiting' ? registration.waiting : registration.active
    if (!worker) throw new Error(`No ${which} worker`)
    const channel = new MessageChannel()
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('VERIFY_CACHE timeout')), 10000)
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data) }
      worker.postMessage({ type: 'VERIFY_CACHE' }, [channel.port2])
    })
  }, which)
  const install = () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js')
    const worker = registration.installing || registration.waiting
    if (!worker) return { state: registration.active?.state || 'none' }
    return await new Promise(resolve => {
      const timer = setTimeout(() => resolve({ state: worker.state, timeout: true }), 10000)
      const check = () => { if (['installed', 'activated', 'redundant'].includes(worker.state)) { clearTimeout(timer); resolve({ state: worker.state }) } }
      worker.addEventListener('statechange', check); check()
    })
  })
  const update = () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    await registration.update()
    const worker = registration.installing || registration.waiting
    if (!worker) throw new Error('Update did not create a worker')
    return await new Promise(resolve => {
      const timer = setTimeout(() => resolve({ state: worker.state, timeout: true }), 10000)
      const check = () => { if (['installed', 'activated', 'redundant'].includes(worker.state)) { clearTimeout(timer); resolve({ state: worker.state }) } }
      worker.addEventListener('statechange', check); check()
    })
  })
  if (mode === 'initial-failure') {
    const failed = await install()
    assert(failed.state === 'redundant' && !failed.timeout, 'Incomplete/SRI/quota worker was not rejected')
    assert(await page.evaluate(async () => !(await navigator.serviceWorker.getRegistration())?.active), 'Incomplete first install activated')
    await control({ corrupt: false, quota: false })
    await install()
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    const recovered = await verify('active')
    assert(recovered.ready && recovered.expectedCount === expectedCount, 'Healthy retry did not install complete cache')
    return { passed: true, failedWorkerState: failed.state, noIncompleteActivation: true, retryComplete: true, version: recovered.version, expectedAssets: recovered.expectedCount }
  }
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const original = await verify('active')
  assert(original.ready, 'Initial cache incomplete')
  await page.getByRole('button', { name: 'Start Piano', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Sẵn sàng chơi' }).waitFor()
  await page.getByRole('heading', { name: 'Salamander Grand' }).click()
  await page.keyboard.down('z')
  await control({ version: 2, corrupt: true })
  const failed = await update()
  assert(failed.state === 'redundant' && !failed.timeout, 'Bad new version activated or waited as healthy')
  const afterFailure = await verify('active')
  assert(afterFailure.version === original.version && afterFailure.ready, 'Bad new build modified active build contract')
  assert(await page.locator('button[data-note][aria-pressed=true]').count() === 1, 'Failed update interrupted held note')
  await control({ corrupt: false })
  const healthy = await update()
  assert(healthy.state === 'installed', 'New version did not wait behind playing client')
  const waiting = await verify('waiting')
  assert(waiting.ready && waiting.version !== original.version && waiting.cacheName !== original.cacheName, 'Build cache version did not change independently')
  assert((await verify('active')).version === original.version, 'Waiting update took over active client')
  assert(await page.locator('button[data-note][aria-pressed=true]').count() === 1, 'Healthy waiting update interrupted held note')
  await page.keyboard.up('z')
  const url = page.url()
  await page.goto('about:blank')
  await page.waitForTimeout(500)
  await page.goto(url)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  const next = await verify('active')
  assert(next.version === waiting.version && next.ready, 'Complete new build did not activate after old client left')
  assert(await page.locator('meta[name="cache-test-version"]').getAttribute('content') === '2', 'Reopened shell did not match new build')
  return { passed: true, originalVersion: original.version, newVersion: next.version, rejectedBadUpdate: true, oldBuildPreserved: true, updateWaitsWhilePlaying: true, distinctCompleteVersionCaches: true, naturalActivationAfterClose: true, newShellMatchesNewCache: true }
}
