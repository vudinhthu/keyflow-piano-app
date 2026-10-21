import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Source identity avoids a circular hash between a compiled client and its cache.
export function buildIdentity(): string {
  const files = ['index.html', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'tsconfig.json', 'scripts/build-identity.ts']
  function collect(directory: string) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name)
      if (item.isDirectory()) collect(path)
      else if (item.isFile()) files.push(path)
    }
  }
  collect('src'); collect('public')
  const hash = createHash('sha256')
  for (const path of files.sort()) { hash.update(path); hash.update('\0'); hash.update(readFileSync(path)); hash.update('\0') }
  return hash.digest('hex')
}
