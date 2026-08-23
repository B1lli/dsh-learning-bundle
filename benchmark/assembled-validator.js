export function validateAssembledTranscript(transcript, expected) {
  if (!transcript || typeof transcript !== 'object') return false
  const lminus = transcript.arms?.lminus
  const lplus = transcript.arms?.lplus
  const otherProfile = transcript.arms?.otherProfile
  const overrides = transcript.explicitInstructionOverrides
  const reconstructed = transcript.reconstruct

  return transcript.profile === expected.profile
    && transcript.dshVersion === expected.dshVersion
    && transcript.target?.dshTag === expected.dshTag
    && transcript.target?.dshCommit === expected.dshCommit
    && transcript.loggedSourceKind === expected.loggedSourceKind
    && transcript.observableDifference === true
    && lminus?.exitStatus === 0
    && lminus?.lifecycle === 'candidate'
    && lminus?.learningInjections === 0
    && lminus?.finalResponse === expected.lminusResponse
    && lplus?.exitStatus === 0
    && lplus?.lifecycle === 'active'
    && lplus?.learningInjections === 1
    && lplus?.finalResponse === expected.lplusResponse
    && typeof transcript.recordedItemId === 'string'
    && transcript.recordedItemId === transcript.adoptedItemId
    && reconstructed?.itemCount === 1
    && reconstructed?.itemIds?.length === 1
    && reconstructed.itemIds[0] === transcript.recordedItemId
    && reconstructed?.deliveries?.length === 1
    && reconstructed.deliveries[0]?.itemId === transcript.recordedItemId
    && reconstructed.lane === expected.lane
    && reconstructed.scope?.level === expected.scopeLevel
    && reconstructed.scope?.workspaceId === expected.workspaceId
    && reconstructed.deliveries[0]?.profileId === expected.profile
    && reconstructed.deliveries[0]?.scope?.level === expected.scopeLevel
    && reconstructed.deliveries[0]?.scope?.workspaceId === expected.workspaceId
    && JSON.stringify(reconstructed.deliveries[0].scope) === JSON.stringify(reconstructed.scope)
    && otherProfile?.exitStatus === 0
    && otherProfile?.profile === expected.otherProfile
    && otherProfile?.learningInjections === 0
    && otherProfile?.finalResponse === expected.lminusResponse
    && Array.isArray(overrides)
    && overrides.length === expected.overrideCount
    && overrides.every(item => item.exitStatus === 0
      && item.learningInjections === 0
      && item.finalResponse === item.expected)
    && transcript.verification?.externalLogRead === true
    && transcript.verification?.manualCliAndPluginSharedStore === true
}
