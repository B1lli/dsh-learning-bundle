import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { evaluateLiveSamples, LIVE_LEARNED_COMMAND, LIVE_PROMPT, validateLiveSemanticResult } from '../benchmark/evaluator.js'
import { apply as applyPlugin, extractDirectUserPrompt } from '../lib/index.js'

import {
  buildLearningMessage,
  createLearningStore,
  recallLearning,
  reconstructLearningDelivery,
  resolveDshProfileId,
  resolveLearningStorePath,
} from '../src/index.js'

const dir = mkdtempSync(join(tmpdir(), 'dsh-learning-'))
const fixtureItem = () => ({
  id: 'fixture-learning-item',
  lifecycle: 'active',
  profileId: 'profile-a',
  statement: 'For JavaScript dependency installs in this workspace, use pnpm instead of npm.',
  scope: { level: 'workspace', workspaceId: 'workspace-alpha' },
  trigger: {
    keywordGroups: [['install', 'installs', 'installed', 'installing'], ['dependencies', 'packages']],
    exclusions: ['explicitly use npm', 'use npm install'],
    overrideTerms: ['npm', 'yarn', 'bun'],
  },
})

const context = (prompt, overrides = {}) => ({
  prompt,
  profileId: 'profile-a',
  workspaceId: 'workspace-alpha',
  sessionId: 'session-a',
  ...overrides,
})

test('candidate never recalls; explicit adopt enables recall', () => {
  const store = createLearningStore({ filePath: join(dir, 'lifecycle.json'), reset: true })
  const item = store.record({
    profileId: 'profile-a',
    statement: 'Use pnpm for dependency installs.',
    scope: { level: 'workspace', workspaceId: 'workspace-alpha' },
    trigger: { keywordGroups: [['install'], ['dependencies']], exclusions: [] },
  })
  assert.equal(item.lifecycle, 'candidate')
  assert.equal(recallLearning({ items: store.list(), ...context('Install the dependencies.') }).length, 0)
  store.adopt(item.id)
  assert.equal(recallLearning({ items: store.list(), ...context('Install the dependencies.') }).length, 1)
})

test('workspace and session scopes are isolated', () => {
  const workspaceItem = fixtureItem()
  const sessionItem = {
    ...fixtureItem(),
    id: 'fixture-session-item',
    statement: 'Use the quiet install flag.',
    scope: { level: 'session', sessionId: 'session-a' },
  }
  assert.equal(recallLearning({ items: [workspaceItem], ...context('Install the dependencies.') }).length, 1)
  assert.equal(recallLearning({ items: [workspaceItem], ...context('Install the dependencies.', { workspaceId: 'workspace-beta' }) }).length, 0)
  assert.equal(recallLearning({ items: [sessionItem], ...context('Install the dependencies.') }).length, 1)
  assert.equal(recallLearning({ items: [sessionItem], ...context('Install the dependencies.', { sessionId: 'session-b' }) }).length, 0)
})

test('malformed or unidentified scopes fail closed', () => {
  const missingWorkspace = { ...fixtureItem(), scope: { level: 'workspace' } }
  const unknownScope = { ...fixtureItem(), scope: { level: 'everywhere' } }
  const missingProfileAndScope = { ...fixtureItem(), profileId: undefined, scope: undefined }
  const emptyScope = { ...fixtureItem(), scope: {} }
  const profileScopeWithoutProfile = { ...fixtureItem(), profileId: undefined, scope: { level: 'profile' } }
  const missingTrigger = { ...fixtureItem(), trigger: undefined }
  assert.equal(recallLearning({ items: [missingWorkspace], ...context('Install the dependencies.') }).length, 0)
  assert.equal(recallLearning({ items: [unknownScope], ...context('Install the dependencies.') }).length, 0)
  assert.equal(recallLearning({ items: [missingProfileAndScope], ...context('Install the dependencies.') }).length, 0)
  assert.equal(recallLearning({ items: [emptyScope], ...context('Install the dependencies.') }).length, 0)
  assert.equal(recallLearning({ items: [profileScopeWithoutProfile], ...context('Install the dependencies.') }).length, 0)
  assert.equal(recallLearning({ items: [missingTrigger], ...context('Install the dependencies.') }).length, 0)
})

