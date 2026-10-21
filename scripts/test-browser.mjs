const allowed = new Set(['chrome', 'msedge'])
export const browserIdentities = []
export const testBrowser = process.env.PIANO_TEST_BROWSER || 'chrome'
if (!allowed.has(testBrowser)) throw new Error(`Unsupported PIANO_TEST_BROWSER: ${testBrowser}`)

/** Open an isolated test browser and reject a silent vendor fallback. */
export async function openTestBrowser(command, url, ...options) {
  const config = process.env.PIANO_TEST_BROWSER_CONFIG
  await command('open', url, '--browser', testBrowser, ...(config ? ['--config', config] : []), ...options)
  const expected = testBrowser === 'msedge' ? 'Edg/' : 'Chrome/'
  const output = await command('run-code', `async (page) => {
    const cdp = await page.context().browser().newBrowserCDPSession()
    try {
      const version = await cdp.send('Browser.getVersion')
      if (!version.product.startsWith(${JSON.stringify(expected)})) throw new Error('Requested browser vendor did not launch: ' + JSON.stringify(version))
      return version
    } finally { await cdp.detach() }
  }`)
  const result = output.match(/### Result\n([\s\S]*?)\n###/)
  if (!result) throw new Error('Browser identity evidence missing')
  const version = JSON.parse(result[1])
  if (!version.product?.startsWith(expected)) throw new Error(`Unexpected browser identity for ${testBrowser}: ${version.product}`)
  const identity = { requestedBrowser: testBrowser, ...version }
  browserIdentities.push(identity)
  return identity
}
