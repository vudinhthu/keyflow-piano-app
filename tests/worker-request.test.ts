import { describe, expect, it } from 'vitest'
import { workerRequest } from '../src/features/offline/protocol'

describe('worker request lifetime', () => {
  it('delivers the requested command on its own reply channel', async () => {
    let command: unknown
    const worker = { postMessage: (message: unknown, ports: MessagePort[]) => { command = message; ports[0].postMessage({ answer: 42 }); ports[0].close() } } as unknown as ServiceWorker
    expect(await workerRequest(worker, 'VERIFY_CACHE', { version: 'v' })).toEqual({ answer: 42 })
    expect(command).toEqual({ type: 'VERIFY_CACHE', version: 'v' })
  })
  it('aborts an outstanding request without leaving the UI waiting for the timeout', async () => {
    let port: MessagePort | undefined
    const worker = { postMessage: (_message: unknown, ports: MessagePort[]) => { port = ports[0] } } as unknown as ServiceWorker
    const controller = new AbortController()
    const pending = workerRequest(worker, 'VERIFY_CACHE', {}, 20000, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    port?.close()
  })
  it('turns a missing worker reply into an explicit recoverable failure', async () => {
    let port: MessagePort | undefined
    const worker = { postMessage: (_message: unknown, ports: MessagePort[]) => { port = ports[0] } } as unknown as ServiceWorker
    await expect(workerRequest(worker, 'VERIFY_CACHE', {}, 10)).rejects.toThrow('timed out')
    port?.close()
  })
})