test('record rejects learning items without durable isolation identity', () => {
  const store = createLearningStore({ filePath: join(dir, 'invalid-record.json'), reset: true })
  assert.throws(() => store.record({ statement: 'x', scope: { level: 'profile' } }), /profileId/)
  assert.throws(() => store.record({ statement: 'x', profileId: 'p' }), /scope/)
  assert.throws(() => store.record({ statement: 'x', profileId: 'p', scope: {} }), /scope must/)
  assert.throws(() => store.record({ statement: 'x', profileId: 'p', scope: { level: 'profile' } }), /trigger keyword group/)
})

test('explicit current instruction overrides a learned default', () => {
  const recalled = recallLearning({
    items: [fixtureItem()],
    ...context('For this task, explicitly use npm install for the dependencies.'),
  })
  assert.equal(recalled.length, 0)
})

test('natural npm and Yarn choices override the learned default', () => {
  for (const prompt of [
    'For this task, use Yarn to install the dependencies.',
    'Install the dependencies with npm for this task.',
    'Run npm install for the dependencies.',
    'Run yarn install for the dependencies.',
    'Please execute npm install for the dependencies.',
  ]) {
    assert.equal(recallLearning({ items: [fixtureItem()], ...context(prompt) }).length, 0)
  }
})

test('adjacent negative prompt does not recall', () => {
  const recalled = recallLearning({
    items: [fixtureItem()],
    ...context('Explain how npm package-lock format records dependency integrity.'),
  })
  assert.equal(recalled.length, 0)
})

test('explicit keyword alternatives cover ordinary English word forms', () => {
  const recalled = recallLearning({
    items: [fixtureItem()],
    ...context('Return one command that installs the JavaScript dependencies.'),
  })
  assert.equal(recalled.length, 1)

  for (const [keywords, prompt] of [
    [['use', 'uses', 'used', 'using'], 'The project is using this convention.'],
    [['copy', 'copies', 'copied', 'copying'], 'The script copies the fixture.'],
    [['watch', 'watches', 'watched', 'watching'], 'The runner watches the file.'],
    [['plan', 'plans', 'planned', 'planning'], 'The team planned the release.'],
  ]) {
    const item = { ...fixtureItem(), trigger: { keywordGroups: [keywords], exclusions: [] } }
    assert.equal(recallLearning({ items: [item], ...context(prompt) }).length, 1, `${keywords}: ${prompt}`)
  }
})

test('developer tokens with ASCII punctuation match triggers and overrides', () => {
  for (const token of ['c++', 'C#', '@scope/pkg', '--frozen-lockfile', '.env']) {
    const item = {
      ...fixtureItem(),
      trigger: { keywordGroups: [[token]], exclusions: [], overrideTerms: [] },
    }
    assert.equal(
      recallLearning({ items: [item], ...context(`Use ${token} for this task.`) }).length,
      1,
      `trigger: ${token}`,
    )

    const overrideItem = {
      ...fixtureItem(),
      trigger: { keywordGroups: [['install'], ['dependencies']], exclusions: [], overrideTerms: [token] },
    }
    assert.equal(
      recallLearning({ items: [overrideItem], ...context(`Install the dependencies with ${token}.`) }).length,
      0,
      `override: ${token}`,
    )
  }
})

test('non-Latin trigger keywords use Unicode-safe substring matching', () => {
  const item = {
    ...fixtureItem(),
    trigger: { keywordGroups: [['安装'], ['依赖']], exclusions: [] },
  }
  assert.equal(recallLearning({ items: [item], ...context('请安装项目依赖。') }).length, 1)
})

