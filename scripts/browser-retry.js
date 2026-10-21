async (page) => {
  const target = '**/samples/salamander/C3.mp3'
  // Network-loader fault is tested on an uncontrolled fresh document; cached-worker
  // corruption/install failures are covered by the dedicated offline suite.
  await page.evaluate(async () => {
    await Promise.all((await caches.keys()).map(name => caches.delete(name)))
    if ('serviceWorker' in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map(registration => registration.unregister()))
  })
  await page.addInitScript(() => {
    navigator.serviceWorker.register = async () => { throw new Error('Modeled unavailable storage worker for separate network download fault') }
  })
  await page.route(target, (route) => route.fulfill({ status: 503, body: 'unavailable' }))
  await page.reload()
  return { prepared: true }
}
