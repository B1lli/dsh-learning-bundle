# Common-user scenario benchmark

This public regression suite asks a narrower, practical question: after a user
explicitly adopts a correction, does the bundle apply it to the same kind of
task, keep it out of neighboring tasks and other identities, respect a current
override, deliver the exact model-visible statement, and leave a reconstructable
delivery record?

## Checked result

`fixtures/scenarios.json` contains eight common situations across eight work
strata. `npm run benchmark:scenarios` executes nine product-contract probes for each
scenario. The checked `benchmark/results/scenarios.json` result is:

- scenarios: **8/8 PASS**;
- deterministic product-contract probes: **72/72 PASS**;
- unsafe tolerance for candidate recall, scope leakage, adjacent-task recall,
  and current-instruction reversal: **zero**.

| Target user and recurring pain | Scope | Adopted statement delivered on relevant tasks |
|---|---|---|
| JS/TS maintainer: wrong package manager | workspace | use pnpm for dependency installs |
| Python maintainer: wrong test entry point | workspace | run `uv run pytest` |
| Repository maintainer: wrong formatter | workspace | use Biome |
| Monorepo maintainer: whole-repo build | workspace | build only the web package |
| Operator: unsafe deployment default | workspace | target staging by default |
| Incident debugger: temporary rule leaks | session | use the local fixture endpoint |
| Bilingual maintainer: wrong release-note format | profile | draft concise Chinese and English sections |
| New contributor: missed `.env` bootstrap | workspace | copy `.env.example` before start |

Each row is evaluated against the same nine probes: candidate non-recall on the
primary and paraphrase prompts, primary and paraphrase recall after adoption,
adjacent negative, wrong identity, explicit override suppression, exact
model-visible statement delivery, and logged delivery reconstruction.

## What the number means

The 72 probes run the real exported lifecycle, matching, scoping, override, and
delivery-reconstruction APIs. They do not fabricate downstream outputs. This
layer proves that the product carries each adopted rule to the intended task
and identity, while withholding it from candidates, neighbors, other identities,
and explicit overrides. It does not prove current-model generation or quality.

Model and integration evidence stays separate:

- the checked live snapshot preserves a bounded DeepSeek sample: 3× L− and 3×
  L+ semantic decisions;
- the assembled transcript runs the actual plugin and CLI against pinned DSH
  `dsh-v0.1.0-rc.8`, showing `npm install` before adoption and `pnpm install`
  after delivery, plus external durable-log reconstruction;
- aggregate canary performance and a sealed holdout remain **UNPROVEN**.

No average is calculated across these evidence layers, and the public scenario
rows are regression data rather than a blind holdout.

## Run it

The normal command validates the suite and leaves checked evidence untouched:

```sh
npm run benchmark:scenarios
```

After intentionally changing the dataset or evaluator, refresh the inspectable
snapshot explicitly:

```sh
npm run benchmark:scenarios:refresh
npm run benchmark:refresh
```
