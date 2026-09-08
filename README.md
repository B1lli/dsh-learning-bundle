# dsh-learning-bundle

Unofficial workflow bundle for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Teach project conventions in ordinary language. The agent maintains the existing project instruction file, applies it in later sessions, and uses relevant existing checks before delivering changed work.

**0.4 uses native DSH instructions.** It adds a short workflow prompt, not a second memory database or a correctness gate. It does not add a model judge or automatically run commands. Natural interpretation and compliance remain model-dependent; improved net user value is **UNPROVEN**.

## Install

Requirements: Node `^22.19.0 || >=24.0.0`, pnpm, and a supported DSH release from `package.json`. The supported profile is `headless` with its standard instruction loader and file tools.

```sh
git clone https://github.com/B1lli/dsh-learning-bundle.git
cd dsh-learning-bundle
dsh plugin --profile headless add -w "$(pwd -P)"
```

Then work in your project as usual:

```text
以后在这个项目安装依赖都用 pnpm。后续新对话也遵守。
```

Later, a task may be phrased differently or in another language. A temporary instruction such as “这次用 npm” should leave the default intact. “以后改用 yarn” should update the existing rule, and “撤销这条约定” should remove it. These are agent behaviors to validate, not deterministic guarantees.

The rule remains visible and editable in the project's native instruction file. No record/adopt commands, keywords or item IDs are required. On implementation tasks, verification uses existing project tools at normal permissions. There is a small fixed prompt cost on model requests; no extra review model is introduced.

## Existing users

The original store/CLI/core API is retained as **legacy recall**. A profile with an explicit `storePath` and no `mode` retains legacy behavior. New bundle patches select native mode; an upgrade may replace the old default. To continue using stored rules, override the plugin row:

```yaml
- id: dsh-learning
  config:
    mode: legacy-recall
    storePath: !!js process.env.DSH_LEARNING_STORE || dshHomePath('dsh-learning-store.json')
```

To use native mode, remove `storePath` and set `mode: native`. Consolidate desired old rules into the applicable instruction file before switching. No automatic migration or deletion occurs. Uninstalling the bundle leaves project instructions and old stores intact.

See [legacy CLI and evidence](docs/LEGACY_RECALL.md). Its historical keyword and injection benchmarks describe legacy mode only.

## Verification and limits

```sh
npm test
npm run benchmark
npm run benchmark:scenarios
```

[Live pilot: results and remaining failures](docs/NATIVE_PILOT.md).

[Detailed design](docs/NATIVE_WORKFLOW_DESIGN.md) explains ownership, cost, scope, upgrade behavior and acceptance. [Compatibility and permissions](docs/STORE_COMPATIBILITY.md) describe installation evidence and failure boundaries. Live results are reported separately from deterministic contracts; passing synthetic examples does not establish user value.

Custom deployments that replace the complete system prompt or disable/truncate native instructions may suppress this workflow. Native DSH refresh behavior applies: use native read/edit/write for same-session changes.

MIT licensed. Community project; not affiliated with DeepSeek.
