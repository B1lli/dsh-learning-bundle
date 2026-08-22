import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const manifest = JSON.parse(await readFile(new URL('../fixtures/manifest.json', import.meta.url), 'utf8'))

test('manifest preregisters every required MVP behavior', () => {
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.cases.length, 8)
  assert.deepEqual(new Set(manifest.cases.map(entry => entry.operation)), new Set([
    'lifecycle',
    'scope',
    'override',
    'adjacent_negative',
    'log_reconstruction',
    'headless_candidate',
    'lminus_lplus',
    'assembled_transcript',
  ]))
  assert.ok(manifest.cases.every(entry => entry.required === true))
})

test('retry policy cannot select among semantic decisions', () => {
  assert.equal(manifest.retryPolicy.deterministic, 0)
  assert.equal(manifest.retryPolicy.semanticDecision, 0)
  assert.equal(manifest.retryPolicy.semanticTransportOrInvalidStructure, 1)
  assert.equal(manifest.retryPolicy.initialConcurrency, 1)
  assert.ok(manifest.retryPolicy.maximumConcurrency <= 3)
})
