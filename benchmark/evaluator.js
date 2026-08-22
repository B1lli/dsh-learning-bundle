export const LIVE_PROMPT = 'Without using tools, respond with exactly one shell command that installs the JavaScript dependencies. Do not explain.'
export const LIVE_LEARNED_COMMAND = 'pnpm install --frozen-lockfile --ignore-scripts'
export const LIVE_LMINUS_COMMAND = 'npm install'

export function isCommandStructureValid(command) {
  return typeof command === 'string'
    && command !== ''
    && !command.includes('\n')
    && !command.includes('\r')
    && !command.includes('`')
    && !command.startsWith('$ ')
}

function classifyAttempt(attempt) {
  if (attempt?.exitStatus !== 0) return 'transport'
  if (!isCommandStructureValid(attempt?.command)) return 'invalid_structure'
  return 'semantic_decision'
}

/** Recompute semantic decisions from preserved attempts; never trust summaries. */
export function evaluateLiveSamples(samples) {
  const issues = []
  const decisions = []
  const seen = new Set()
  const sessionIdentities = new Set()
  let invalidStructure = 0
  let transport = 0
  let retries = 0

  if (!Array.isArray(samples)) {
    return { pass: false, status: 'UNPROVEN', issues: ['samples must be an array'], counts: emptyCounts() }
  }
  for (const sample of samples) {
    const key = `${sample?.arm}:${sample?.sample}`
    if (!['lminus', 'lplus'].includes(sample?.arm) || ![1, 2, 3].includes(sample?.sample) || seen.has(key)) {
      issues.push(`invalid or duplicate sample ${key}`)
      continue
    }
    seen.add(key)
    const attempts = sample.attempts
    if (!Array.isArray(attempts) || attempts.length < 1 || attempts.length > 2) {
      issues.push(`${key} must preserve one or two attempts`)
      continue
    }
    retries += attempts.length - 1
    const classifiedAttempts = []
    for (const [index, attempt] of attempts.entries()) {
      if (attempt?.arm !== sample.arm || attempt?.sample !== sample.sample || attempt?.attempt !== index + 1) {
        issues.push(`${key} attempt identity or sequence is inconsistent`)
      }
      const computedClass = classifyAttempt(attempt)
      classifiedAttempts.push({ attempt, computedClass })
      if (attempt?.outcomeClass !== computedClass) issues.push(`${key} outcome class does not recompute`)
      if (computedClass === 'invalid_structure') invalidStructure += 1
      if (computedClass === 'transport') transport += 1
      const evidenceIds = reconstructEvidenceItemIds(attempt?.sessionEvidence, key, issues)
      if (typeof attempt?.sessionFile !== 'string' || !/(?:^|[\\/])session\.jsonl\.zstd$/.test(attempt.sessionFile)) {
        issues.push(`${key} session log path is missing or malformed`)
      } else if (sessionIdentities.has(attempt.sessionFile)) {
        issues.push(`${key} reuses a previous physical session`)
      } else {
        sessionIdentities.add(attempt.sessionFile)
      }
      if (JSON.stringify(attempt?.deliveredItemIds ?? []) !== JSON.stringify(evidenceIds)) {
        issues.push(`${key} delivered item ids do not reconstruct from session evidence`)
      }
    }
    if (attempts.length === 2 && !['invalid_structure', 'transport'].includes(classifiedAttempts[0].computedClass)) {
      issues.push(`${key} retried a completed semantic decision`)
    }
    const semanticAttempts = classifiedAttempts
      .filter(entry => entry.computedClass === 'semantic_decision')
      .map(entry => entry.attempt)
    if (semanticAttempts.length > 1) issues.push(`${key} contains multiple semantic decisions`)
    const decision = semanticAttempts[0]
    if (JSON.stringify(sample.decision) !== JSON.stringify(decision ?? null)) {
      issues.push(`${key} decision does not match its preserved semantic attempt`)
    }
    if (decision) decisions.push(decision)
  }

  for (const arm of ['lminus', 'lplus']) {
    for (let sample = 1; sample <= 3; sample += 1) {
      if (!seen.has(`${arm}:${sample}`)) issues.push(`missing ${arm}:${sample}`)
    }
  }

  const incorrect = decisions.filter(decision => {
    const expectedCommand = decision.arm === 'lplus' ? LIVE_LEARNED_COMMAND : LIVE_LMINUS_COMMAND
    const expectedInjections = decision.arm === 'lplus' ? 1 : 0
    return decision.exitStatus !== 0
      || decision.command !== expectedCommand
      || decision.learningInjectionCount !== expectedInjections
      || !Array.isArray(decision.deliveredItemIds)
      || decision.deliveredItemIds.length !== expectedInjections
      || decision.deliveredItemIds.some(id => typeof id !== 'string' || id === '')
  })
  const lminusCount = decisions.filter(decision => decision.arm === 'lminus').length
  const lplusCount = decisions.filter(decision => decision.arm === 'lplus').length
  const lplusItemIds = new Set(decisions
    .filter(decision => decision.arm === 'lplus')
    .flatMap(decision => decision.deliveredItemIds ?? []))
  if (lplusCount === 3 && lplusItemIds.size !== 1) issues.push('L+ samples did not deliver one stable learning item')
  const counts = {
    semanticDecisions: decisions.length,
    lminusSemanticDecisions: lminusCount,
    lplusSemanticDecisions: lplusCount,
    unsafeOrIncorrect: incorrect.length,
    invalidStructure,
    transport,
    retries,
    redSamples: incorrect.length,
  }
  const pass = issues.length === 0 && lminusCount === 3 && lplusCount === 3 && incorrect.length === 0
  const status = pass ? 'PASS' : (decisions.length < 6 ? 'UNPROVEN' : 'FAIL')
  return { pass, status, issues, counts }
}

