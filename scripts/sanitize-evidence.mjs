import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sanitizePublicEvidence } from './public-evidence.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dshSourceRoot = process.env.DSH_SOURCE_ROOT ?? resolve(root, '..', 'deepseek-harness')
const files = [
  'benchmark/results/live-semantic.json',
  'benchmark/results/live-semantic-trigger-mismatch-fail.json',
  'benchmark/results/live-semantic-inline-code-invalid-fail.json',
  'benchmark/results/assembled-transcript.json',
  'benchmark/results/assembled-transcript-current.json',
]

for (const relativePath of files) {
  const path = resolve(root, relativePath)
  const value = JSON.parse(await readFile(path, 'utf8'))
  const sanitized = sanitizePublicEvidence(value, {
    bundleRoot: root,
    dshSourceRoot,
    nodePath: process.execPath,
    dshHomes: [resolve(root, '.tmp/dsh-home'), resolve(root, '.tmp/live-dsh-home')],
  })
  await writeFile(path, `${JSON.stringify(sanitized, null, 2)}\n`)
  console.log(relativePath)
}
