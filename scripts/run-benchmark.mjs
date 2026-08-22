import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { validateLiveSemanticResult } from '../benchmark/evaluator.js'
import { evaluateScenarioSuite } from '../benchmark/scenario-evaluator.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modeIndex = process.argv.indexOf('--mode')
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : 'acceptance'
const refreshEvidence = process.argv.includes('--refresh-evidence')
if (!['baseline', 'acceptance'].includes(mode)) throw new Error(`unknown mode: ${mode}`)

const manifest = JSON.parse(await readFile(resolve(root, 'fixtures/manifest.json'), 'utf8'))
validateManifest(manifest)

let product
let importFailure
try {
  product = await import(pathToFileURL(resolve(root, 'src/index.js')).href)
} catch (error) {
  importFailure = error
}

const requiredExports = [
  'createLearningStore',
  'recallLearning',
  'buildLearningMessage',
  'reconstructLearningDelivery',
]
const missingExports = product
  ? requiredExports.filter(name => typeof product[name] !== 'function')
  : requiredExports

const productAvailable = importFailure === undefined && missingExports.length === 0
const caseResults = []
let liveSemantic
try {
  liveSemantic = JSON.parse(await readFile(resolve(root, 'benchmark/results/live-semantic.json'), 'utf8'))
} catch {
  liveSemantic = undefined
}

const operations = {
  async lifecycle(api, fixture) {
    const store = await temporaryStore(api, fixture.id)
    const item = await store.record({ ...fixture.item, profileId: 'profile-a' })
    const context = contextFor(fixture.prompt)
    const before = api.recallLearning({ items: await store.list(), ...context })
    await store.adopt(item.id)
    const after = api.recallLearning({ items: await store.list(), ...context })
    const pass = before.length === fixture.expected.beforeAdopt && after.length === fixture.expected.afterAdopt
    return { pass, details: { itemId: item.id, before: before.length, after: after.length } }
  },
  async scope(api, fixture) {
    const store = await temporaryStore(api, fixture.id)
    const base = {
      statement: 'Use pnpm for dependency installs.',
      profileId: 'profile-a',
      trigger: { keywordGroups: [['install'], ['dependencies']], exclusions: [] },
    }
    const workspaceItem = await store.record({ ...base, scope: { level: 'workspace', workspaceId: 'workspace-alpha' } })
    await store.adopt(workspaceItem.id)
    const sessionItem = await store.record({ ...base, statement: 'Use the quiet install flag.', scope: { level: 'session', sessionId: 'session-a' } })
    await store.adopt(sessionItem.id)
    const prompt = 'Install the dependencies.'
    const items = await store.list()
    const activeWorkspaceItem = items.find(item => item.id === workspaceItem.id)
    const activeSessionItem = items.find(item => item.id === sessionItem.id)
    const sameWorkspace = api.recallLearning({ items: [activeWorkspaceItem], ...contextFor(prompt) }).length
    const otherWorkspace = api.recallLearning({ items: [activeWorkspaceItem], ...contextFor(prompt), workspaceId: 'workspace-beta' }).length
    const sameSession = api.recallLearning({ items: [activeSessionItem], ...contextFor(prompt) }).length
    const otherSession = api.recallLearning({ items: [activeSessionItem], ...contextFor(prompt), sessionId: 'session-b' }).length
    const actual = { sameWorkspace, otherWorkspace, sameSession, otherSession }
    return { pass: JSON.stringify(actual) === JSON.stringify(fixture.expected), details: actual }
  },
  async override(api, fixture) {
    const item = adoptedFixtureItem()
    const recalled = api.recallLearning({ items: [item], ...contextFor(fixture.prompt) })
    return { pass: recalled.length === fixture.expected.recalled, details: { recalled: recalled.length } }
  },
  async adjacent_negative(api, fixture) {
    const recalled = api.recallLearning({ items: [adoptedFixtureItem()], ...contextFor(fixture.prompt) })
    return { pass: recalled.length === fixture.expected.recalled, details: { recalled: recalled.length } }
  },
  async log_reconstruction(api, fixture) {
    const item = adoptedFixtureItem()
    const message = api.buildLearningMessage({ recalled: [item], lane: fixture.expected.lane })
    const delivery = api.reconstructLearningDelivery([{ type: 'user/message', message }])
    const actual = { sourceKind: message.source?.kind, itemCount: delivery.items?.length, lane: delivery.lane }
    return { pass: JSON.stringify(actual) === JSON.stringify(fixture.expected), details: actual }
  },
  async headless_candidate(api, fixture) {
    const store = await temporaryStore(api, fixture.id)
    const item = await store.record({
      statement: 'Use pnpm for dependency installs.',
      profileId: 'profile-a',
      scope: { level: 'workspace', workspaceId: 'workspace-alpha' },
      trigger: { keywordGroups: [['install'], ['dependencies']], exclusions: [] },
      surface: 'headless',
    })
    const recalled = api.recallLearning({ items: await store.list(), ...contextFor('Install the dependencies.') })
    const actual = { lifecycle: item.lifecycle, recalled: recalled.length }
    return { pass: JSON.stringify(actual) === JSON.stringify(fixture.expected), details: actual }
  },
  async lminus_lplus(api, fixture) {
    const item = adoptedFixtureItem()
    const recalled = api.recallLearning({ items: [item], ...contextFor(fixture.prompt) })
    const message = api.buildLearningMessage({ recalled, lane: 'pre-step' })
    const lminusCommand = simulateConsumer(fixture.prompt)
    const lplusCommand = simulateConsumer(fixture.prompt, message)
    const actual = { lminusCommand, lplusCommand, different: lminusCommand !== lplusCommand }
    return { pass: JSON.stringify(actual) === JSON.stringify(fixture.expected), details: actual }
  },
  async assembled_transcript(_api, fixture) {
    const path = resolve(root, 'benchmark/results/assembled-transcript.json')
    let transcript
    try {
      transcript = JSON.parse(await readFile(path, 'utf8'))
    } catch {
      return { pass: false, details: 'ASSEMBLED_TRANSCRIPT_MISSING' }
    }
    const pass = transcript.profile === fixture.expected.profile
      && transcript.loggedSourceKind === fixture.expected.loggedSourceKind
      && transcript.observableDifference === fixture.expected.observableDifference
      && transcript.dshVersion === '0.1.0-rc.8'
      && transcript.target?.dshCommit === manifest.sourceState.dshCommit
      && transcript.arms?.lminus?.exitStatus === 0
      && transcript.arms?.lminus?.lifecycle === 'candidate'
      && transcript.arms?.lminus?.learningInjections === 0
      && transcript.arms?.lplus?.exitStatus === 0
      && transcript.arms?.lplus?.lifecycle === 'active'
      && transcript.arms?.lplus?.learningInjections === 1
      && typeof transcript.recordedItemId === 'string'
      && transcript.recordedItemId === transcript.adoptedItemId
      && transcript.reconstruct?.itemCount === 1
      && transcript.reconstruct?.itemIds?.length === 1
      && transcript.reconstruct.itemIds[0] === transcript.recordedItemId
      && transcript.reconstruct?.deliveries?.length === 1
      && transcript.reconstruct.deliveries[0]?.itemId === transcript.recordedItemId
      && transcript.arms?.otherProfile?.exitStatus === 0
      && transcript.arms?.otherProfile?.learningInjections === 0
      && transcript.explicitInstructionOverrides?.length === 5
      && transcript.explicitInstructionOverrides.every(item => item.exitStatus === 0
        && item.learningInjections === 0
        && item.finalResponse === item.expected)
      && transcript.verification?.externalLogRead === true
      && transcript.verification?.manualCliAndPluginSharedStore === true
    return { pass, details: transcript }
  },
  async common_user_scenarios(api, fixture) {
    const suite = JSON.parse(await readFile(resolve(root, fixture.suite), 'utf8'))
    const result = await evaluateScenarioSuite({
      api,
      suite,
      createStore: scenario => temporaryStore(api, `scenario-${scenario.id}`),
    })
    return {
      pass: result.overall === 'PASS'
        && result.scenarioCount === fixture.expected.scenarioCount
        && result.probeCount === fixture.expected.probeCount
        && result.passedProbeCount === fixture.expected.passedProbeCount,
      details: result,
    }
  },
}

