/**
 * dsh-learning-bundle — governed, scoped, replayable learning loop (Stage 0+1).
 *
 * This module is the deterministic product core. It is a plain dependency-free
 * ES module so both the acceptance benchmark and the assembled Cordis plugin
 * (`lib/`) can consume it. It never branches on fixture ids, benchmark
 * statements, or the benchmark file path.
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const STORE_SCHEMA_VERSION = 1
export const LIFECYCLE_CANDIDATE = 'candidate'
export const LIFECYCLE_ACTIVE = 'active'
export const SOURCE_KIND = 'dsh-learning-recall'

/**
 * A file-backed learning store. Items start as `candidate` and only recall
 * after an explicit `adopt`. Every operation reloads the file so a long-lived
 * Harness process observes manual record/adopt changes made by another process.
 *
 * @param {{ filePath?: string, reset?: boolean }} options
 */
export function createLearningStore({ filePath, reset = false } = {}) {
  if (!filePath) throw new TypeError('createLearningStore requires a filePath')
  let items = []
  if (reset === true) {
    persist([])
  } else {
    items = load()
  }

  function load() {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf8'))
      if (Array.isArray(raw?.items)) return raw.items
      if (Array.isArray(raw)) return raw
      throw new Error(`unsupported learning-store shape at ${filePath}`)
    } catch (error) {
      if (error?.code === 'ENOENT') return []
      throw error
    }
  }

  function persist(next = items) {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, `${JSON.stringify({ schemaVersion: STORE_SCHEMA_VERSION, items: next }, null, 2)}\n`)
  }

  function record(input = {}) {
    items = load()
    validateLearningItemInput(input)
    const item = {
      ...input,
      id: input.id ?? randomUUID(),
      lifecycle: LIFECYCLE_CANDIDATE,
      createdAt: new Date().toISOString(),
    }
    items.push(item)
    persist()
    return item
  }

  function adopt(id) {
    items = load()
    const item = items.find(entry => entry.id === id)
    if (!item) return undefined
    item.lifecycle = LIFECYCLE_ACTIVE
    item.adoptedAt = new Date().toISOString()
    persist()
    return item
  }

  function get(id) {
    items = load()
    return items.find(entry => entry.id === id)
  }

  function list() {
    items = load()
    return [...items]
  }

  return { record, adopt, get, list }
}

/**
 * Recall active learning items relevant to a prompt within a profile /
 * workspace / session scope.
 *
 * @param {{ items?: unknown[], prompt?: string, profileId?: string, workspaceId?: string, sessionId?: string }} input
 * @returns {object[]} the active, in-scope, trigger-relevant items
 */
export function recallLearning({ items = [], prompt = '', profileId, workspaceId, sessionId } = {}) {
  const recalled = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (item.lifecycle !== LIFECYCLE_ACTIVE) continue
    if (typeof item.profileId !== 'string' || item.profileId === '' || item.profileId !== profileId) continue
    if (!scopeMatches(item.scope, { workspaceId, sessionId })) continue
    if (!triggerMatches(item.trigger, prompt)) continue
    recalled.push(item)
  }
  return recalled
}

function scopeMatches(scope, { workspaceId, sessionId }) {
  if (!scope || typeof scope !== 'object' || !scope.level) return false
  switch (scope.level) {
    case 'workspace':
      return typeof scope.workspaceId === 'string' && scope.workspaceId !== '' && scope.workspaceId === workspaceId
    case 'session':
      return typeof scope.sessionId === 'string' && scope.sessionId !== '' && scope.sessionId === sessionId
    case 'profile':
      return true
    default:
      return false
  }
}

function validateLearningItemInput(input) {
  if (typeof input.statement !== 'string' || input.statement.trim() === '') {
    throw new TypeError('learning item requires a nonempty statement')
  }
  if (typeof input.profileId !== 'string' || input.profileId === '') {
    throw new TypeError('learning item requires a nonempty profileId')
  }
  if (!input.scope || typeof input.scope !== 'object') {
    throw new TypeError('learning item requires profile, workspace, or session scope')
  }
  if (!['profile', 'workspace', 'session'].includes(input.scope.level)) {
    throw new TypeError('learning item scope must be profile, workspace, or session')
  }
  if (input.scope.level === 'workspace' && (typeof input.scope.workspaceId !== 'string' || input.scope.workspaceId === '')) {
    throw new TypeError('workspace scope requires a nonempty workspaceId')
  }
  if (input.scope.level === 'session' && (typeof input.scope.sessionId !== 'string' || input.scope.sessionId === '')) {
    throw new TypeError('session scope requires a nonempty sessionId')
  }
  if (!Array.isArray(input.trigger?.keywordGroups)
    || input.trigger.keywordGroups.length === 0
    || input.trigger.keywordGroups.some(group => !Array.isArray(group)
      || group.length === 0
      || group.some(keyword => typeof keyword !== 'string' || keyword.trim() === ''))) {
    throw new TypeError('learning item requires at least one nonempty trigger keyword group')
  }
}

