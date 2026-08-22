import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

import { evaluateScenarioSuite, SCENARIO_PROBE_IDS, validateScenarioSuite } from '../benchmark/scenario-evaluator.js'
import * as api from '../src/index.js'

const root = resolve(import.meta.dirname, '..')
const suite = JSON.parse(readFileSync(resolve(root, 'fixtures/scenarios.json'), 'utf8'))

test('the public scenario dataset has eight distinct user situations and nine product probes each', async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'dsh-scenarios-'))
  try {
    const result = await evaluateScenarioSuite({
      api,
      suite,
      createStore: scenario => api.createLearningStore({
        filePath: join(temporaryRoot, `${scenario.id}.json`),
        reset: true,
      }),
    })
    assert.equal(result.scenarioCount, 8)
    assert.equal(result.probeCount, 72)
    assert.equal(result.passedProbeCount, 72)
    assert.equal(result.overall, 'PASS')
    assert.equal(new Set(result.scenarios.map(item => item.stratum)).size, 8)
    for (const scenario of result.scenarios) {
      assert.equal(scenario.status, 'PASS', scenario.id)
      assert.deepEqual(scenario.probes.map(probe => probe.id), SCENARIO_PROBE_IDS)
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('scenario schema rejects duplicated ids and undersized suites', () => {
  assert.throws(() => validateScenarioSuite({ ...suite, scenarios: suite.scenarios.slice(0, 7) }), /at least eight/)
  assert.throws(() => validateScenarioSuite({
    ...suite,
    scenarios: [suite.scenarios[0], suite.scenarios[0], ...suite.scenarios.slice(2)],
  }), /duplicate scenario id/)
  const duplicatedSemantics = structuredClone(suite)
  duplicatedSemantics.scenarios[1] = {
    ...structuredClone(duplicatedSemantics.scenarios[0]),
    id: 'different-id',
    stratum: 'different-label',
    audience: 'Different label',
    pain: 'Different label',
  }
  assert.throws(() => validateScenarioSuite(duplicatedSemantics), /duplicate semantic scenario/)
})

test('scenario evaluator fails when a required paraphrase no longer recalls', async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'dsh-scenarios-red-'))
  try {
    const broken = structuredClone(suite)
    broken.scenarios[0].trigger.keywordGroups = [['impossible-trigger']]
    const result = await evaluateScenarioSuite({
      api,
      suite: broken,
      createStore: scenario => api.createLearningStore({
        filePath: join(temporaryRoot, `${scenario.id}.json`),
        reset: true,
      }),
    })
    assert.equal(result.overall, 'FAIL')
    assert.equal(result.scenarios[0].status, 'FAIL')
    assert.equal(result.scenarios[0].probes.find(probe => probe.id === 'active-paraphrase').status, 'FAIL')
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('the default scenario benchmark is read-only', () => {
  const evidencePath = resolve(root, 'benchmark/results/scenarios.json')
  const before = readFileSync(evidencePath, 'utf8')
  const result = spawnSync(process.execPath, ['scripts/run-scenario-benchmark.mjs'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(readFileSync(evidencePath, 'utf8'), before)
  assert.match(result.stdout, /72\/72/)
  assert.match(result.stdout, /validated without modifying checked-in evidence/)
})
