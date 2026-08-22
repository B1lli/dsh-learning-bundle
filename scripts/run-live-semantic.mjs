/**
 * Preregistered six-decision DeepSeek semantic gate: three L- candidate runs,
 * then three L+ runs after explicit adoption. Completed semantic decisions are
 * never retried. A transport or invalid-structure first attempt may retry once;
 * both attempts remain in the result.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateLiveSamples, isCommandStructureValid, LIVE_LEARNED_COMMAND, LIVE_PROMPT } from '../benchmark/evaluator.js'
import { createLearningStore, reconstructLearningDelivery } from '../src/index.js'
import { sanitizePublicEvidence } from './public-evidence.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dshHome = resolve(root, '.tmp/live-dsh-home')
const workDir = resolve(root, '.tmp/live-semantic')
const storePath = resolve(dshHome, 'dsh-learning-store.json')
const outputPath = resolve(root, 'benchmark/results/live-semantic.json')
const dshCliPath = process.env.DSH_CLI_PATH
const profile = 'headless'
const prompt = LIVE_PROMPT
const expectedLearnedCommand = LIVE_LEARNED_COMMAND
const env = { ...process.env, DSH_HOME: dshHome }

if (!process.env.DEEPSEEK_API_KEY) {
  console.error('DEEPSEEK_API_KEY must be supplied to this process; it is never written to results.')
  process.exit(2)
}

function runDsh(args) {
  const command = dshCliPath ? process.execPath : 'dsh'
  const commandArgs = dshCliPath ? [dshCliPath, ...args] : args
  const started = Date.now()
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: 'utf8', env })
  return {
    command: [command, ...commandArgs].join(' '),
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    durationMs: Date.now() - started,
  }
}

function resolveDshCommit() {
  const sourceRoot = resolveDshSourceRoot()
  if (!sourceRoot) return 'UNPROVEN'
  const result = spawnSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : 'UNPROVEN'
}

function resolveDshSourceRoot() {
  return process.env.DSH_SOURCE_ROOT
    ?? (dshCliPath ? resolve(dirname(dshCliPath), '../../..') : undefined)
}

function sessionFiles() {
  const files = []
  const walk = dir => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'session.jsonl.zstd') files.push(full)
    }
  }
  walk(join(dshHome, 'sessions'))
  return files
}

function readEvents(sessionFile) {
  if (!sessionFile) return []
  const result = spawnSync('zstdcat', [sessionFile], { encoding: 'utf8' })
  if (result.status !== 0) return []
  return result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
}

function normalizeCommand(text) {
  return String(text ?? '').trim()
}

function executeAttempt(arm, sample, attempt) {
  const before = new Set(sessionFiles())
  const run = runDsh(['--profile', profile, prompt])
  const sessionFile = sessionFiles().find(file => !before.has(file))
  const events = readEvents(sessionFile)
  const delivery = reconstructLearningDelivery(events)
  const learningMessages = events
    .filter(event => event.type === 'user/message' && event.data?.source?.kind === 'dsh-learning-recall')
    .map(event => ({ type: event.type, data: { source: event.data.source } }))
  const command = normalizeCommand(run.stdout)
  let outcomeClass = 'semantic_decision'
  if (run.status !== 0) outcomeClass = 'transport'
  else if (!isCommandStructureValid(command)) outcomeClass = 'invalid_structure'
  return {
    arm,
    sample,
    attempt,
    outcomeClass,
    exitStatus: run.status,
    durationMs: run.durationMs,
    command,
    stderrSummary: run.stderr.slice(0, 500),
    learningInjectionCount: delivery.items.length,
    deliveredItemIds: delivery.items,
    sessionFile,
    sessionEvidence: {
      readSucceeded: Boolean(sessionFile) && events.length > 0,
      eventCount: events.length,
      learningMessages,
    },
  }
}

function runSample(arm, sample) {
  const attempts = [executeAttempt(arm, sample, 1)]
  if (['transport', 'invalid_structure'].includes(attempts[0].outcomeClass)) {
    attempts.push(executeAttempt(arm, sample, 2))
  }
  const decision = attempts.find(attempt => attempt.outcomeClass === 'semantic_decision')
  return { arm, sample, attempts, decision: decision ?? null }
}

rmSync(dshHome, { recursive: true, force: true })
rmSync(workDir, { recursive: true, force: true })
mkdirSync(workDir, { recursive: true })

const install = runDsh(['plugin', '--profile', profile, 'add', '-w', root])
if (install.status !== 0) {
  throw new Error(`bundle install failed (${install.status}): ${install.stderr || install.stdout}`)
}
const dshVersion = runDsh(['--version']).stdout
const dshCommit = resolveDshCommit()
const config = runDsh(['--profile', profile, '--dump-config']).stdout
const provider = config.match(/provider:\s*([^\s]+)/)?.[1] ?? 'UNPROVEN'
const model = config.match(/model:\s*([^\s]+)/)?.[1] ?? 'UNPROVEN'

const store = createLearningStore({ filePath: storePath, reset: true })
const item = store.record({
  profileId: profile,
  statement: `For this workspace, the dependency-install command is exactly: ${expectedLearnedCommand}`,
  scope: { level: 'workspace', workspaceId: root },
  trigger: {
    keywordGroups: [['install', 'installs', 'installed', 'installing'], ['dependencies']],
    exclusions: ['explicitly use npm'],
    overrideTerms: ['npm', 'yarn', 'bun'],
  },
  surface: 'headless',
})

const samples = []
for (let sample = 1; sample <= 3; sample += 1) samples.push(runSample('lminus', sample))
store.adopt(item.id)
for (let sample = 1; sample <= 3; sample += 1) samples.push(runSample('lplus', sample))

const evaluation = evaluateLiveSamples(samples)
const pass = evaluation.pass
const unsafeStatus = evaluation.counts.semanticDecisions < 6
  ? 'UNPROVEN'
  : (evaluation.counts.unsafeOrIncorrect === 0 ? 'PASS' : 'FAIL')

const result = sanitizePublicEvidence({
  schema: 'dsh-learning/live-semantic-v1',
  generatedAt: new Date().toISOString(),
  preregistration: {
    prompt,
    expectedLearnedCommand,
    samplesPerArm: 3,
    maxRetryForTransportOrInvalidStructure: 1,
    semanticDecisionRetries: 0,
  },
  runtime: {
    dshVersion,
    dshCommit,
    profile,
    provider,
    model,
    commandForm: install.command,
  },
  counts: evaluation.counts,
  samples,
  layers: {
    stochasticSemanticGate: evaluation.status,
    unsafeOutputEvidence: unsafeStatus,
    invalidStructureReliability: 'REPORTED',
    transportReliability: 'REPORTED',
    sealedHoldout: 'UNPROVEN — no separate identity or access boundary',
  },
  overall: evaluation.status,
}, {
  bundleRoot: root,
  dshSourceRoot: resolveDshSourceRoot(),
  nodePath: process.execPath,
  dshHomes: [dshHome],
})

writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify({ runtime: result.runtime, counts: result.counts, layers: result.layers, overall: result.overall, output: outputPath }, null, 2))
if (!pass) process.exitCode = 1
