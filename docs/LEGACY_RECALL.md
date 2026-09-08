# Legacy explicit recall

This is the retained 0.3 contract, not the default 0.4 native workflow.
Select `mode: legacy-recall` and a store path in the `dsh-learning` profile row before using the CLI. Native mode does not consume this store.

```yaml
- id: dsh-learning
  config:
    mode: legacy-recall
    storePath: !!js process.env.DSH_LEARNING_STORE || dshHomePath('dsh-learning-store.json')
```

From the intended project directory, using the installed profile CLI:

```sh
DSH_LEARNING_BIN="${DSH_HOME:-$HOME/.dsh}/profiles/headless/node_modules/.bin/dsh-learning"
"$DSH_LEARNING_BIN" record --profile headless \
  --statement "Use pnpm instead of npm for dependency installs." \
  --scope workspace --workspace-id "$(pwd -P)" \
  --keyword install,installs,installed,installing --keyword dependencies \
  --exclude "explicitly use npm" \
  --override-term npm --override-term yarn --override-term bun
"$DSH_LEARNING_BIN" adopt <item-id>
dsh --profile headless "Install the JavaScript dependencies for this workspace."
```

Candidates never recall until explicitly adopted. Recall filters profile/workspace/session identity and literal keyword groups; current override terms suppress recall. Arbitrary paraphrases and translations are not guaranteed. Manual CLI writes are whole-file, single-writer operations. Invalid stores fail visibly.

The CLI resolves `DSH_LEARNING_STORE`, then `$DSH_HOME/dsh-learning-store.json`, then `~/.dsh/dsh-learning-store.json`. Use the same path in the profile. The runtime only reads this store and injects `source.kind = dsh-learning-recall` messages. It never records or adopts on the user's behalf.

The dependency-free core API remains available:

```js
import {
  createLearningStore, recallLearning, buildLearningMessage,
  reconstructLearningDelivery,
} from 'dsh-learning-bundle/core'
```

Historical evidence: [benchmark](../BENCHMARK.md), [scenario contracts](SCENARIO_BENCHMARK.md), [rc.2 transcript](../benchmark/results/assembled-transcript-current.json). These establish the old injection contract, not natural teaching, current host compatibility, or real-world user value. The bounded 0.3.1 natural-language pilot showed manual keyword recall missing paraphrased and Chinese dependency requests; this motivated the native default.
