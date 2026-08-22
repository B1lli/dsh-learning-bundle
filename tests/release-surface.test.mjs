import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import * as core from 'dsh-learning-bundle/core'
import { sanitizePublicEvidence } from '../scripts/public-evidence.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('the documented core package subpath exports the learning API', () => {
  for (const name of [
    'createLearningStore',
    'recallLearning',
    'buildLearningMessage',
    'reconstructLearningDelivery',
  ]) assert.equal(typeof core[name], 'function', name)
})

test('public evidence removes machine paths while preserving session identity', () => {
  const bundleRoot = '/Users/example/work/dsh-learning-bundle'
  const dshHome = `${bundleRoot}/.tmp/dsh-home`
  const value = {
    command: `/Users/example/.nvm/node ${bundleRoot}/scripts/learning.mjs`,
    sessionFile: `${dshHome}/sessions/--Users-example-work--/session-123/session.jsonl.zstd`,
  }
  const sanitized = sanitizePublicEvidence(value, {
    bundleRoot,
    dshHomes: [dshHome],
    nodePath: '/Users/example/.nvm/node',
  })
  assert.equal(sanitized.command, '$NODE $BUNDLE_ROOT/scripts/learning.mjs')
  assert.equal(sanitized.sessionFile, '$DSH_HOME/sessions/session-123/session.jsonl.zstd')
  assert.equal(JSON.stringify(sanitized).includes('/Users/example'), false)
})

test('the default benchmark validates without rewriting checked-in evidence', () => {
  const evidencePath = resolve(root, 'benchmark/results/acceptance.json')
  const before = readFileSync(evidencePath, 'utf8')
  const result = spawnSync(process.execPath, ['scripts/run-benchmark.mjs', '--mode', 'acceptance'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(readFileSync(evidencePath, 'utf8'), before)
  assert.match(result.stdout, /validated without modifying checked-in evidence/)
})

test('the manual CLI stores a physical workspace identity for symlink checkouts', () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'dsh-learning-workspace-'))
  try {
    const physicalWorkspace = resolve(temporaryRoot, 'physical')
    const linkedWorkspace = resolve(temporaryRoot, 'linked')
    mkdirSync(physicalWorkspace)
    symlinkSync(physicalWorkspace, linkedWorkspace, 'dir')
    const result = spawnSync(process.execPath, [
      'scripts/learning.mjs', 'record',
      '--profile', 'headless',
      '--statement', 'Use pnpm for installs.',
      '--scope', 'workspace', '--workspace-id', linkedWorkspace,
      '--keyword', 'install',
    ], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, DSH_LEARNING_STORE: resolve(temporaryRoot, 'store.json') },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout).scope.workspaceId, realpathSync(physicalWorkspace))
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
