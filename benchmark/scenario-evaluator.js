export const SCENARIO_PROBE_IDS = [
  'candidate-primary',
  'candidate-paraphrase',
  'active-primary',
  'active-paraphrase',
  'adjacent-negative',
  'wrong-identity',
  'explicit-override-recall',
  'delivered-statement',
  'logged-reconstruction',
]

export async function evaluateScenarioSuite({ api, suite, createStore }) {
  validateScenarioSuite(suite)
  if (typeof createStore !== 'function') throw new TypeError('createStore must be a function')

  const scenarios = []
  for (const scenario of suite.scenarios) scenarios.push(await evaluateScenario({ api, scenario, createStore }))
  const probes = scenarios.flatMap(scenario => scenario.probes)
  const passed = probes.filter(probe => probe.status === 'PASS').length
  return {
    schemaVersion: 1,
    suiteId: suite.suiteId,
    datasetClass: suite.datasetClass,
    evaluatorRevision: suite.evaluatorRevision,
    scenarioCount: scenarios.length,
    probeCount: probes.length,
    passedProbeCount: passed,
    failedProbeCount: probes.length - passed,
    overall: passed === probes.length ? 'PASS' : 'FAIL',
    scenarios,
  }
}

export function validateScenarioSuite(suite) {
  if (suite?.schemaVersion !== 1) throw new Error('scenario suite schemaVersion must be 1')
  if (suite.datasetClass !== 'public_regression') throw new Error('scenario suite must declare public_regression')
  if (suite.evaluatorRevision !== 'common-scenario-contract-v1') throw new Error('unknown scenario evaluator revision')
  if (!Array.isArray(suite.scenarios) || suite.scenarios.length < 8) {
    throw new Error('scenario suite must contain at least eight scenarios')
  }
  const ids = new Set()
  const strata = new Set()
  const semanticShapes = new Set()
  const scopeLevels = new Set()
  for (const scenario of suite.scenarios) {
    if (typeof scenario.id !== 'string' || scenario.id === '' || ids.has(scenario.id)) {
      throw new Error(`invalid or duplicate scenario id: ${scenario.id}`)
    }
    ids.add(scenario.id)
    for (const field of ['audience', 'pain', 'stratum', 'profileId', 'statement']) {
      if (typeof scenario[field] !== 'string' || scenario[field] === '') throw new Error(`${scenario.id}: missing ${field}`)
    }
    if (strata.has(scenario.stratum)) throw new Error(`${scenario.id}: duplicate stratum ${scenario.stratum}`)
    strata.add(scenario.stratum)
    if (!['profile', 'workspace', 'session'].includes(scenario.scope?.level)) throw new Error(`${scenario.id}: invalid scope`)
    scopeLevels.add(scenario.scope.level)
    for (const key of ['primary', 'paraphrase', 'adjacentNegative', 'explicitOverride']) {
      if (typeof scenario.prompts?.[key] !== 'string' || scenario.prompts[key] === '') throw new Error(`${scenario.id}: missing prompt ${key}`)
    }
    if (!Array.isArray(scenario.trigger?.keywordGroups) || scenario.trigger.keywordGroups.length === 0) {
      throw new Error(`${scenario.id}: missing trigger groups`)
    }
    const semanticShape = JSON.stringify({
      statement: scenario.statement,
      trigger: scenario.trigger,
      prompts: scenario.prompts,
    })
    if (semanticShapes.has(semanticShape)) throw new Error(`${scenario.id}: duplicate semantic scenario`)
    semanticShapes.add(semanticShape)
  }
  for (const requiredScope of ['profile', 'workspace', 'session']) {
    if (!scopeLevels.has(requiredScope)) throw new Error(`scenario suite must cover ${requiredScope} scope`)
  }
  return suite
}

async function evaluateScenario({ api, scenario, createStore }) {
  const store = await createStore(scenario)
  const item = await store.record({
    id: `scenario-${scenario.id}`,
    profileId: scenario.profileId,
    statement: scenario.statement,
    scope: scenario.scope,
    trigger: scenario.trigger,
  })
  const base = contextFor(scenario, scenario.prompts.primary)
  const candidateRecall = api.recallLearning({ items: await store.list(), ...base })
  const candidateParaphraseRecall = api.recallLearning({
    items: await store.list(),
    ...contextFor(scenario, scenario.prompts.paraphrase),
  })
  await store.adopt(item.id)
  const items = await store.list()
  const primaryRecall = api.recallLearning({ items, ...base })
  const paraphraseRecall = api.recallLearning({ items, ...contextFor(scenario, scenario.prompts.paraphrase) })
  const negativeRecall = api.recallLearning({ items, ...contextFor(scenario, scenario.prompts.adjacentNegative) })
  const wrongIdentityRecall = api.recallLearning({ items, ...wrongIdentityContext(scenario) })
  const overrideRecall = api.recallLearning({ items, ...contextFor(scenario, scenario.prompts.explicitOverride) })
  const message = api.buildLearningMessage({ recalled: primaryRecall, lane: 'pre-step' })
  const delivery = api.reconstructLearningDelivery([{ type: 'user/message', message }])
  const deliveredText = message.content
    ?.filter(part => part?.type === 'text')
    .map(part => part.text)
    .join('\n') ?? ''

  const probes = [
    probe('candidate-primary', 0, candidateRecall.length),
    probe('candidate-paraphrase', 0, candidateParaphraseRecall.length),
    probe('active-primary', 1, primaryRecall.length),
    probe('active-paraphrase', 1, paraphraseRecall.length),
    probe('adjacent-negative', 0, negativeRecall.length),
    probe('wrong-identity', 0, wrongIdentityRecall.length),
    probe('explicit-override-recall', 0, overrideRecall.length),
    probe('delivered-statement', scenario.statement, deliveredText),
    probe('logged-reconstruction', {
      sourceKind: 'dsh-learning-recall',
      itemId: item.id,
      lane: 'pre-step',
      scope: scenario.scope,
    }, {
      sourceKind: message.source?.kind,
      itemId: delivery.items?.[0],
      lane: delivery.lane,
      scope: delivery.scope,
    }),
  ]

  return {
    id: scenario.id,
    audience: scenario.audience,
    pain: scenario.pain,
    stratum: scenario.stratum,
    scope: scenario.scope.level,
    deliveredStatement: scenario.statement,
    status: probes.every(entry => entry.status === 'PASS') ? 'PASS' : 'FAIL',
    probes,
  }
}

function contextFor(scenario, prompt) {
  return {
    prompt,
    profileId: scenario.profileId,
    workspaceId: scenario.scope.workspaceId ?? 'workspace-alpha',
    sessionId: scenario.scope.sessionId ?? 'session-alpha',
  }
}

function wrongIdentityContext(scenario) {
  const context = contextFor(scenario, scenario.prompts.primary)
  if (scenario.scope.level === 'workspace') context.workspaceId = 'workspace-other'
  else if (scenario.scope.level === 'session') context.sessionId = 'session-other'
  else context.profileId = 'profile-other'
  return context
}

function probe(id, expected, actual) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  return { id, status: pass ? 'PASS' : 'FAIL', expected, actual }
}
