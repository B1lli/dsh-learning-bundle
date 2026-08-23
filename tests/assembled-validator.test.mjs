import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { validateAssembledTranscript } from '../benchmark/assembled-validator.js'

const manifest = JSON.parse(await readFile(new URL('../fixtures/manifest.json', import.meta.url), 'utf8'))
const fixture = manifest.cases.find(item => item.id === 'current-dsh-compatibility')
const transcript = JSON.parse(await readFile(new URL('../benchmark/results/assembled-transcript-current.json', import.meta.url), 'utf8'))

test('current compatibility requires the complete causal transcript', () => {
  assert.equal(validateAssembledTranscript(transcript, fixture.expected), true)

  const sameOutput = structuredClone(transcript)
  sameOutput.arms.lplus.finalResponse = sameOutput.arms.lminus.finalResponse
  assert.equal(validateAssembledTranscript(sameOutput, fixture.expected), false)

  const noOverrides = structuredClone(transcript)
  noOverrides.explicitInstructionOverrides = []
  assert.equal(validateAssembledTranscript(noOverrides, fixture.expected), false)

  const noReconstruction = structuredClone(transcript)
  delete noReconstruction.reconstruct
  assert.equal(validateAssembledTranscript(noReconstruction, fixture.expected), false)

  const wrongLane = structuredClone(transcript)
  wrongLane.reconstruct.lane = 'post-step'
  assert.equal(validateAssembledTranscript(wrongLane, fixture.expected), false)

  const wrongScope = structuredClone(transcript)
  wrongScope.reconstruct.scope = { level: 'profile' }
  assert.equal(validateAssembledTranscript(wrongScope, fixture.expected), false)

  const wrongDeliveryProfile = structuredClone(transcript)
  wrongDeliveryProfile.reconstruct.deliveries[0].profileId = 'headless-alt'
  assert.equal(validateAssembledTranscript(wrongDeliveryProfile, fixture.expected), false)

  const wrongDeliveryScope = structuredClone(transcript)
  wrongDeliveryScope.reconstruct.deliveries[0].scope.workspaceId = '/another/workspace'
  assert.equal(validateAssembledTranscript(wrongDeliveryScope, fixture.expected), false)

  const wrongOtherProfile = structuredClone(transcript)
  wrongOtherProfile.arms.otherProfile.profile = 'headless'
  assert.equal(validateAssembledTranscript(wrongOtherProfile, fixture.expected), false)
})
