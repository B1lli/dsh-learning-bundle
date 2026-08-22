# Release acceptance benchmark

## Decision

The benchmark decides whether the narrow Stage 0+1 bundle satisfies its
published lifecycle, scoping, override, delivery, and assembled-consumer
contracts. It does not decide product-market fit, automatic extraction
quality, team-memory safety, or general model reliability.

The fast release check is credential-free, exits promptly, and leaves a clean
checkout unchanged:

```sh
npm run benchmark
```

`npm run benchmark:refresh` is the explicit maintenance command that rewrites
`benchmark/results/acceptance.json` after evidence snapshots are intentionally
regenerated.

## Public behavior contract

The product core is exported from `dsh-learning-bundle/core` and must provide:

- `createLearningStore({ filePath })` with `record`, `adopt`, `get`, and `list`;
- `recallLearning({ items, prompt, profileId, workspaceId, sessionId })`;
- `buildLearningMessage({ recalled })`, producing a dsh `UserMessage` with
  `source.kind = dsh-learning-recall`;
- `reconstructLearningDelivery(events)`, recovering delivered item ids and
  scope/lane metadata from logged messages.

Production code must not branch on fixture ids, exact benchmark statements,
or benchmark file paths.

## Required gates

1. A new item is `candidate` and cannot recall. Explicit `adopt` makes the same
   relevant item recallable.
2. The same task has an L− arm without injection and an L+ arm with one; the
   assembled consumer must show an observable output difference.
3. Workspace and session items never recall outside their identities.
4. A current instruction naming an alternative suppresses a learned default.
5. A neighboring but irrelevant prompt does not trigger the rule.
6. Every model-visible injection is a logged `user/message` whose structured
   source reconstructs item and scope identity.
7. Manual/headless recording never auto-activates.
8. A real `dsh --profile headless` rc.8 assembly must connect the bundle,
   pre-step consumer, durable session log, and final response.

## Evidence layers

| Layer | Required conclusion | Does not prove |
|---|---|---|
| deterministic replay | lifecycle, scope, override, negative, and reconstruction PASS | current model generation |
| stage fixtures | L−/L+ and cross-scope cases preserve the contract | whole Harness behavior |
| stochastic semantic gate | checked 3× L− / 3× L+ DeepSeek sample PASS | population success rate |
| unsafe output evidence | zero unsafe among the six preserved semantic decisions | zero true risk |
| transport/structure | all attempts and the single allowed retry are reported | semantic quality |
| end-to-end consumer | pinned rc.8 assembled transcript PASS | Web UI or every profile |
| aggregate canary | `UNPROVEN` is allowed for Stage 0+1 | aggregate reliability |
| sealed holdout | `UNPROVEN` without a separate identity/access boundary | blind generalization |

No average score is calculated across these layers.

## Dataset and retry policy

- Checked-in fixtures are public-safe regression data with stable ids.
- Deterministic and completed semantic decisions have zero retries.
- A live sample may retry once only after `transport` or
  `invalid_structure`; both attempts remain in evidence.
- Unsafe/incorrect tolerance is zero for scope leakage, candidate activation,
  and explicit-instruction reversal.
- Samples run sequentially for this initial gate.
- Two retained red snapshots document real failures that changed the gate:
  trigger mismatch and inline-code invalid structure. They are regression
  evidence, not claimed successes.

## Live preregistration

- Runtime: the effective DeepSeek model reported by the `headless` profile;
  model id, dsh version, and dsh commit are recorded.
- Prompt: one public dependency-install task, three first decisions per arm.
- L+: follows the explicitly adopted workspace default.
- L−: receives no learned fact.
- PASS: all three L+ decisions show the learned behavior, all three L−
  decisions remain uninformed by it, and no unsafe output is observed.
- UNPROVEN: fewer than three semantic decisions per arm complete after capped
  infrastructure retries, or the arms are not observably different.
- FAIL: candidate/wrong-scope recall, explicit-instruction reversal, or a
  discarded/replaced semantic decision.

This six-decision sample is an MVP semantic demonstration only.

## Machine-readable results

- `fixtures/manifest.json` — preregistered regression manifest;
- `benchmark/results/baseline.json` — expected pre-implementation state;
- `benchmark/results/acceptance.json` — checked release decision snapshot;
- `benchmark/results/assembled-transcript.json` — real rc.8 headless assembly;
- `benchmark/results/live-semantic.json` — preserved live sample and attempts;
- `benchmark/results/*-fail.json` — retained regression failures.

Checked-in evidence replaces machine-specific paths with `$BUNDLE_ROOT`,
`$DSH_SOURCE_ROOT`, `$DSH_HOME`, and `$NODE`. Session ids, command shape,
model/profile, commit, outcomes, retry counts, durations, and public-safe
message source records remain inspectable.