if (productAvailable) {
  for (const fixture of manifest.cases) {
    caseResults.push(await runCase(product, fixture))
  }
} else {
  for (const fixture of manifest.cases) {
    caseResults.push({
      id: fixture.id,
      layer: fixture.layer,
      status: fixture.layer === 'end_to_end_consumer' ? 'UNPROVEN' : 'FAIL',
      outcomeClass: fixture.layer === 'end_to_end_consumer'
        ? 'transport_or_infrastructure'
        : 'unsafe_or_incorrect',
      evidence: 'IMPLEMENTATION_MISSING',
      retries: 0,
    })
  }
}

const liveValidation = validateLiveSemanticResult(liveSemantic, manifest.sourceState.dshCommit)
const layerResults = summarizeLayers(caseResults, productAvailable)
const requiredCasesPass = caseResults
  .filter(result => manifest.cases.find(fixture => fixture.id === result.id)?.required)
  .every(result => result.status === 'PASS')
const liveGatePass = liveValidation.pass

const report = {
  schemaVersion: 1,
  suiteId: manifest.suiteId,
  mode,
  sourceState: manifest.sourceState,
  implementation: {
    available: productAvailable,
    missingExports,
    importErrorCode: importFailure?.code ?? (importFailure ? importFailure.name : null),
  },
  retryPolicy: manifest.retryPolicy,
  cases: caseResults,
  layers: layerResults,
  liveSemantic: liveSemantic ?? { overall: 'UNPROVEN', evidence: 'LIVE_SEMANTIC_RESULT_MISSING' },
  liveSemanticValidation: liveValidation,
  overall: requiredCasesPass && liveGatePass ? 'PASS'
    : (!productAvailable || liveSemantic === undefined ? 'UNPROVEN' : 'FAIL'),
}