test('an existing store observes adoption performed by another process/store instance', () => {
  const path = join(dir, 'refresh.json')
  const reader = createLearningStore({ filePath: path, reset: true })
  const writer = createLearningStore({ filePath: path })
  const item = writer.record({ ...fixtureItem(), lifecycle: undefined })
  writer.adopt(item.id)
  assert.equal(reader.list()[0].lifecycle, 'active')
})

test('invalid store JSON fails loudly instead of being overwritten', () => {
  const path = join(dir, 'invalid.json')
  writeFileSync(path, '{not json}\n')
  assert.throws(() => createLearningStore({ filePath: path }), SyntaxError)
})

test('active profile identity comes from dsh launcher arguments', () => {
  assert.equal(resolveDshProfileId(['--profile', 'headless'], {}), 'headless')
  assert.equal(resolveDshProfileId(['web'], {}), 'web')
  assert.equal(resolveDshProfileId([], { DSH_PROFILE_ID: 'custom' }), 'custom')
  assert.equal(resolveDshProfileId(['--profile', 'headless'], { DSH_PROFILE_ID: 'web' }), 'headless')
  assert.throws(() => resolveDshProfileId([], {}), /active profile is unavailable/)
})

test('CLI and plugin share the dsh-home store default', () => {
  assert.equal(
    resolveLearningStorePath({ DSH_HOME: '/tmp/dsh-home-test' }),
    '/tmp/dsh-home-test/dsh-learning-store.json',
  )
  assert.equal(
    resolveLearningStorePath({ DSH_LEARNING_STORE: '/tmp/explicit-learning.json' }),
    '/tmp/explicit-learning.json',
  )
})

test('headless recording stays candidate and never auto-activates', () => {
  const store = createLearningStore({ filePath: join(dir, 'headless.json'), reset: true })
  const item = store.record({
    profileId: 'profile-a',
    statement: 'Use pnpm for dependency installs.',
    scope: { level: 'workspace', workspaceId: 'workspace-alpha' },
    trigger: { keywordGroups: [['install'], ['dependencies']], exclusions: [] },
    surface: 'headless',
  })
  assert.equal(item.lifecycle, 'candidate')
  assert.equal(recallLearning({ items: store.list(), ...context('Install the dependencies.') }).length, 0)
})

test('buildLearningMessage carries the recall source and reconstructs delivery', () => {
  const message = buildLearningMessage({ recalled: [fixtureItem()], lane: 'pre-step' })
  assert.equal(message.role, 'user')
  assert.equal(message.source.kind, 'dsh-learning-recall')
  assert.ok(message.content[0].text.includes('use pnpm instead of npm'))
  const delivery = reconstructLearningDelivery([{ type: 'user/message', message }])
  assert.deepEqual(delivery.items, ['fixture-learning-item'])
  assert.equal(delivery.lane, 'pre-step')
  assert.deepEqual(delivery.deliveries, [{
    itemId: 'fixture-learning-item',
    profileId: 'profile-a',
    scope: { level: 'workspace', workspaceId: 'workspace-alpha' },
  }])
})

test('multi-item delivery preserves the scope of every recalled rule', () => {
  const recalled = [
    fixtureItem(),
    { ...fixtureItem(), id: 'profile-rule', scope: { level: 'profile' } },
    { ...fixtureItem(), id: 'session-rule', scope: { level: 'session', sessionId: 'session-a' } },
  ]
  const message = buildLearningMessage({ recalled, lane: 'pre-step' })
  const delivery = reconstructLearningDelivery([{ type: 'user/message', data: message }])
  assert.deepEqual(delivery.items, ['fixture-learning-item', 'profile-rule', 'session-rule'])
  assert.deepEqual(delivery.deliveries.map(entry => entry.scope), [
    { level: 'workspace', workspaceId: 'workspace-alpha' },
    { level: 'profile' },
    { level: 'session', sessionId: 'session-a' },
  ])
})