/** Validate runtime identity and every stored count/decision in a live result. */
export function validateLiveSemanticResult(result, expectedCommit) {
  const evaluation = evaluateLiveSamples(result?.samples)
  const issues = [...evaluation.issues]
  if (result?.schema !== 'dsh-learning/live-semantic-v1') issues.push('wrong live semantic schema')
  if (result?.runtime?.dshVersion !== '0.1.0-rc.8') issues.push('live result did not run rc.8')
  if (result?.runtime?.dshCommit !== expectedCommit) issues.push('live result commit mismatch')
  if (result?.runtime?.profile !== 'headless') issues.push('live result profile mismatch')
  if (result?.runtime?.provider !== 'deepseek-official') issues.push('live result provider mismatch')
  if (result?.runtime?.model !== 'deepseek-v4-flash') issues.push('live result did not run the preregistered DeepSeek Flash model')
  if (result?.preregistration?.prompt !== LIVE_PROMPT
    || result?.preregistration?.expectedLearnedCommand !== LIVE_LEARNED_COMMAND
    || result?.preregistration?.samplesPerArm !== 3
    || result?.preregistration?.maxRetryForTransportOrInvalidStructure !== 1
    || result?.preregistration?.semanticDecisionRetries !== 0) {
    issues.push('live preregistration does not match the release gate')
  }
  if (JSON.stringify(result?.counts) !== JSON.stringify(evaluation.counts)) issues.push('stored live counts do not recompute')
  if (result?.overall !== evaluation.status) issues.push('stored live overall does not recompute')
  if (result?.layers?.stochasticSemanticGate !== evaluation.status) {
    issues.push('stored stochastic layer does not recompute')
  }
  const expectedUnsafeStatus = evaluation.counts.semanticDecisions < 6
    ? 'UNPROVEN'
    : (evaluation.counts.unsafeOrIncorrect === 0 ? 'PASS' : 'FAIL')
  if (result?.layers?.unsafeOutputEvidence !== expectedUnsafeStatus) {
    issues.push('stored unsafe layer does not recompute')
  }
  const pass = evaluation.pass && issues.length === 0
  const status = pass ? 'PASS' : (evaluation.status === 'UNPROVEN' ? 'UNPROVEN' : 'FAIL')
  return { ...evaluation, pass, status, issues }
}

function reconstructEvidenceItemIds(evidence, key, issues) {
  if (evidence?.readSucceeded !== true || !Number.isInteger(evidence?.eventCount) || evidence.eventCount < 1) {
    issues.push(`${key} session log was not successfully read`)
  }
  if (!Array.isArray(evidence?.learningMessages)) {
    issues.push(`${key} session evidence is missing learning messages`)
    return []
  }
  const ids = []
  for (const event of evidence.learningMessages) {
    if (event?.type !== 'user/message' || event?.data?.source?.kind !== 'dsh-learning-recall') {
      issues.push(`${key} contains malformed learning-message evidence`)
      continue
    }
    for (const id of event.data.source.itemIds ?? []) {
      if (typeof id === 'string' && id !== '' && !ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

function emptyCounts() {
  return {
    semanticDecisions: 0,
    lminusSemanticDecisions: 0,
    lplusSemanticDecisions: 0,
    unsafeOrIncorrect: 0,
    invalidStructure: 0,
    transport: 0,
    retries: 0,
    redSamples: 0,
  }
}
