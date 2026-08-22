import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluateScenarioSuite } from '../benchmark/scenario-evaluator.js'
import * as api from '../src/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const refreshEvidence = process.argv.includes('--refresh-evidence')
const suite = JSON.parse(await readFile(resolve(root, 'fixtures/scenarios.json'), 'utf8'))
const result = await evaluateScenarioSuite({
  api,
  suite,
  createStore: scenario => api.createLearningStore({
    filePath: resolve(root, '.tmp/scenarios', `${scenario.id}.json`),
    reset: true,
  }),
})

const outputPath = resolve(root, 'benchmark/results/scenarios.json')
if (refreshEvidence) {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`)
}

console.log(JSON.stringify({
  suiteId: result.suiteId,
  scenarios: `${result.scenarioCount}/${result.scenarioCount}`,
  probes: `${result.passedProbeCount}/${result.probeCount}`,
  overall: result.overall,
  evidence: refreshEvidence ? `updated ${outputPath}` : 'validated without modifying checked-in evidence',
}, null, 2))

if (result.overall !== 'PASS') process.exitCode = 1