test('plugin follows final direct-user messages and ignores tool-only later steps', async () => {
  const direct = { source: { kind: 'user' }, content: [{ type: 'text', text: 'Run npm install for the dependencies.' }] }
  const tool = { source: { kind: 'tool' }, content: [{ type: 'text', text: 'install the dependencies' }] }
  assert.equal(extractDirectUserPrompt([direct, tool]), direct.content[0].text)
  assert.equal(extractDirectUserPrompt([tool]), '')

  const path = join(dir, 'tool-step.json')
  const store = createLearningStore({ filePath: path, reset: true })
  const item = store.record({ ...fixtureItem(), lifecycle: undefined })
  store.adopt(item.id)
  let listener
  applyPlugin({ on(_event, callback) { listener = callback } }, { storePath: path, profileId: 'profile-a' })
  const decision = { kind: 'enter', messages: [tool] }
  const result = await listener({
    agent: { id: 'session-a', session: { header: { cwd: 'workspace-alpha' } } },
    messages: [tool],
  }, async () => decision)
  assert.equal(result, decision)
  assert.equal(result.messages.some(message => message.source?.kind === 'dsh-learning-recall'), false)

  const original = { source: { kind: 'user' }, content: [{ type: 'text', text: 'Install the dependencies.' }] }
  const rewritten = { source: { kind: 'user' }, content: [{ type: 'text', text: 'Run npm install for the dependencies.' }] }
  const rewrittenDecision = { kind: 'enter', messages: [rewritten] }
  const rewriteResult = await listener({
    agent: { id: 'session-a', session: { header: { cwd: 'workspace-alpha' } } },
    messages: [original],
  }, async () => rewrittenDecision)
  assert.equal(rewriteResult, rewrittenDecision)
  assert.equal(rewriteResult.messages.some(message => message.source?.kind === 'dsh-learning-recall'), false)
})

test('reconstructLearningDelivery reads the durable log data shape too', () => {
  const message = buildLearningMessage({ recalled: [fixtureItem()], lane: 'pre-step' })
  const delivery = reconstructLearningDelivery([{ type: 'user/message', data: message }])
  assert.deepEqual(delivery.items, ['fixture-learning-item'])
  assert.equal(delivery.lane, 'pre-step')
})

test('live evaluator rejects arbitrary commands and bogus install flags', () => {
  for (const bad of ['yarn garbage', 'yarn remove lodash', 'pnpm install --not-a-real-option', 'bun install --not-a-real-option', 'echo nope']) {
    const samples = semanticSamples()
    samples[0].attempts[0].command = bad
    samples[0].decision.command = bad
    const result = evaluateLiveSamples(samples)
    assert.equal(result.pass, false, bad)
    assert.equal(result.counts.unsafeOrIncorrect, 1, bad)
  }
})

test('live evaluator classifies markdown-wrapped output as structural and preserves the capped retry', () => {
  const samples = semanticSamples()
  const first = samples.find(entry => entry.arm === 'lplus' && entry.sample === 1)
  const invalid = {
    ...first.attempts[0],
    command: `\`${LIVE_LEARNED_COMMAND}\``,
    outcomeClass: 'invalid_structure',
  }
  const retry = { ...first.attempts[0], attempt: 2, sessionFile: '/tmp/lplus-1-retry/session.jsonl.zstd' }
  first.attempts = [invalid, retry]
  first.decision = { ...retry }
  const result = evaluateLiveSamples(samples)
  assert.equal(result.pass, true)
  assert.equal(result.counts.invalidStructure, 1)
  assert.equal(result.counts.retries, 1)

  invalid.outcomeClass = 'semantic_decision'
  assert.equal(evaluateLiveSamples(samples).pass, false)
})

