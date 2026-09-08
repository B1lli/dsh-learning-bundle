import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, projectRuleWorkflow } from '../lib/index.js'

test('native mode registers method once without reading a store or intercepting user messages', () => {
  const sections = []
  const ctx = {
    systemPrompt: { section: value => sections.push(value) },
    on() { throw new Error('Native mode must use the host instruction consumer') },
  }
  apply(ctx)
  assert.deepEqual(sections, [{ name: 'dsh-learning:project-workflow', order: 190, text: projectRuleWorkflow }])
})

test('old explicit store configuration retains recall without double native guidance', () => {
  const listeners = []
  apply({ on: (...args) => listeners.push(args), systemPrompt: { section() { throw new Error('double workflow') } } },
    { storePath: '/unused/store.json', profileId: 'test' })
  assert.equal(listeners.length, 1)
  assert.equal(listeners[0][0], 'agent/pre-step')
})

test('ambiguous or unsupported mode fails visibly', () => {
  assert.throws(() => apply({}, { mode: 'native', storePath: 'old.json' }), /remove storePath/)
  assert.throws(() => apply({}, { mode: 'guess' }), /Unsupported/)
})
