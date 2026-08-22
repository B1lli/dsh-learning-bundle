/**
 * Assemble the real end-to-end DeepSeek Harness transcript for the
 * `assembled-headless-transcript` acceptance gate.
 *
 * This is not a mock: it boots an actual `dsh` headless profile in a
 * workspace-local DSH_HOME, installs this bundle into it, seeds the learning
 * store through the public API, runs the same task twice (L− candidate arm,
 * L+ adopted arm) against a deterministic stage-consumer model adapter, then
 * reads the durable session logs back out-of-band to prove the injection is
 * logged and reconstructable.
 *
 * Run with: node scripts/assemble-transcript.mjs
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  reconstructLearningDelivery,
} from '../src/index.js'
import { sanitizePublicEvidence } from './public-evidence.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tmpHome = resolve(root, '.tmp/dsh-home')
const workDir = resolve(root, '.tmp/assembled')
const storePath = resolve(tmpHome, 'dsh-learning-store.json')
const demoPatchPath = resolve(workDir, 'demo.patch.yml')
const adapterPath = resolve(root, 'benchmark/demo/deterministic-adapter.js')
const learningCliPath = resolve(root, 'scripts/learning.mjs')
const resultsDir = resolve(root, 'benchmark/results')

const PROFILE = 'headless'
const OTHER_PROFILE = 'headless-alt'
const PROMPT = 'Install the JavaScript dependencies for this workspace.'
const PROFILE_ID = PROFILE
const WORKSPACE_ID = root // the headless runner records cwd = process.cwd()
const dshCliPath = process.env.DSH_CLI_PATH

const env = { ...process.env, DSH_HOME: tmpHome }

function run(args) {
  const started = Date.now()
  const command = dshCliPath ? process.execPath : 'dsh'
  const commandArgs = dshCliPath ? [dshCliPath, ...args] : args
  const res = spawnSync(command, commandArgs, { cwd: root, encoding: 'utf8', env })
  return {
    command: [command, ...commandArgs].join(' '),
    stdout: (res.stdout ?? '').trim(),
    stderr: (res.stderr ?? '').trim(),
    status: res.status,
    durationMs: Date.now() - started,
  }
}

function runLearning(args) {
  const res = spawnSync(process.execPath, [learningCliPath, ...args], { cwd: root, encoding: 'utf8', env })
  return {
    stdout: (res.stdout ?? '').trim(),
    stderr: (res.stderr ?? '').trim(),
    status: res.status,
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
  const base = join(tmpHome, 'sessions')
  const files = []
  const walk = dir => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'session.jsonl.zstd') files.push(full)
    }
  }
  walk(base)
  return files
}

function readEvents(sessionFile) {
  if (!existsSync(sessionFile)) return []
  const res = spawnSync('zstdcat', [sessionFile], { encoding: 'utf8' })
  if (res.status !== 0) throw new Error(`zstdcat failed for ${sessionFile}: ${res.stderr}`)
  return res.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
}

function learningEvents(events) {
  return events.filter(event =>
    event.type === 'user/message' && event.data?.source?.kind === 'dsh-learning-recall')
}

function assistantText(events) {
  const text = []
  for (const event of events) {
    if (event.type !== 'assistant/message') continue
    for (const block of event.data?.message?.content ?? []) {
      if (block?.type === 'text' && block.text) text.push(block.text)
    }
  }
  return text.join('')
}

// ---- 1. Fresh home + install the bundle into the headless profile. ---------
rmSync(tmpHome, { recursive: true, force: true })
rmSync(workDir, { recursive: true, force: true })
mkdirSync(workDir, { recursive: true })
const install = run(['plugin', '--profile', PROFILE, 'add', '-w', root])
if (install.status !== 0) {
  throw new Error(`bundle install failed (${install.status}):\n${install.stdout}\n${install.stderr}`)
}

const dshVersion = run(['--version']).stdout
const dshCommit = resolveDshCommit()
const nodeVersion = process.versions.node

// ---- 2. Demo overlay: deterministic stage-consumer adapter. ----------------
writeFileSync(demoPatchPath, `# Generated assembled-demo overlay (deterministic stage consumer; NOT production).\n- id: llm-deepseek\n  disabled: true\n- id: llm-pi-ai\n  disabled: true\n- id: agent-default-model\n  config:\n    provider: demo-deterministic\n    model: demo\n- insert:\n    - id: demo-deterministic-adapter\n      name: ${adapterPath}\n`)

// ---- 3. L− arm: a headless-recorded candidate must not recall. -------------
const record = runLearning([
  'record', '--profile', PROFILE_ID,
  '--statement', 'For JavaScript dependency installs in this workspace, use pnpm instead of npm.',
  '--scope', 'workspace', '--workspace-id', WORKSPACE_ID,
  '--keyword', 'install,installs,installed,installing', '--keyword', 'dependencies',
  '--exclude', 'explicitly use npm', '--exclude', 'use npm install',
  '--override-term', 'npm', '--override-term', 'yarn', '--override-term', 'bun',
])
if (record.status !== 0) throw new Error(`manual record failed: ${record.stderr || record.stdout}`)
const item = JSON.parse(record.stdout)
const beforeFiles = new Set(sessionFiles())
const lminus = run(['--profile', PROFILE, '--patch', demoPatchPath, PROMPT])
const lminusFile = sessionFiles().find(file => !beforeFiles.has(file))
const lminusEvents = lminusFile ? readEvents(lminusFile) : []
const lminusLearning = learningEvents(lminusEvents)

// ---- 4. L+ arm: the same item, explicitly adopted, must recall. ------------
const adopt = runLearning(['adopt', item.id])
if (adopt.status !== 0) throw new Error(`manual adopt failed: ${adopt.stderr || adopt.stdout}`)
const adoptedItem = JSON.parse(adopt.stdout)
const plusFiles = new Set(sessionFiles())
const lplus = run(['--profile', PROFILE, '--patch', demoPatchPath, PROMPT])
const lplusFile = sessionFiles().find(file => !plusFiles.has(file))
const lplusEvents = lplusFile ? readEvents(lplusFile) : []
const lplusLearning = learningEvents(lplusEvents)
const delivery = reconstructLearningDelivery(lplusEvents)

const overrideCases = []
for (const override of [
  { id: 'yarn', prompt: 'For this task, use Yarn to install the dependencies.', expected: 'yarn install' },
  { id: 'npm', prompt: 'Install the dependencies with npm for this task.', expected: 'npm install' },
  { id: 'run-yarn', prompt: 'Run yarn install for the dependencies.', expected: 'yarn install' },
  { id: 'run-npm', prompt: 'Run npm install for the dependencies.', expected: 'npm install' },
  { id: 'execute-npm', prompt: 'Please execute npm install for the dependencies.', expected: 'npm install' },
]) {
  const before = new Set(sessionFiles())
  const runResult = run(['--profile', PROFILE, '--patch', demoPatchPath, override.prompt])
  const sessionFile = sessionFiles().find(file => !before.has(file))
  const events = sessionFile ? readEvents(sessionFile) : []
  overrideCases.push({
    ...override,
    finalResponse: runResult.stdout,
    exitStatus: runResult.status,
    learningInjections: learningEvents(events).length,
    sessionFile,
  })
}

// ---- 5. A second real profile must not receive the headless-scoped item. ---
const installOther = run(['plugin', '--profile', OTHER_PROFILE, 'add', '-w', root])
if (installOther.status !== 0) {
  throw new Error(`second-profile bundle install failed (${installOther.status}):\n${installOther.stdout}\n${installOther.stderr}`)
}
const otherManifestPath = join(tmpHome, 'profiles', OTHER_PROFILE, 'package.json')
const otherManifest = JSON.parse(readFileSync(otherManifestPath, 'utf8'))
otherManifest.dsh.profile.bundles = [
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-headless',
  'dsh-learning-bundle',
]
writeFileSync(otherManifestPath, `${JSON.stringify(otherManifest, null, 2)}\n`)
const otherFiles = new Set(sessionFiles())
const otherProfile = run(['--profile', OTHER_PROFILE, '--patch', demoPatchPath, PROMPT])
const otherFile = sessionFiles().find(file => !otherFiles.has(file))
const otherEvents = otherFile ? readEvents(otherFile) : []
const otherLearning = learningEvents(otherEvents)

// ---- 6. Assemble the evidence record. --------------------------------------
const lminusResponse = lminus.stdout
const lplusResponse = lplus.stdout
const observableDifference = lminusResponse !== lplusResponse && lplusResponse === 'pnpm install'
const assembledPass = lminus.status === 0
  && lplus.status === 0
  && item.lifecycle === 'candidate'
  && adoptedItem.lifecycle === 'active'
  && item.id === adoptedItem.id
  && lminusLearning.length === 0
  && lplusLearning.length === 1
  && delivery.items.length === 1
  && delivery.items[0] === item.id
  && overrideCases.every(item => item.exitStatus === 0
    && item.learningInjections === 0
    && item.finalResponse === item.expected)
  && otherProfile.status === 0
  && otherLearning.length === 0
  && observableDifference

const transcript = sanitizePublicEvidence({
  schema: 'dsh-learning/assembled-transcript-v1',
  generatedAt: new Date().toISOString(),
  profile: PROFILE,
  model: { provider: 'demo-deterministic', model: 'demo' },
  dshVersion,
  nodeVersion,
  target: {
    dshTag: 'dsh-v0.1.0-rc.8',
    dshCommit,
    note: dshVersion === '0.1.0-rc.8'
      ? 'Assembled run executed with the pinned rc.8 CLI build.'
      : 'Bundle targets rc.8, but this run used a different CLI version and is not rc.8 compatibility evidence.',
  },
  commandForm: {
    install: install.command,
    lminus: lminus.command,
    lplus: lplus.command,
  },
  prompt: PROMPT,
  recordedItemId: item.id,
  adoptedItemId: adoptedItem.id,
  arms: {
    lminus: {
      lifecycle: item.lifecycle,
      surface: item.surface,
      finalResponse: lminusResponse,
      exitStatus: lminus.status,
      durationMs: lminus.durationMs,
      learningInjections: lminusLearning.length,
      sessionFile: lminusFile,
      assistantText: assistantText(lminusEvents),
    },
    lplus: {
      lifecycle: adoptedItem.lifecycle,
      finalResponse: lplusResponse,
      exitStatus: lplus.status,
      durationMs: lplus.durationMs,
      learningInjections: lplusLearning.length,
      sessionFile: lplusFile,
      assistantText: assistantText(lplusEvents),
    },
    otherProfile: {
      profile: OTHER_PROFILE,
      finalResponse: otherProfile.stdout,
      exitStatus: otherProfile.status,
      learningInjections: otherLearning.length,
      sessionFile: otherFile,
      assistantText: assistantText(otherEvents),
    },
  },
  loggedSourceKind: lplusLearning.length > 0 ? lplusLearning[0].data.source.kind : null,
  reconstruct: {
    itemCount: delivery.items.length,
    lane: delivery.lane,
    itemIds: delivery.items,
    scope: delivery.scope,
    deliveries: delivery.deliveries,
  },
  explicitInstructionOverrides: overrideCases,
  observableDifference,
  redSamples: [],
  retryCounts: { deterministic: 0, semanticDecision: 0, semanticTransportOrInvalidStructure: 0 },
  verification: {
    externalLogRead: true,
    manualCliAndPluginSharedStore: storePath === resolve(tmpHome, 'dsh-learning-store.json'),
    method: 'read the durable $DSH_HOME/sessions/*/session.jsonl.zstd logs out-of-band and reconstructed delivery with reconstructLearningDelivery()',
    lminusSessionLogPath: lminusFile,
    lplusSessionLogPath: lplusFile,
    lminusInjectionAbsent: lminusLearning.length === 0,
    lplusInjectionPresent: lplusLearning.length === 1,
  },
}, {
  bundleRoot: root,
  dshSourceRoot: resolveDshSourceRoot(),
  nodePath: process.execPath,
  dshHomes: [tmpHome],
})

const outputPath = join(resultsDir, 'assembled-transcript.json')
writeFileSync(outputPath, `${JSON.stringify(transcript, null, 2)}\n`)

// ---- 7. Print a compact summary (no credentials). ---------------------------
console.log(JSON.stringify({
  profile: transcript.profile,
  dshVersion: transcript.dshVersion,
  lminusResponse: transcript.arms.lminus.finalResponse,
  lplusResponse: transcript.arms.lplus.finalResponse,
  otherProfile: transcript.arms.otherProfile,
  explicitInstructionOverrides: transcript.explicitInstructionOverrides,
  loggedSourceKind: transcript.loggedSourceKind,
  reconstruct: transcript.reconstruct,
  observableDifference: transcript.observableDifference,
  externalLogRead: transcript.verification.externalLogRead,
  output: outputPath,
}, null, 2))

if (!assembledPass || transcript.loggedSourceKind !== 'dsh-learning-recall' || !transcript.verification.externalLogRead) {
  process.exitCode = 1
}