test('live evaluator rejects inconsistent summaries by recomputing attempts', async () => {
  const samples = semanticSamples()
  const evaluated = evaluateLiveSamples(samples)
  const stored = {
    schema: 'dsh-learning/live-semantic-v1',
    runtime: {
      dshVersion: '0.1.0-rc.8',
      dshCommit: 'expected',
      profile: 'headless',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    },
    samples,
    counts: { ...evaluated.counts, redSamples: 99 },
    layers: { stochasticSemanticGate: 'PASS', unsafeOutputEvidence: 'PASS' },
    overall: 'PASS',
  }
  const validation = validateLiveSemanticResult(stored, 'expected')
  assert.equal(validation.pass, false)
  assert.equal(validation.status, 'FAIL')
})

test('live release gate validates delivered identity, embedded log evidence, and target model', () => {
  const result = validLiveResult(semanticSamples())
  assert.equal(validateLiveSemanticResult(result, 'expected').pass, true)

  const missingIds = structuredClone(result)
  missingIds.samples[3].attempts[0].deliveredItemIds = []
  missingIds.samples[3].decision.deliveredItemIds = []
  assert.equal(validateLiveSemanticResult(missingIds, 'expected').pass, false)

  const missingLogEvidence = structuredClone(result)
  missingLogEvidence.samples[3].attempts[0].sessionEvidence.learningMessages = []
  missingLogEvidence.samples[3].decision.sessionEvidence.learningMessages = []
  assert.equal(validateLiveSemanticResult(missingLogEvidence, 'expected').pass, false)

  const wrongModel = structuredClone(result)
  wrongModel.runtime.model = 'not-a-real-model'
  assert.equal(validateLiveSemanticResult(wrongModel, 'expected').pass, false)

  const reusedSessions = structuredClone(result)
  for (const sample of reusedSessions.samples) {
    sample.attempts[0].sessionFile = '/tmp/reused/session.jsonl.zstd'
    sample.decision.sessionFile = '/tmp/reused/session.jsonl.zstd'
  }
  assert.equal(validateLiveSemanticResult(reusedSessions, 'expected').pass, false)
})

function validLiveResult(samples) {
  const evaluation = evaluateLiveSamples(samples)
  return {
    schema: 'dsh-learning/live-semantic-v1',
    preregistration: {
      prompt: LIVE_PROMPT,
      expectedLearnedCommand: LIVE_LEARNED_COMMAND,
      samplesPerArm: 3,
      maxRetryForTransportOrInvalidStructure: 1,
      semanticDecisionRetries: 0,
    },
    runtime: {
      dshVersion: '0.1.0-rc.8',
      dshCommit: 'expected',
      profile: 'headless',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    },
    samples,
    counts: evaluation.counts,
    layers: { stochasticSemanticGate: evaluation.status, unsafeOutputEvidence: 'PASS' },
    overall: evaluation.status,
  }
}

function semanticSamples() {
  const samples = []
  for (const arm of ['lminus', 'lplus']) {
    for (let sample = 1; sample <= 3; sample += 1) {
      const decision = {
        arm,
        sample,
        attempt: 1,
        outcomeClass: 'semantic_decision',
        exitStatus: 0,
        command: arm === 'lplus' ? LIVE_LEARNED_COMMAND : 'npm install',
        stderrSummary: '',
        learningInjectionCount: arm === 'lplus' ? 1 : 0,
        deliveredItemIds: arm === 'lplus' ? ['item'] : [],
        sessionFile: `/tmp/${arm}-${sample}/session.jsonl.zstd`,
        sessionEvidence: {
          readSucceeded: true,
          eventCount: 3,
          learningMessages: arm === 'lplus'
            ? [{ type: 'user/message', data: { source: { kind: 'dsh-learning-recall', itemIds: ['item'] } } }]
            : [],
        },
      }
      samples.push({ arm, sample, attempts: [{ ...decision }], decision: { ...decision } })
    }
  }
  return samples
}

test.after(() => {
  rmSync(dir, { recursive: true, force: true })
})
