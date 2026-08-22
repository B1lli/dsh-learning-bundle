#!/usr/bin/env node
/**
 * Minimal manual learning-store CLI (record candidate → explicit adopt → list).
 *
 * This is not a UI and it does not generate learning automatically. It is the
 * out-of-band, human-driven adoption path: recording always yields a
 * `candidate`, and only an explicit `adopt` makes an item recallable.
 *
 * Usage:
 *   node scripts/learning.mjs record \
 *     --profile headless \
 *     --statement "Use pnpm instead of npm for dependency installs." \
 *     --scope workspace --workspace-id /path/to/project \
 *     --keyword install,installs,installed,installing --keyword dependencies \
 *     --exclude "explicitly use npm"
 *   node scripts/learning.mjs adopt <item-id>
 *   node scripts/learning.mjs list
 *
 * The store path follows the plugin: DSH_LEARNING_STORE, else
 * $DSH_HOME/dsh-learning-store.json, else ~/.dsh/dsh-learning-store.json.
 */

import { realpathSync } from 'node:fs'
import { createLearningStore, resolveLearningStorePath } from '../src/index.js'

function storePath() {
  return resolveLearningStorePath()
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function flags(name) {
  const values = []
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1] !== undefined) values.push(process.argv[i + 1])
  }
  return values
}

const command = process.argv[2]
const store = createLearningStore({ filePath: storePath() })

if (command === 'record') {
  const statement = arg('statement')
  if (!statement) {
    console.error('record requires --statement')
    process.exit(1)
  }
  const profileId = arg('profile')
  if (!profileId) {
    console.error('record requires --profile matching the target dsh profile')
    process.exit(1)
  }
  const scopeLevel = arg('scope') ?? 'workspace'
  if (!['profile', 'workspace', 'session'].includes(scopeLevel)) {
    console.error('--scope must be profile, workspace, or session')
    process.exit(1)
  }
  const scope = { level: scopeLevel }
  if (scopeLevel === 'workspace') {
    const workspaceId = arg('workspace-id')
    if (!workspaceId) {
      console.error('workspace scope requires --workspace-id')
      process.exit(1)
    }
    try {
      scope.workspaceId = realpathSync(workspaceId)
    } catch {
      console.error(`workspace path cannot be resolved: ${workspaceId}`)
      process.exit(1)
    }
  }
  if (scopeLevel === 'session') {
    scope.sessionId = arg('session-id')
    if (!scope.sessionId) {
      console.error('session scope requires --session-id')
      process.exit(1)
    }
  }
  const item = store.record({
    profileId,
    statement,
    scope,
    trigger: {
      keywordGroups: flags('keyword').map(value => value.split(',').map(part => part.trim()).filter(Boolean)),
      exclusions: flags('exclude'),
      overrideTerms: flags('override-term'),
    },
  })
  console.log(JSON.stringify(item, null, 2))
} else if (command === 'adopt') {
  const id = process.argv[3]
  const adopted = store.adopt(id)
  if (!adopted) {
    console.error(`no item with id ${id}`)
    process.exit(1)
  }
  console.log(JSON.stringify(adopted, null, 2))
} else if (command === 'list') {
  console.log(JSON.stringify(store.list(), null, 2))
} else {
  console.error('usage: node scripts/learning.mjs <record|adopt|list> [args]')
  process.exit(1)
}
