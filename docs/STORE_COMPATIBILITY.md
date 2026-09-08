# DSH STORE compatibility and permissions

This package tracks [upstream issue #4](https://github.com/B1lli/dsh-learning-bundle/issues/4)
and [DSH STORE #633](https://github.com/AI-Scarlett/DSH-Store/issues/633).
It addresses package metadata and reproducible installation evidence. It does
not assert automatic marketplace approval or a security certification.

## Contract and scope

The package is a **direct**, root-level DSH Bundle: `package.json` →
`cordis.patch.yml` → one `dsh-learning` entry → `lib/index.js`. Native mode registers one `systemPrompt.section`; legacy mode retains the
`agent/pre-step` listener. No model Tool, browser Client, or HTTP route is
registered. Version 0.4 changes the default workflow; see the
[native design and upgrade boundary](NATIVE_WORKFLOW_DESIGN.md).

The intended operators are local collaborators managing their own correction
store. Production risk is **R1** (user-owned local state). The standalone live
benchmark has **R2** capabilities and is never invoked by plugin startup.
The acceptance target is **E3**, a disposable headless Profile; an existing
user Profile, Web UI, live model quality, and STORE approval are separate.

| Surface | Actual capability and boundary |
| --- | --- |
| Files | `src/index.js` reads the configured learning JSON. Manual `record`/`adopt` creates its parent directory and writes that file. Native mode performs no direct file IO; it guides the main agent to use native DSH tools on project instructions. Legacy `lib/legacy-recall.js` only reads. No filesystem sandbox is supplied by this package; the operator controls the path. |
| Environment | Legacy mode reads `DSH_LEARNING_STORE`, `DSH_HOME`, and `DSH_PROFILE_ID` for path/profile selection. STORE's scanner treats any `process.env` access as a credentials signal; these variables are not credentials. |
| Commands | The `dsh-learning` executable is a JavaScript CLI for manual record/adopt/list operations. Production code does not spawn a shell or subprocess. Repository benchmark and acceptance scripts invoke Node, DSH, npm, git, and zstdcat. |
| Network and credentials | The production plugin and manual CLI make no network requests and read no API keys. Native project instructions and legacy adopted text enter the normal DSH model context and durable session log, so the configured DSH provider can receive it. Never store secrets as corrections. The optional live benchmark uses the operator-supplied `DEEPSEEK_API_KEY` and DeepSeek service; installation/startup never invokes it. |
| Executable/native artifacts | `scripts/learning.mjs` is an executable text file with a Node shebang and a manifest `bin` entry. There are no shipped native binaries or native builds. Preserve this legitimate executable capability. |
| Dependencies | No npm runtime, optional, peer, or bundled dependencies, and no `preinstall`, `install`, `postinstall`, or `prepare` script. JavaScript runtime artifacts are committed. DSH and pnpm are external host/install prerequisites. |
| Evaluation tools | Offline lifecycle acceptance needs Node, npm, pnpm, an exact installed official DSH CLI, and this checkout. Historical transcript reconstruction additionally needs git and zstdcat; the optional live benchmark additionally needs the DeepSeek service and key. |

Node range is declared in `engines.node`; it is a supported engine range,
not a claim that every version/OS has been tested. Per-run Node/OS facts are
recorded in the evidence. Exact DSH releases are used instead of a broad range
covering untested prereleases. Headless acceptance does not prove Web/TUI.

## Failure, uninstall, and recovery

- In native mode, instruction loading, file access policy, truncation and complete-system-prompt overrides follow the host. Saving a file is not proof of later compliance. Uninstall preserves native instruction files.
- In legacy mode, a missing store starts empty. Invalid JSON, an unsupported store shape, or
  filesystem permission errors propagate; no successful recall is fabricated.
  The host may log a plugin activation failure without exiting immediately.
- Candidate items do not recall. Missing/mismatched scope identities do not
  recall; profile resolution without `--profile` or `DSH_PROFILE_ID` throws.
- Writes are synchronous whole-file writes intended for one local writer.
  Concurrent CLI writers are unsupported; keep a backup before manual edits.
  The plugin does not promise atomic crash recovery or encrypted storage.
- Uninstall with `dsh plugin --profile headless remove -w dsh-learning-bundle`.
  Verify `dsh --profile headless --dump-config` has no `dsh-learning` entry.
  Uninstall removes the package and bundle layer, **retaining the learning
  store**. Delete only that explicitly selected store if data removal is wanted.
- Recovery is reinstalling the same known package version/tarball and retained
  store. The lifecycle test checks the restored learned behavior. This is not
  evidence of a cross-version downgrade or a failure-atomic package transaction.

## Reproduce disposable acceptance

Install an exact official DSH release into a temporary tool directory, then run
from this checkout (example for the current stable npm channel):

```sh
DSH_TOOLS_DIR="$(mktemp -d)"
npm install --prefix "$DSH_TOOLS_DIR" --no-audit --no-fund @deepseek-ai/dsh@0.1.2-rc.1
DSH_CLI_PATH="$DSH_TOOLS_DIR/node_modules/@deepseek-ai/dsh/lib/bin.js" \
DSH_EXPECTED_VERSION=0.1.2-rc.1 \
DSH_LIFECYCLE_OUTPUT=/tmp/dsh-learning-lifecycle.json \
npm run test:lifecycle
```

Remove that temporary tool directory when finished. The test itself creates
and removes its own disposable HOME/DSH_HOME, inherits only PATH, packs this
checkout, installs the tarball using the official CLI, reads composed config,
checks native workflow assembly and fresh-session rule loading/revision/removal,
then legacy candidate/adopted behavior through the installed package, uninstalls,
checks the baseline dependency manifest and behavior, reinstalls for recovery,
and uninstalls again. The offline adapter is a test-only overlay selecting a
deterministic provider; it does not disable or replace official plugins. This
proves plugin delivery behavior through a real host, not LLM effectiveness.

## STORE policy and decisions

The live official release-window resolver on 2026-09-08 returned
`0.1.2-rc.1`, `0.1.3-alpha.1`, and `0.1.3-alpha.2`. The middle version was not
available from npm (`ETARGET`); it stays `unknown`. Historical rc.8/rc.2
transcripts remain historical and are not relabeled as current evidence.

| Decision | Objective / benefit | Cost / reconsider when | Evidence |
| --- | --- | --- | --- |
| Keep the existing Host-only bundle | Reuse native project instructions and preserve opt-in legacy recall without a DSH fork | No UI; reconsider when a UI is requested | Single production patch entry and installed headless runs |
| Declare exact versions | Avoid suggesting untested releases work | Requires refreshing evidence for new host releases | Per-release lifecycle reports |
| Keep file access and manual CLI explicit | Preserve persistent learning and deliberate adoption | STORE can retain blocked/user-reviewed policy | Production code and permission table above |
| Keep developer probes available | Reproducible acceptance remains possible | Repository-wide scanners can flag their process/API capabilities | Scripts are manual, with no install lifecycle hooks |

`build-dsh-plugin` is a heuristic static audit. Its Profile-mutation finding
on this repository also sees developer-only assembly scripts that manipulate
isolated test homes; it does not establish that the production plugin manages
Profiles. Do not add a transaction framework to a read-only recall hook just
to satisfy that heuristic. The actual Profile operations in acceptance use
the official CLI and disposable homes.

Automatic `source-verified` approval excludes file access, environment signals,
commands, and executable files. Those signals cannot all disappear from a
persistent-learning plugin without losing intended functionality. Desired
policy after review is `user-reviewed`; actual Catalog status remains under
DSH STORE control. Pushing this repair is not proof of relisting. No STORE
repository changes are part of this repair.

## Observed results (2026-09-08)

| DSH release | Install | Native + legacy start | Uninstall | Same-version recovery |
| --- | --- | --- | --- | --- |
| 0.1.2-rc.1 | PASS | PASS | PASS | PASS |
| 0.1.3-alpha.1 | UNPROVEN (npm ETARGET) | UNPROVEN | UNPROVEN | UNPROVEN |
| 0.1.3-alpha.2 | PASS | PASS | PASS | PASS |

Both executed runs use macOS arm64, Node 22.22.0, and an offline deterministic
adapter. Raw command argv, exit statuses, config readbacks, package file lists,
and cleanup outcomes are in [rc.1 evidence](./evidence/lifecycle-0.1.2-rc.1.json)
and [alpha.2 evidence](./evidence/lifecycle-0.1.3-alpha.2.json). Machine paths
are replaced by named placeholders; provider credentials are not inherited.
The malformed-store probe returns exit 1, and restoring the store recovers
adopted behavior. During the historical 0.3.1 repair, the first test attempt caught a test-assertion mismatch:
pnpm removes `dependencies: {}` on uninstall. The corrected assertion compares
empty/missing dependencies equivalently while still comparing every other
Profile manifest field; both reruns passed. No product change was needed.

The checker used is `AI-Scarlett/build-dsh-plugin` at
`1d4053cee6071b8b7d2e60a15671253601e1a855`; STORE policy was inspected at
`3669bc68a09b4c193f8a9631b9d57adf33efbb30`. Static audit: **74/80, BLOCKED**
by the developer-probe Profile-mutation heuristic described above; this is not
reported as a passing checker result. Actual production lifecycle management
is absent. Runtime evidence is the executed E3 matrix above, not this score.
Remaining external gate: STORE recheck and its decision about elevated
capabilities; relisting is **UNPROVEN**.
