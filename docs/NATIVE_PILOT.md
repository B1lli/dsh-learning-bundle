# Native workflow pilot — 2026-09-08

**Engineering path: PASS. Net user value: UNPROVEN. Command-only behavior: FAIL in both arms.**

This is a synthetic integration pilot, not a qualified real-incident effect corpus. It uses one official DSH 0.1.3-alpha.2 host, DeepSeek V4 Flash (`deepseek-v4-flash-ga-260731`, Volcengine anthropic-messages provider), and two serial arms with the same initial files and teaching. Each arm has ten fresh sessions: teaching, paraphrase, temporary exception, Chinese follow-up, revision, revised follow-up, revocation, revoked follow-up, code delivery, unrelated arithmetic.

The [frozen inputs](../fixtures/native-pilot.json) predate execution. No failed model result was retried. The complete compressed sessions remain local; the [public summary](evidence/native-pilot-0.4.0.json) includes final answers, native instruction changes and file snapshots, actual test tool results, model usage, and all failed exact matches. It excludes raw model reasoning and credentials.

| Observation | Native DSH alone | Bundle native workflow |
| --- | ---: | ---: |
| Completed fresh sessions | 10/10 | 10/10 |
| Package choice on four command probes | 4/4 | 4/4 |
| One-authority teaching / update / revoke | observed | observed |
| Temporary exception preserves default | PASS | PASS |
| Unrelated rule preserved | PASS | PASS |
| Code delivery independently checked after first final | PASS | PASS |
| Actual tests after final code edit | `node --test`, step 5 after edit step 3 | `npm test`, step 5 after edit step 4 |
| Unrelated arithmetic, no extra tools | PASS | PASS |
| Six short-response probes, raw exact match | 3/6 | 3/6 |
| Main model requests, including teaching | 35 | 24 |
| Reported tokens, including cache reads | 296,185 | 197,174 |
| Of those, cache-read tokens | 245,504 | 171,008 |
| Session elapsed time | 145.024 s | 83.534 s |
| Installation time | none | 3.464 s |
| Reply characters across all ten sessions | 2,735 | 1,238 |

Raw exact-match failures include harmless Markdown code wrapping and terminal punctuation. Separately, **both arms added explanation to the temporary-exception request despite “只给命令”**. Normalizing only wrapping/punctuation would give 5/6 concise responses in both arms; this post-run reading does not replace the frozen raw score. The new arm also promised future compliance in its teaching acknowledgment despite the workflow explicitly advising against that claim. These failures remain evidence that guidance is not enforcement.

Both arms correctly preserved existing greeting calls and added uppercase support. Independent checks called the delivered function with a name, null, no argument, and uppercase true; both exited 0. Their actual test logs also pass. The baseline tried unavailable `yarn test` before falling back to the existing Node script, reflecting a leftover test-command example after revocation. The bundle kept the test instruction generic and ran `npm test` successfully. No artifact repair advantage was established because both first deliveries were correct.

The bundle used fewer observed requests, tokens, elapsed time and reply characters in this sequence. **This is not a causal speed/cost claim**: one ordered sample cannot separate model variability, caching, generated instruction length and system-prompt effects. Main token counts exclude 20 session-title requests whose usage was not supplied. Provider billing, actual user reading time and cognitive effort remain unmeasured.

All disposable homes/workspaces were removed after capture. Real user profiles and projects were not changed. No Docker resources were created.

## Reproduce as an opt-in paid pilot

Requires Node, npm, pnpm, `zstdcat`, an installed exact official CLI, and an operator-supplied compatible provider credential. The script never reads the user's normal DSH configuration or credential file. Supply the key through the environment; do not commit it.

```sh
DSH_CLI_PATH=/path/to/node_modules/@deepseek-ai/dsh/lib/bin.js \
DSH_NATIVE_OUTPUT=/tmp/new-native-pilot-output \
node scripts/run-native-pilot.mjs

node scripts/summarize-native-pilot.mjs \
  /tmp/new-native-pilot-output/results.json \
  /tmp/native-pilot-summary.json
```

`DSH_NATIVE_API_KEY` must already be set. `DSH_NATIVE_BASE_URL` may override the documented Volcengine endpoint; changing provider/model/host creates a different batch, not pooled evidence. Raw output remains private in the selected directory. The published run used the same driver sequence with locally resolved provider settings; the portable driver adds an exact host-version check and environment-only credential input.

## Delivery decision

Ship the small native integration and retain legacy compatibility, while describing it as workflow guidance. Do not build a default extra judge, automatic command gate or repair state machine from these results. The next decision requires complete real repeated-error cases where native instructions fail and the added mechanism improves first delivery at acceptable total cost. Incomplete reconstructed historical fixtures are excluded from that claim.
