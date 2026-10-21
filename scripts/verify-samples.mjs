import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = new URL('../public/samples/salamander/', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'))
const compiledManifest = JSON.parse(await readFile(new URL('../src/features/audio/sample-manifest.json', import.meta.url), 'utf8'))
if (JSON.stringify(manifest) !== JSON.stringify(compiledManifest)) throw new Error('Public and compiled sample manifests differ')
let total = 0
for (const sample of manifest.assets) {
  const data = await readFile(new URL(sample.file, root))
  const digest = createHash('sha256').update(data).digest('hex')
  if (data.length !== sample.bytes || digest !== sample.sha256) throw new Error(`Invalid sample: ${sample.file}`)
  total += data.length
}
if (manifest.assets.length !== 21 || total !== manifest.totalBytes) throw new Error('Invalid sample inventory')
console.log(`Verified 21 MP3 assets: ${(total / 1024 / 1024).toFixed(2)} MiB, SHA-256 matched. ${fileURLToPath(root)}`)
