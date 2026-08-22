/**
 * Deterministic stage consumer for the assembled end-to-end demo ONLY.
 *
 * This is not production code. It stands in for a model adapter so the
 * assembled L−/L+ run is reproducible offline: it inspects the exact
 * model-visible messages and answers `pnpm install` when the recalled learning
 * rule is present, `npm install` otherwise — the same deterministic stage
 * consumer semantics the acceptance benchmark's `simulateConsumer` uses.
 *
 * It implements the duck-typed adapter contract directly (providerInfo,
 * resolveModel, stream) so the demo needs no host-package import.
 */

export const name = 'dsh-learning-demo-deterministic-adapter'
export const inject = ['llm']

export function apply(ctx) {
  ctx.llm.registerAdapter(['demo-deterministic'], {
    providerInfo(provider) {
      return { id: provider, name: provider }
    },
    providerRetryPolicy() {
      return undefined
    },
    async resolveModel(provider, model) {
      return { provider, id: model, name: model }
    },
    async *stream(options) {
      const text = modelVisibleText(options)
      const explicitYarn = /\byarn\b/.test(text)
      const learned = text.includes('use pnpm instead of npm')
      const answer = explicitYarn ? 'yarn install' : (learned ? 'pnpm install' : 'npm install')
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: answer }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  })
}

function modelVisibleText(options) {
  const parts = []
  if (typeof options.system === 'string') parts.push(options.system)
  for (const message of options.messages ?? []) {
    for (const block of message.content ?? []) {
      if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    }
  }
  return parts.join('\n').toLowerCase()
}
