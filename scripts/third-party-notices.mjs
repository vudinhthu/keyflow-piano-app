import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const project = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const packages = new Map()

function locate(name, from = root) {
  const require = createRequire(join(from, 'package.json'))
  const filename = require.resolve.paths(name).map(directory => join(directory, name, 'package.json')).find(existsSync)
  if (!filename) throw new Error(`Install locked dependencies before generating notices: ${name}`)
  const directory = dirname(realpathSync(filename))
  return { directory, metadata: JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) }
}

function include(name, from = root, recurse = true) {
  const item = locate(name, from)
  const key = `${item.metadata.name}@${item.metadata.version}`
  if (packages.has(key)) return
  packages.set(key, item)
  if (recurse) for (const dependency of Object.keys(item.metadata.dependencies ?? {})) include(dependency, item.directory)
}

// Workbox is declared as a development dependency but is imported by the worker.
for (const name of [...Object.keys(project.dependencies), 'workbox-precaching']) include(name)
// These packages can contribute styles or generated helpers to the built site.
for (const name of ['tailwindcss', 'vite', 'vite-plugin-pwa']) include(name, root, false)

function repository(metadata) {
  let url = typeof metadata.repository === 'string' ? metadata.repository : metadata.repository?.url
  if (!url) throw new Error(`Missing repository for ${metadata.name}`)
  url = url.replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '')
  if (url.startsWith('github:')) url = `https://github.com/${url.slice(7)}`
  if (!url.includes('://')) url = `https://github.com/${url}`
  return url
}

const sections = [...packages].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, { directory, metadata }]) => {
  const files = readdirSync(directory).filter(file => /^(license|licence|copying|copyright|notice)([.\-_].*)?$/i.test(file)).sort()
  if (!files.length) throw new Error(`No original license/notice text found for ${name}`)
  const notices = files.map(file => `### ${file}\n\n\`\`\`text\n${readFileSync(join(directory, file), 'utf8').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim()}\n\`\`\``).join('\n\n')
  return `## ${name}\n\nSource: ${repository(metadata)}\n\nSPDX: ${metadata.license}\n\n${notices}`
})

const iconLicense = readFileSync(join(root, 'scripts/licenses/lucide-LICENSE.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim()
const iconNotice = `## Lucide / Feather — inline control arrows\n\nSource: https://github.com/lucide-icons/lucide/tree/c29c276f16590cf017126671535ad8c792be64d8\n\nThe arrow path geometry in ControlIcon is derived from Lucide's Feather-origin arrows; sizing, stroke and surrounding controls are adapted for this project.\n\nSPDX: ISC AND MIT\n\n\`\`\`text\n${iconLicense}\n\`\`\``
const output = `# KeyFlow Piano — Third-party notices / Thông báo giấy phép\n\nThank you to the authors, maintainers and open-source communities behind these components.\nXin cảm ơn các tác giả, maintainer và cộng đồng mã nguồn mở đã xây dựng các thành phần này.\n\nThis file retains original copyright and license texts for the runtime dependency closure, including the service worker, plus packages that can contribute generated helpers or styles and the inline control arrows. Some listed components may be removed by tree shaking. It does not replace or restrict their original licenses.\n\nCác bản ghi âm Salamander Grand Piano của Alexander Holm được ghi nhận riêng theo CC BY 3.0 tại [sample attribution](samples/salamander/ATTRIBUTION.md).\n\nGenerated from the locked, installed dependencies and the pinned icon license by \`pnpm notices:generate\`. Verify with \`pnpm notices:verify\`.\n\n${sections.join('\n\n')}\n\n${iconNotice}\n`
const destination = join(root, 'public/THIRD_PARTY_NOTICES.md')
if (process.argv.includes('--check')) {
  if (!existsSync(destination) || readFileSync(destination, 'utf8') !== output) {
    console.error('Third-party notices are missing or outdated. Run pnpm notices:generate and review the change.')
    process.exitCode = 1
  } else console.log(`Verified notices for ${packages.size} package versions.`)
} else {
  writeFileSync(destination, output)
  console.log(`Generated public/THIRD_PARTY_NOTICES.md for ${packages.size} package versions.`)
}
