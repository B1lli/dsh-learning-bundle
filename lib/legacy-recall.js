/**
 * dsh-learning-bundle production plugin.
 *
 * Mounts beside the ordinary dsh tree and contributes nothing but a governed
 * learning recall at the `agent/pre-step` boundary:
 *
 * - active (adopted) items only — candidates never recall;
 * - profile / workspace / session scope isolation;
 * - explicit current-instruction exclusions override learned defaults;
 * - the injection is a real `user/message` with `source.kind ===
 *   'dsh-learning-recall'`, so the durable session log reconstructs delivery.
 *
 * The plugin is read-only over the store: it never records, never adopts, and
 * never auto-activates headless/manual candidates. Adoption stays an explicit
 * out-of-band action through the store API.
 */

import {
  buildLearningMessage,
  createLearningStore,
  recallLearning,
  resolveDshProfileId,
  resolveLearningStorePath,
} from '../src/index.js'

export const name = 'dsh-learning'

export function apply(ctx, config = {}) {
  const storePath = config.storePath
    ?? resolveLearningStorePath()
  const profileId = config.profileId ?? resolveDshProfileId()
  const store = createLearningStore({ filePath: storePath })

  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    const decision = await next()
    if (decision.kind !== 'enter' || decision.messages.length === 0) return decision
    signal?.throwIfAborted?.()

    // Downstream pre-step listeners may rewrite the direct user message.
    // Recall must follow the final message set that will enter the agent, not
    // the originally claimed input.
    const prompt = extractDirectUserPrompt(decision.messages)
    if (prompt === '') return decision

    const workspaceId = agent.session.header?.cwd ?? process.cwd()
    const sessionId = agent.id

    const recalled = recallLearning({
      items: store.list(),
      prompt,
      profileId,
      workspaceId,
      sessionId,
    })
    if (recalled.length === 0) return decision

    // `buildLearningMessage` returns a full dsh UserMessage shape
    // ({ id, role: 'user', content, source }).
    const learningMessage = buildLearningMessage({ recalled, lane: 'pre-step' })

    // Fold the learning context right after the last claimed message, so the
    // direct prompt precedes it (same placement the agent-instructions plugin
    // uses for workspace context).
    const currentPromptIndex = decision.messages.findLastIndex(message => message.source?.kind === 'user')
    const fallbackIndex = decision.messages.findLastIndex(message => messages.includes(message))
    const insertionIndex = currentPromptIndex >= 0 ? currentPromptIndex : fallbackIndex + 1
    // Put learned defaults before the current direct prompt. If a novel
    // conflict escapes the deterministic override terms, the current user
    // instruction is still later in model order and therefore wins.
    const entered = decision.messages.toSpliced(insertionIndex, 0, learningMessage)
    return { kind: 'enter', messages: entered }
  })
}

export function extractDirectUserPrompt(messages) {
  const parts = []
  for (const message of messages ?? []) {
    if (message?.source?.kind !== 'user') continue
    for (const block of message?.content ?? []) {
      if (block?.type === 'text' && typeof block.text === 'string' && block.text !== '') {
        parts.push(block.text)
      }
    }
  }
  return parts.join('\n')
}
