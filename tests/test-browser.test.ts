import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
const result = (product: string) => `### Result\n${JSON.stringify({ product, userAgent: 'HeadlessChrome/155.0.0.0 Edg/155.0.0.0', protocolVersion: '1.3' })}\n### Ran Playwright code`

describe('automated browser qualification identity', () => {
  it('rejects Chrome fallback for a requested Edge run', async () => {
    vi.stubEnv('PIANO_TEST_BROWSER', 'msedge')
    const { openTestBrowser, browserIdentities } = await import('../scripts/test-browser.mjs')
    const command = vi.fn(async (...args: string[]) => args[0] === 'open' ? '' : result('Chrome/155.0.8059.39'))
    await expect(openTestBrowser(command, 'https://example.test')).rejects.toThrow('Unexpected browser identity')
    expect(browserIdentities).toHaveLength(0)
  })
  it('requires native identity evidence, rather than launch intent alone', async () => {
    vi.stubEnv('PIANO_TEST_BROWSER', 'msedge')
    const { openTestBrowser } = await import('../scripts/test-browser.mjs')
    await expect(openTestBrowser(vi.fn(async () => '### Browser opened'), 'about:blank')).rejects.toThrow('identity evidence missing')
  })
  it('retains identities for both persistent-profile starts and accepts reduced UA patch fields', async () => {
    vi.stubEnv('PIANO_TEST_BROWSER', 'msedge')
    vi.stubEnv('PIANO_TEST_BROWSER_CONFIG', '/tmp/edge-test.config.json')
    const { openTestBrowser, browserIdentities } = await import('../scripts/test-browser.mjs')
    const command = vi.fn(async (...args: string[]) => args[0] === 'open' ? '' : result('Edg/155.0.4283.45'))
    await openTestBrowser(command, 'https://example.test', '--profile', '/tmp/owned-profile')
    await openTestBrowser(command, 'about:blank', '--profile', '/tmp/owned-profile')
    expect(browserIdentities).toHaveLength(2)
    expect(browserIdentities.every(identity => identity.requestedBrowser === 'msedge' && identity.product === 'Edg/155.0.4283.45')).toBe(true)
    expect(command.mock.calls.filter(args => args[0] === 'open').every(args => args.includes('--profile') && args.includes('/tmp/owned-profile') && args.includes('/tmp/edge-test.config.json'))).toBe(true)
  })
  it('does not silently replace an unsupported browser choice', async () => {
    vi.stubEnv('PIANO_TEST_BROWSER', 'unknown-browser')
    await expect(import('../scripts/test-browser.mjs')).rejects.toThrow('Unsupported PIANO_TEST_BROWSER')
  })
})