function triggerMatches(trigger, prompt) {
  if (!trigger || typeof trigger !== 'object') return false
  const text = String(prompt ?? '')
  for (const phrase of trigger.exclusions ?? []) {
    if (phrase && text.toLowerCase().includes(String(phrase).toLowerCase())) return false
  }
  // `overrideTerms` are structured alternative choices, not prose hints.
  // Any current-prompt mention suppresses this learned default. That yields a
  // conservative false negative for discussion-only mentions, but never lets
  // an old default override a newly named npm/Yarn/bun choice.
  if ((trigger.overrideTerms ?? []).some(term => wordInPrompt(term, text))) return false
  const groups = trigger.keywordGroups ?? []
  if (groups.length === 0) return false
  for (const group of groups) {
    const matched = (group ?? []).some(keyword => wordInPrompt(keyword, text))
    if (!matched) return false
  }
  return true
}

function wordInPrompt(keyword, text) {
  if (!keyword) return false
  const value = String(keyword)
  if (!/^[\x00-\x7F]+$/.test(value)) {
    return String(text).toLocaleLowerCase().includes(value.toLocaleLowerCase())
  }
  // Apply a word boundary only where the token itself starts or ends with an
  // ASCII word character. This keeps plain words exact while allowing normal
  // developer tokens such as C++, @scope/pkg, --flags, and .env.
  const startsWithWord = /^[A-Za-z0-9_]/.test(value)
  const endsWithWord = /[A-Za-z0-9_]$/.test(value)
  const prefix = startsWithWord ? '(?<![A-Za-z0-9_])' : ''
  const suffix = endsWithWord ? '(?![A-Za-z0-9_])' : ''
  const pattern = new RegExp(`${prefix}${escapeRegExp(value)}${suffix}`, 'i')
  return pattern.test(text)
}

/** Resolve the active dsh profile from the launcher argv. */
export function resolveDshProfileId(argv = process.argv.slice(2), environment = process.env) {
  const index = argv.indexOf('--profile')
  if (index >= 0 && typeof argv[index + 1] === 'string' && argv[index + 1] !== '') return argv[index + 1]
  if (argv[0] === 'web') return 'web'
  if (environment.DSH_PROFILE_ID) return environment.DSH_PROFILE_ID
  throw new Error('dsh-learning: active profile is unavailable; launch with --profile or set DSH_PROFILE_ID')
}

/** Match dsh's documented `$DSH_HOME`, then `~/.dsh`, store resolution. */
export function resolveLearningStorePath(environment = process.env) {
  if (environment.DSH_LEARNING_STORE?.trim()) return resolve(environment.DSH_LEARNING_STORE)
  const dshHome = environment.DSH_HOME?.trim()
    ? resolve(environment.DSH_HOME)
    : join(homedir(), '.dsh')
  return join(dshHome, 'dsh-learning-store.json')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build the normal dsh `UserMessage` that carries recalled learning into the
 * model-visible surface. Its `source.kind` is `dsh-learning-recall` and it
 * embeds the delivered item ids, lane, and scope so delivery can be
 * reconstructed from the durable session log.
 *
 * @param {{ recalled?: object[], lane?: string }} input
 */
export function buildLearningMessage({ recalled = [], lane } = {}) {
  const items = Array.isArray(recalled) ? recalled : []
  const text = items.map(item => item?.statement).filter(Boolean).join('\n')
  const itemIds = items.map(item => item?.id).filter(Boolean)
  const deliveries = items.map(item => {
    const scope = { level: item.scope?.level }
    if (item.scope?.workspaceId !== undefined) scope.workspaceId = item.scope.workspaceId
    if (item.scope?.sessionId !== undefined) scope.sessionId = item.scope.sessionId
    return { itemId: item.id, profileId: item.profileId, scope }
  })
  const source = { kind: SOURCE_KIND, itemIds, deliveries }
  if (lane !== undefined) source.lane = lane
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source,
  }
}

/**
 * Reconstruct a learning delivery from logged `user/message` session events.
 * Accepts both the compact benchmark shape (`{ type, message }`) and the
 * durable log shape (`{ type, data }`).
 *
 * @param {{ type?: string, message?: object, data?: object }[]} events
 * @returns {{ items: string[], lane?: string, scope?: object }}
 */
export function reconstructLearningDelivery(events = []) {
  const items = []
  const deliveries = []
  let lane
  let scope
  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    if (event.type !== undefined && event.type !== 'user/message') continue
    const message = event.message ?? event.data
    if (!message || message.source?.kind !== SOURCE_KIND) continue
    for (const id of message.source.itemIds ?? []) {
      if (id && !items.includes(id)) items.push(id)
    }
    for (const delivery of message.source.deliveries ?? []) {
      if (delivery?.itemId && !deliveries.some(entry => entry.itemId === delivery.itemId)) deliveries.push(delivery)
    }
    if (message.source.lane !== undefined) lane = message.source.lane
    if (message.source.scope) scope = message.source.scope
  }
  if (deliveries.length === 1) scope = deliveries[0].scope
  return { items, lane, scope, deliveries }
}
