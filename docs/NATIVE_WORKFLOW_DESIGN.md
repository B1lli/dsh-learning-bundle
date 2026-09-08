# Native project-rule workflow (0.4)

## Product decision

Target: developers who repeatedly deliver changes in the same project. Success is a correct first delivery with fewer reminders, repairs and reading time at an acceptable model and waiting cost. Persisting a rule, injecting it, or running a tool is not success by itself.

The 0.3.1 exploratory test exposed a wrong default: natural teaching bypassed the manual store, while keyword recall missed two of three positive formulations. Native DSH already succeeded on that simple convention. The smallest justified implementation therefore integrates the native workflow rather than building another memory or enforcement subsystem.

This release implements **workflow guidance**, not an automatic correctness gate. The main agent's existing tools perform persistence and verification. If native DSH already behaves this way, the bundle's extra prompt may provide no net benefit. Continued investment depends on measured first-delivery improvement.

## Ownership and execution

1. The plugin registers one fixed system section, `dsh-learning:project-workflow`, order 190. It describes a method, never user-specific rules. It registers no model, tool, stop hook or user-message injector in native mode.
2. The main agent interprets natural teaching using the complete current conversation. It reads the applicable existing instruction file and edits the authoritative rule in place using DSH `read/edit/write`. When no applicable file exists, it creates project `AGENTS.md`. The user supplies neither keywords nor item IDs nor adoption commands.
3. New defaults, revisions and revocations use the same native file path. Preserve unrelated instructions and narrower scopes. A one-task exception changes the current action, not the stored default. Ambiguous intent can require clarification; ordinary teaching does not require redundant confirmation.
4. DSH's native `agent-instructions` component consumes the file in fresh sessions and refreshes it after native file-tool results. Rule content is not copied into a second database or README. Shell-only writes and external edits have the host's refresh limitations; the workflow deliberately uses native tools.
5. On a substantive delivery, the same main agent interprets applicable rules and selects the smallest existing check that detects the relevant failure. For code, that can be an existing compiler, test or regression. For semantic requirements, it inspects the artifact in current context. Checks run after the last relevant edit; actual failures are repaired within authorized scope. Missing checks are disclosed, never reported as passes.
6. Simple or unrelated tasks incur no persistence, recap, extra check or separate review call merely because the plugin is installed. No autonomous command execution is introduced.

## State and boundaries

| Concern | Owner |
| --- | --- |
| Durable rule and history | Existing project instruction file and ordinary version control |
| Scope and context refresh | Native DSH instruction loader |
| Permanent vs temporary, duplicate meaning, applicable checks | Main agent in current context |
| Tool policy, filesystem permissions, cancellation, session log | Native DSH tools and runtime |
| Artifact correctness | Actual relevant checks plus artifact review; not the plugin registration |

No learning index, event ledger, delivery receipt table, adoption queue, classifier, fallback model, automatic test runner, or repair loop is added. This avoids false enforcement and repeated user maintenance.

## Six design questions

- Cost belongs at the event: teaching uses ordinary file edits. The plugin does not scan any workspace or store on a task's hot path.
- Correctness comes from current state: native files and actual check results are authoritative. No exactly-once delivery bookkeeping.
- Context uses the host channel: only a system section is registered; no user prompt or task data is rewritten. AGENTS is intentionally user-editable durable instruction data, not hidden injected context.
- No idle dynamic work: the plugin adds no per-turn filesystem/model work or sentinel. **There is a fixed prompt cost** on every model request; literal zero-token overhead is not claimed.
- Complexity matches the requirement: the implementation is a small registration and mode dispatch. Teaching remains semantic work for the main agent.
- Structural reuse: native DSH already owns instruction loading and updates. Reusing its tools removes the need for custom write tracking, memory migration or recall synchronization.

## Compatibility and upgrade

New installs select `mode: native`. A pre-existing explicit `storePath` without `mode` still selects the unchanged legacy recall implementation. Explicit `mode: legacy-recall` supports the original CLI/core contract. Native and legacy modes are exclusive; `native` plus `storePath` fails with an actionable error rather than silently ignoring stored rules. The environment variable `DSH_LEARNING_STORE` alone does not switch a new native installation into legacy mode.

Upgrading a bundle can replace its patch default. Users retaining old rules must select legacy mode in their profile override. To migrate deliberately, read the old store with the CLI and ask the agent to consolidate chosen rules into the appropriate native file, then select native mode. The bundle does not auto-copy scoped store records into project instructions. Old stores are neither deleted nor auto-adopted. Uninstall removes guidance but preserves both native project files and old stores.

The documented supported consumer is the official headless profile with its native instruction loader and file tools. Custom deployments that disable these components, truncate instructions, or replace the complete system prompt can prevent the workflow from reaching the model. These are not silent fallback paths. A successful plugin startup alone does not certify those deployments.

## Evidence and cost plan

Separate three layers:

- Deterministic contracts: default mode does not register recall hooks; legacy mode remains intact; invalid config fails; packed installation, native request assembly, file loading, uninstall and reinstall work on each declared DSH version.
- Bounded live integration: identical natural teaching and task sequence with native DSH alone and with this bundle. Exercise fresh-session paraphrase, language change, temporary exception, durable revision, revocation, unrelated work and an existing artifact regression. Retain all results, including failures. No retries to select a green outcome.
- User value: complete real repeated-error cases, first delivery graded before any complaint, stronger native-instructions baseline, costs and user effort. This remains UNPROVEN until suitable complete cases establish improvement. Historical reconstructed fixtures with synthesized missing files are not complete real evidence.

Live pilot limits: one host/model, serial arms, no extra review model, bounded session timeout and output, and aggregate token stop. Report token usage including cache separately from elapsed time; provider billing and cognitive cost are unknown without measurements. A synthetic passing pilot cannot establish a general effect rate or causal latency advantage.

## Prior art and non-goals

Official DSH `system-prompt` and `agent-instructions` source were inspected independently before implementation. Native loading already covers updates/removals and replay; custom direct filesystem writes would miss its native tool-result refresh seam. Claude Code memory and Cursor rules also supply context rather than guarantee artifact compliance. The design reuses that boundary, without borrowing enforcement claims.

No global personal-memory service, team sharing, automatic extraction from arbitrary logs, default independent review, or mandatory all-task gate is included. Add a mechanism only after a complete failure case demonstrates that the native path cannot meet the required outcome at lower total cost.
