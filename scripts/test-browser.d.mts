export type TestBrowser = 'chrome' | 'msedge'
export interface BrowserIdentity {
  requestedBrowser: TestBrowser
  product: string
  protocolVersion: string
  userAgent: string
  revision?: string
  jsVersion?: string
}
export const testBrowser: TestBrowser
export const browserIdentities: BrowserIdentity[]
export function openTestBrowser(command: (...args: string[]) => string | Promise<string>, url: string, ...options: string[]): Promise<BrowserIdentity>
