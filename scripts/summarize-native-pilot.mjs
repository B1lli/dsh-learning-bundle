// Strip raw requests, model reasoning and private session archives from the pilot report.
import fs from 'node:fs'

if (!process.argv[2] || !process.argv[3]) {
  throw new Error('Usage: node scripts/summarize-native-pilot.mjs <private-results.json> <public-summary.json>')
}
const r = JSON.parse(fs.readFileSync(process.argv[2]))
const sums = (xs, key) => xs.reduce((n, x) => n + (x?.[key] ?? 0), 0)
const out = {
  schemaVersion: 1,
  packageVersion: r.pack?.status === 0 ? JSON.parse(r.pack.stdout)[0].version : null,
  dshVersion: r.dshVersion ?? null,
  dshVersionEvidence: r.dshVersionEvidence ?? null,
  kind: r.spec.kind, model: r.spec.model,
  startedAt: r.startedAt, finishedAt: r.finishedAt, status: r.status,
  error: r.error ?? null, cleanup: r.sessionRootRemoved,
  plannedSessionsPerArm: r.spec.tasks.length + 1,
  netUserValue: 'UNPROVEN', providerBill: 'UNPROVEN',
  notes: [
    'Synthetic engineering pilot; baseline-green cases are controls.',
    'Counts and outcomes below describe recorded runs, including stopped runs.',
    'Reported tokens include cache reads; session-title requests have no captured usage.',
    'Missing usage or artifact evidence is unknown, not a zero cost or a pass.',
    'Elapsed time and reply characters are observations, not causal or cognitive-cost estimates.',
  ],
  arms: [],
}
for (const a of r.arms) {
  const runs = a.runs.map(x => {
    const expected = r.spec.acceptance.commands[x.id]
    const final = x.stdout.trim()
    const session = x.session ?? {}
    const events = session.selectedEvents ?? []
    const calls = session.toolCalls ?? []
    const usage = session.usage
    const usageComplete = Array.isArray(usage) && usage.every(u => u &&
      ['inputTokens', 'outputTokens', 'totalTokens'].every(k => typeof u[k] === 'number') &&
      // DSH's pi-ai adapter omits cacheReadTokens when cacheRead is zero.
      (u.cacheReadTokens === undefined || typeof u.cacheReadTokens === 'number'))
    const instructions = events.filter(e => e.type === 'user/message' && e.data.source?.kind === 'agent-instructions')
    const testCalls = calls.filter(c => c.name === 'bash' &&
      /(?:npm|yarn|pnpm) test|node --test/.test(JSON.parse(c.arguments).command ?? ''))
    const testEvidence = testCalls.map(c => ({
      step: c.step, command: JSON.parse(c.arguments).command,
      results: events.filter(e => e.type === 'tool/result' && e.data.message?.source?.callId === c.callId)
        .flatMap(e => e.data.message.content),
    }))
    return {
      id: x.id, exitStatus: x.status, error: x.error ?? null, sessionReadError: session.readError ?? null,
      expected: expected ?? null, final,
      rawExact: expected === undefined ? null : x.status === 0 && final === expected,
      wallMs: x.wallMs, replyCharacters: [...final].length,
      modelCalls: Array.isArray(usage) ? usage.length : null,
      usage: usageComplete ? Object.fromEntries(['inputTokens', 'cacheReadTokens', 'outputTokens', 'totalTokens']
        .map(k => [k, sums(usage, k)])) : null,
      nativeInstructionSnapshots: session.selectedEvents ? instructions.length : null,
      nativeInstructionChanges: instructions.flatMap(e => e.data.source.changes ?? []).map(({ action, path }) => ({ action, path })),
      agents: x.workspace.find(f => f.file === 'AGENTS.md')?.text ?? null,
      legacyStore: x.store, toolNames: calls.map(c => c.name), testEvidence,
      editSteps: calls.filter(c => ['write', 'edit'].includes(c.name)).map(c => c.step),
    }
  })
  const usageComplete = runs.length > 0 && runs.every(x => x.usage !== null)
  const callsComplete = runs.length > 0 && runs.every(x => x.modelCalls !== null)
  out.arms.push({
    id: a.id, observedSessions: runs.length, setupWallMs: sums(a.setup, 'wallMs'),
    usageComplete,
    mainModelCalls: callsComplete ? sums(runs, 'modelCalls') : null,
    reportedTokens: usageComplete ? sums(runs.map(x => x.usage), 'totalTokens') : null,
    cacheReadTokens: usageComplete ? sums(runs.map(x => x.usage), 'cacheReadTokens') : null,
    wallMs: sums(runs, 'wallMs'), replyCharacters: sums(runs, 'replyCharacters'),
    rawExact: { passed: runs.filter(x => x.rawExact === true).length, total: runs.filter(x => x.rawExact !== null).length },
    artifactCheck: a.artifactCheck ? {
      status: a.artifactCheck.status === 0 ? 'PASS' : 'FAIL',
      exitStatus: a.artifactCheck.status, stdout: a.artifactCheck.stdout, stderr: a.artifactCheck.stderr,
    } : { status: 'UNPROVEN', reason: 'No independent artifact check was recorded' },
    runs,
  })
}
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify(out.arms.map(({ runs, ...a }) => a), null, 2))
