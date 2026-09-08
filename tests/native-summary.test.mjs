import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function summarize(report) {
  const dir = mkdtempSync(join(tmpdir(), 'native-summary-test-'))
  try {
    writeFileSync(join(dir, 'input.json'), JSON.stringify(report))
    const run = spawnSync(process.execPath, ['scripts/summarize-native-pilot.mjs', join(dir, 'input.json'), join(dir, 'output.json')], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    return JSON.parse(readFileSync(join(dir, 'output.json'), 'utf8'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
const spec = { kind: 'summary regression', model: 'fixture', tasks: [{ id: 'exception' }], acceptance: { commands: { exception: 'npm install' } } }

test('a successful new result does not inherit the earlier pilot failure or session count', () => {
  const out = summarize({ spec, status: 'COMPLETED', arms: [{ id: 'new-run', setup: [], runs: [{
    id: 'exception', status: 0, stdout: 'npm install', workspace: [], session: { usage: [{ inputTokens: 1, outputTokens: 1, totalTokens: 2 }] },
  }] }] })
  assert.deepEqual(out.arms[0].rawExact, { passed: 1, total: 1 })
  assert.equal(out.arms[0].observedSessions, 1)
  assert.equal(out.plannedSessionsPerArm, 2)
  assert.equal(out.notes.some(x => /Both arms failed|10 fresh sessions/.test(x)), false)
  assert.equal(out.dshVersion, null)
  assert.equal(out.arms[0].reportedTokens, 2)
  assert.equal(out.arms[0].cacheReadTokens, 0)
})

test('a stopped host run with no session log or artifact check remains reportable and unknown', () => {
  const out = summarize({ spec, status: 'STOPPED', error: 'Host failed', arms: [{ id: 'stopped', setup: [], runs: [{
    id: 'exception', status: 1, stdout: '', workspace: [], session: { readError: 'No durable session' },
  }] }] })
  assert.equal(out.error, 'Host failed')
  assert.equal(out.arms[0].reportedTokens, null)
  assert.equal(out.arms[0].mainModelCalls, null)
  assert.equal(out.arms[0].artifactCheck.status, 'UNPROVEN')
  assert.equal(out.arms[0].runs[0].sessionReadError, 'No durable session')
  assert.equal(out.arms[0].runs[0].rawExact, false)
})