const outputPath = resolve(root, 'benchmark/results', mode === 'baseline' ? 'baseline.json' : 'acceptance.json')
if (refreshEvidence) {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
}

console.log(JSON.stringify({
  mode,
  manifest: 'PASS',
  implementation: productAvailable ? 'PRESENT' : 'MISSING',
  cases: Object.fromEntries(caseResults.map(result => [result.id, result.status])),
  overall: report.overall,
  evidence: refreshEvidence ? `updated ${outputPath}` : 'validated without modifying checked-in evidence',
}, null, 2))

if (mode === 'baseline') {
  if (productAvailable || !caseResults.some(result => result.evidence === 'IMPLEMENTATION_MISSING')) process.exitCode = 1
} else if (!requiredCasesPass || !liveGatePass) {
  process.exitCode = 1
}

function validateManifest(value) {
  if (value.schemaVersion !== 1) throw new Error('manifest schemaVersion must be 1')
  if (!Array.isArray(value.cases) || value.cases.length < 9) throw new Error('manifest must contain at least nine cases')
  const ids = new Set()
  for (const fixture of value.cases) {
    if (typeof fixture.id !== 'string' || ids.has(fixture.id)) throw new Error(`invalid or duplicate fixture id: ${fixture.id}`)
    ids.add(fixture.id)
    if (!['deterministic_replay', 'stage_fixture', 'end_to_end_consumer'].includes(fixture.layer)) {
      throw new Error(`unknown layer for ${fixture.id}`)
    }
    if (fixture.required !== true) throw new Error(`fixture ${fixture.id} must state required: true`)
  }
  if (value.retryPolicy.deterministic !== 0 || value.retryPolicy.semanticDecision !== 0) {
    throw new Error('semantic decisions and deterministic cases cannot retry')
  }
}

async function runCase(api, fixture) {
  try {
    const evidence = await operations[fixture.operation](api, fixture)
    return {
      id: fixture.id,
      layer: fixture.layer,
      status: evidence.pass ? 'PASS' : 'FAIL',
      outcomeClass: evidence.pass ? 'pass' : 'unsafe_or_incorrect',
      evidence: evidence.details,
      retries: 0,
    }
  } catch (error) {
    return {
      id: fixture.id,
      layer: fixture.layer,
      status: 'FAIL',
      outcomeClass: 'invalid_structure',
      evidence: `${error.name}: ${error.message}`,
      retries: 0,
    }
  }
}


async function temporaryStore(api, id) {
  const path = resolve(root, '.tmp', `${id}.json`)
  await mkdir(dirname(path), { recursive: true })
  return api.createLearningStore({ filePath: path, reset: true })
}

function contextFor(prompt) {
  return { prompt, profileId: 'profile-a', workspaceId: 'workspace-alpha', sessionId: 'session-a' }
}

function adoptedFixtureItem() {
  return {
    id: 'fixture-learning-item',
    lifecycle: 'active',
    profileId: 'profile-a',
    statement: 'For JavaScript dependency installs in this workspace, use pnpm instead of npm.',
    scope: { level: 'workspace', workspaceId: 'workspace-alpha' },
    trigger: {
      keywordGroups: [['install'], ['dependencies', 'packages']],
      exclusions: ['explicitly use npm', 'use npm install'],
      overrideTerms: ['npm', 'yarn', 'bun'],
    },
  }
}

function simulateConsumer(_prompt, learningMessage) {
  const text = learningMessage?.content?.map(part => part.type === 'text' ? part.text : '').join('\n') ?? ''
  return /use pnpm instead of npm/i.test(text) ? 'pnpm install' : 'npm install'
}

function summarizeLayers(results, productAvailable) {
  const statusFor = layer => {
    const selected = results.filter(result => result.layer === layer)
    if (selected.length === 0) return 'UNPROVEN'
    return selected.every(result => result.status === 'PASS') ? 'PASS' : (productAvailable ? 'FAIL' : 'UNPROVEN')
  }
  return {
    deterministicReplay: statusFor('deterministic_replay'),
    stageFixtureCoverage: statusFor('stage_fixture'),
    promptClauseAblation: productAvailable ? 'PASS — no production semantic prompt clause in Stage 0+1 core' : 'UNPROVEN',
    stochasticSemanticGate: liveValidation.status,
    unsafeOutputEvidence: liveValidation.counts.unsafeOrIncorrect === 0 && liveValidation.counts.semanticDecisions === 6
      ? 'PASS'
      : (liveValidation.counts.semanticDecisions < 6 ? 'UNPROVEN' : 'FAIL'),
    invalidStructureReliability: `REPORTED — ${liveValidation.counts.invalidStructure} invalid-structure attempts`,
    transportReliability: `REPORTED — ${liveValidation.counts.transport} transport attempts`,
    aggregateCanary: 'UNPROVEN',
    sealedHoldout: 'UNPROVEN — no separate identity or access boundary',
    endToEndConsumer: statusFor('end_to_end_consumer'),
  }
}
