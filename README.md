# dsh-learning-bundle

> Unofficial community bundle for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

A governed learning loop for `dsh`: record a correction as a candidate, adopt
it deliberately, recall it only in the right profile/workspace/session, and
reconstruct every model-visible delivery from the session log.

![Terminal-style summary of the verified rc.8 run](./docs/demo.svg)

This is a deliberately narrow Stage 0+1 release. It does not auto-generate
memories, silently activate them, or claim to be a general RAG system.

## Why it exists

Agent corrections are useful only if they are safe to reuse. A global,
invisible memory can leak one project's convention into another; an opaque
prompt injection is difficult to audit; automatic activation can turn a bad
guess into a durable rule.

This bundle uses four concrete boundaries:

- new items remain `candidate` until an explicit `adopt`;
- profile, workspace, and session scopes fail closed;
- a current explicit instruction overrides a learned default;
- recalled items are logged as `user/message` records with
  `source.kind = dsh-learning-recall`.

The checked rc.8 evidence also demonstrates an observable difference: the
same task produces `npm install` before adoption and `pnpm install` after the
adopted rule is delivered.

## Behavior status

| Behavior | Evidence |
|---|---|
| candidate → explicit adoption → active recall | implemented and tested |
| profile/workspace/session isolation | implemented and tested |
| current explicit instruction wins | implemented and tested |
| adjacent-negative prompts do not recall | implemented and tested |
| logged, reconstructable delivery | implemented and tested |
| real headless plugin assembly on `dsh` rc.8 | checked transcript |
| live DeepSeek 3× L− / 3× L+ semantic sample | checked snapshot |
| Web UI, team sharing, automatic extraction, sealed holdout | not claimed |

The live sample is a bounded demonstration, not a population success rate.

## Real-world scenario evidence

The public scenario benchmark covers eight common pains: package-manager drift,
Python test entry points, formatters, monorepo builds, deployment defaults,
session-only debugging, bilingual release notes, and `.env` bootstrap. All
**72/72 deterministic product-contract probes pass** across candidate blocking,
adopted recall, paraphrases, adjacent negatives, identity isolation, current
overrides, exact delivered content, and delivery reconstruction.

This is public regression evidence, not a claim about model quality. It stays
separate from the checked 3× L− / 3× L+ live DeepSeek sample and the pinned rc.8
assembled consumer. See [the scenario report](./docs/SCENARIO_BENCHMARK.md) and
[machine-readable result](./benchmark/results/scenarios.json).

## Install and try it

Requirements: Node 22.19+/24+, `pnpm`, and the `dsh` CLI.

```sh
git clone https://github.com/B1lli/dsh-learning-bundle.git
cd dsh-learning-bundle

# Link this checkout into the headless profile and activate its bundle layer.
dsh plugin --profile headless add -w "$(pwd -P)"

# Record a correction. It is a non-recallable candidate at this point.
node scripts/learning.mjs record \
  --profile headless \
  --statement "Use pnpm instead of npm for dependency installs." \
  --scope workspace --workspace-id "$(pwd -P)" \
  --keyword install,installs,installed,installing --keyword dependencies \
  --exclude "explicitly use npm" \
  --override-term npm --override-term yarn --override-term bun

# Adopt the returned item id, then run a relevant task.
node scripts/learning.mjs adopt <item-id>
dsh --profile headless "Install the JavaScript dependencies for this workspace."
```

Each `--keyword` is one required trigger group. Comma-separated values inside
the same flag are literal alternatives: plain ASCII words use word boundaries,
while developer tokens such as `C++`, `@scope/pkg`, CLI flags, and dotfiles are
matched by their literal spelling. Each `--override-term` names a choice in the
current task that suppresses the learned default. The CLI resolves workspace
paths to their physical identity so symlink checkouts match dsh's recorded cwd.

The CLI and plugin resolve the same store in this order:
`DSH_LEARNING_STORE`, `$DSH_HOME/dsh-learning-store.json`, then
`~/.dsh/dsh-learning-store.json`.

## Core API

The Cordis plugin is the package's default export. Dependency-free learning
primitives are available through the explicit `dsh-learning-bundle/core`
subpath:

```js
import {
  createLearningStore,
  recallLearning,
  buildLearningMessage,
  reconstructLearningDelivery,
} from 'dsh-learning-bundle/core'
```

The plugin itself is read-only: it recalls adopted items during
`agent/pre-step`, but never records or adopts them.

## Verify

The fast checks do not need credentials and do not modify checked-in evidence:

```sh
npm test
npm run benchmark
npm run benchmark:scenarios
```

To rebuild the real assembled transcript, clone and build the exact official
rc.8 commit below. `zstdcat` from the `zstd` package is required to inspect
the durable session logs.

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git checkout 141eb6fef83422698aef7a981029e843e8161534
corepack enable
pnpm install --frozen-lockfile
pnpm run build

cd /path/to/dsh-learning-bundle
export DSH_SOURCE_ROOT=/path/to/deepseek-harness
export DSH_CLI_PATH="$DSH_SOURCE_ROOT/apps/cli/lib/bin.js"
npm run benchmark:assemble
npm run benchmark:refresh
```

To refresh the preregistered live semantic snapshot, supply the API key only
to the process; it is never written to results:

```sh
DEEPSEEK_API_KEY=... \
DSH_SOURCE_ROOT=/path/to/deepseek-harness \
DSH_CLI_PATH=/path/to/deepseek-harness/apps/cli/lib/bin.js \
npm run benchmark:live
npm run benchmark:refresh
```

See [BENCHMARK.md](./BENCHMARK.md) for the gates, retry policy, evidence
layers, and explicit non-claims.

## Project layout

- `src/index.js` — dependency-free learning lifecycle and recall core;
- `lib/index.js` — Cordis `agent/pre-step` consumer;
- `scripts/learning.mjs` — manual record/adopt/list CLI;
- `scripts/run-benchmark.mjs` — fast acceptance decision;
- `scripts/run-scenario-benchmark.mjs` — eight-scenario, 72-probe regression;
- `scripts/assemble-transcript.mjs` — real rc.8 headless assembly;
- `scripts/run-live-semantic.mjs` — bounded live DeepSeek semantic gate;
- `benchmark/results/` — sanitized, inspectable evidence snapshots.

## License

MIT. See [NOTICE](./NOTICE) for provenance.
