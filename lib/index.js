/** Native project-rule workflow; legacy keyword recall is an explicit mode. */
import { apply as applyLegacyRecall } from './legacy-recall.js'
export { extractDirectUserPrompt } from './legacy-recall.js'

export const name = 'dsh-learning'
export const inject = ['systemPrompt']

// Method only. The user's rules stay in the native instruction file and are
// consumed by DSH, never copied into a second store or a synthetic user turn.
export const projectRuleWorkflow = `Project conventions and first delivery:
When the user teaches a durable project convention, use your current conversation context to distinguish it from a one-task exception. Read the relevant existing instruction file, then use the native edit/write tools to maintain one authoritative rule there; create AGENTS.md only when no applicable instruction file exists. Update or remove superseded rules in place. Preserve unrelated content and narrower scopes. Do not duplicate rules in a learning database, README, or another instruction file. Never persist a temporary exception. Ask only when scope or conflicting intent cannot be resolved from context. Briefly acknowledge what changed; do not claim future compliance is guaranteed.
On later tasks, apply relevant native project instructions by meaning, including paraphrases and other languages; the current user's explicit exception wins without rewriting the default. Before delivering changed work, choose the smallest existing check that can detect the concrete failure the applicable rule prevents. Run it after the final relevant edit, inspect its actual result, and repair failures within the task's scope. Use your current context for semantic requirements; do not invent keyword validators or add a review model by default. Report unavailable checks or unresolved failures honestly. Avoid extra checks, rule recaps, or persistence work on unrelated and simple tasks.`

export function apply(ctx, config = {}) {
  // An explicit storePath from an existing profile retains its old contract.
  const mode = config.mode ?? (config.storePath !== undefined ? 'legacy-recall' : 'native')
  if (mode === 'legacy-recall') return applyLegacyRecall(ctx, config)
  if (mode !== 'native') throw new Error(`Unsupported dsh-learning mode: ${mode}`)
  if (config.storePath !== undefined) {
    throw new Error('Native mode uses project instruction files; remove storePath or select legacy-recall.')
  }
  ctx.systemPrompt.section({ name: 'dsh-learning:project-workflow', order: 190, text: projectRuleWorkflow })
}
