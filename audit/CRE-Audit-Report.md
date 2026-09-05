# CRE Integration Audit Report — PrivateSignal (DON-scoped)

**Audit date:** 2026-09-05
**Auditor prompt:** [`audit/CRE-Audit`](CRE-Audit)
**Auditor:** Claude (review-only — no code written or modified)
**Status:** Findings reported; remediation not applied.

---

## Scope

Files that execute inside the Chainlink DON (QuickJS/WASM enclave) or configure the DON deployment:

- **Entrypoints & configuration:** `privatesignal/main.ts`, `privatesignal/workflow.ts`, `privatesignal/workflow.yaml`, `workflow.yaml` (root), `project.yaml`, `privatesignal/config.staging.json`, `privatesignal/config.production.json`, `privatesignal/config.local.json`, `secrets.yaml`
- **Confidential core logic (WASM execution):** `src/handlers/confidentialScorer.ts`, `src/utils/pureMath.ts`, `src/config/policyConfig.ts`, `src/types/scorer.ts`

**Explicitly excluded** (per the prompt): the Node API server (`src/api/*`), off-chain agent loops, and the test suite (`tests/*`).

## Verification method

- Compared every SDK API used against the **installed** `@chainlink/cre-sdk@1.19.1` typings (entrypoint, trigger, runtime, secrets interfaces) — not against assumptions.
- Ran a scoped `tsc --noEmit` of the workflow against the real SDK → **exit 0** (API usage is type-correct).
- Scanned the existing `cre` build output (`.cre_build_tmp.js` / `binary.wasm`) for Node/browser global leakage into the WASM path.
- Checked target/YAML conventions against the Chainlink CRE skill references.

### Method results

| Check | Result |
|---|---|
| Scoped typecheck vs real SDK | ✅ exit 0 |
| Node built-ins leaked into bundle | ✅ none (single guarded `process.env` probe only) |
| `TextEncoder`/`TextDecoder`/`crypto` in bundle | present — expected from the QuickJS runtime, confirm at simulate |
| `viem`/`zod` in DON path | pure JS; both are also `cre-sdk` dependencies |

---

## Objective-by-objective verdict

| Objective | Result |
|---|---|
| 1. QuickJS/WASM compatibility | ✅ **Clean.** No Node built-ins / browser DOM in any in-scope file. |
| 2. TEE security & determinism | ❌ **Fails-open on empty data; attestation is a self-authored placeholder; secrets are not sealed.** |
| 3. Trigger architecture (HTTP + Cron → unified scorer) | ⚠️ **Wired and API-correct, but the Cron path fabricates its input and never delivers on-chain.** |
| 4. Environment isolation | ✅ **Good — mostly moot by design.** The DON never needs `GRAPH_API_KEY`; configs contain no tokens; RPC URLs are `${ENV}` references. |

---

## CRITICAL

### C-1 · The "confidential model weights" are not confidential — compiled into the WASM as source constants; no Vault secret is ever read.

The scorer's header says weights load "from Vault DON secrets" ([confidentialScorer.ts:43](../src/handlers/confidentialScorer.ts#L43)), but the DON path builds secrets from hardcoded code: [workflow.ts:123](../privatesignal/workflow.ts#L123) calls `getDefaultSecretsForStyle`, and [policyConfig.ts:28](../src/config/policyConfig.ts#L28) / [policyConfig.ts:30-49](../src/config/policyConfig.ts#L30-L49) define `DEFAULT_MODEL_WEIGHTS = [0.3, 0.2, 0.2, 0.3]`, all thresholds, and the 1.15/1.0/0.85 multipliers **as literals**. The SDK provides the correct plumbing — `Runner.run(initFn)` receives a `secretsProvider`, and `Runtime` *is* a `SecretsProvider` — and none of it is used. `secrets.yaml` (the file every workflow target wires as `secrets-path`) contains only one unused secret *name* mapping ([secrets.yaml:4-5](../secrets.yaml#L4)). Net effect: any DON node operator (or anyone with the compiled bundle) can read the model in plaintext. **The product's differentiator does not exist in this code path.**

### C-2 · The workflow is not wired through the SDK's TEE/confidential surface.

`initWorkflow` registers handlers with plain `handler(...)` ([workflow.ts:249-258](../privatesignal/workflow.ts#L249-L258)). The SDK models confidential execution separately: `handlerInTee(trigger, fn, tees)` gives the handler a `TeeRuntime`, which is explicitly the "Runtime for Tee mode execution" with `reportFromDon()` for routing requests *out of* the TEE. This code uses standard DON-mode `handler` + `Runtime`, no `tees` constraint, no Confidential HTTP. Whatever a real DON does with standard-mode WASM, it does **not** match the "hardware-isolated enclave" narrative — and with C-1, nothing here is shielded from node operators anyway.

### C-3 · Attestation does not match any real CRE attestation format.

The envelope is self-authored in JS ([confidentialScorer.ts:168-175](../src/handlers/confidentialScorer.ts#L168-L175)): `signature: 'UNVERIFIED_LOCAL_EXECUTION'`, `donId: 'LOCAL_PROTOTYPE_MODE'`, `verified: false`. Credit where due — this version is *honest* (it no longer stamps `verified: true`), but it means: (a) nothing integrates a runtime/DON/enclave signature or quote; (b) on any real deployment the output would always carry `verified:false`; (c) the earlier "VERIFIED_ENCLAVE_EXECUTION (BFT Consensus Proof)" dossier is contradicted by the actual code that would run. A real attestation is a cryptographic signature over enclave execution, not a constant string.

---

## HIGH

### H-1 · Empty/missing position data scores SAFE — fails open, not closed.

With `graphData` present but no positions/no totals, the scorer yields **80/100 → `safe`** under *every* shipped profile. Trace: `ltvScore` defaults to 100 when collateral and debt are both 0 ([confidentialScorer.ts:63](../src/handlers/confidentialScorer.ts#L63)); concentration returns **100 = "diversified"** for zero collateral ([pureMath.ts:19](../src/utils/pureMath.ts#L19)); missing `healthFactor` → 0; so `0.3·100 + 0.2·0 + 0.2·100 + 0.3·100 = 80`, which is ≥ the conservative/balanced/aggressive `safe` thresholds. Input validation only checks that `graphData` *exists* ([confidentialScorer.ts:51-56](../src/handlers/confidentialScorer.ts#L51)). Any HTTP caller can post `{"walletAddress":X,"graphData":{"positions":[]}}` and receive an attested SAFE. "No data" must be its own non-healthy outcome, never indistinguishable from a clean portfolio.

### H-2 · The Cron "monitoring" path is fabricated and inert.

It scores a **hardcoded wallet** (`0x1111…`) against **invented balances** (`positions: []`, HF 3.5, $50k collateral / $10k debt) ([workflow.ts:178-190](../privatesignal/workflow.ts#L178-L190)) → deterministically 100/100 SAFE every tick. It then builds `onSignalUpdate` calldata ([workflow.ts:207-217](../privatesignal/workflow.ts#L207-L217)) but **never sends it** — `EVMClient` and `consensusMedianAggregation` are imported and unused ([workflow.ts:26-29](../privatesignal/workflow.ts#L26-L29)). A scheduled background "monitor" that emits a fabricated SAFE baseline for a nonexistent portfolio and delivers nothing on-chain is worse than no monitor.

### H-3 · Vault-deployment config doesn't match the code's actual needs (reinforces C-1).

`workflow.yaml` promises DON secrets via `secrets-path`, but the only secret the DON could ever read is `PRIVATE_SIGNAL_API_KEY`, which the scorer never uses. Even if you wanted the runtime secrets provider, the deployment secret set contains none of the model parameters the confidential path claims to need.

---

## MEDIUM

### M-1 · Policy profile selection is inert on the DON path.

The HTTP trigger passes `queryParams.policyProfileId` through verbatim; `executeConfidentialScoringWorkflow` only maps `conservative|aggressive|else→balanced` to pick a thresholds set ([workflow.ts:118-121](../privatesignal/workflow.ts#L118-L121)); the scorer then exact-matches `params.policyProfileId` against profile ids `conservative-v1`/`balanced-v1`/`aggressive-v1` ([confidentialScorer.ts:92-103](../src/handlers/confidentialScorer.ts#L92)). `'conservative'` never equals `'conservative-v1'` → multiplier 1.0 + default weights. The 1.15/0.85 multipliers and per-profile weight adjustments are dead on every trigger path.

### M-2 · No runtime schema validation at the HTTP boundary.

Payload is `JSON.parse`d and passed straight to the confidential scorer ([workflow.ts:142-152](../privatesignal/workflow.ts#L142-L152)); only field-presence is checked. Missing `queryId`/`timestamp`/`protocols`/`policyProfileId` are silently accepted, and caller-supplied `queryId`/`timestamp` feed the "execution hash" ([confidentialScorer.ts:164-166](../src/handlers/confidentialScorer.ts#L164)) unvalidated. `zod` is already a dependency — a `QueryParams` schema at the trigger would fix this.

### M-3 · CRE target configuration is internally inconsistent.

- Root [workflow.yaml:6](../workflow.yaml#L6) points `local-simulation` at `config.staging.json`, while `privatesignal/config.local.json` exists and is referenced by **no** target (dead file).
- [project.yaml](../project.yaml) defines `local-simulation` and `staging-settings` only — **no `production-settings`** — yet the root `workflow.yaml` declares one ([workflow.yaml:17-23](../workflow.yaml#L17-L23)). A `--target production-settings` command would find no project.yaml target. (`project.yaml` is currently an uncommitted, in-progress modification.)
- The config schema still models the legacy signal feed: `signalApiUrl`, `chainSelector`, `receiverContract`, `onSignalUpdate` ([workflow.ts:48-64](../privatesignal/workflow.ts#L48-L64)) are vestigial for a risk-scoring product; `config.production.json` sets `receiverContract: 0x2222…` and a mainnet `chainSelector` ([config.production.json:6-7](../privatesignal/config.production.json#L6)) on an Arc-native project. If an EVM write path is ever added, these padded placeholder addresses are a silent sink.

### M-4 · `executionHash` is presented as a digest but is FNV-1a-32 repeated.

[pureMath.ts:122-130](../src/utils/pureMath.ts#L122-L130) — fine as an idempotency id, but not a cryptographic execution hash. Any README/dossier text calling it a "SHA-256 execution digest" is inaccurate.

### M-5 · Dead DON code/imports.

`safeBase64Encode/Decode` are exported but unused ([workflow.ts:66-97](../privatesignal/workflow.ts#L66-L97)); unused `EVMClient`/`HTTPClient`/`consensusMedianAggregation` imports bloat the bundle; the build script skips type checks (`--skip-type-checks`, [privatesignal/package.json:10](../privatesignal/package.json#L10)) — safety currently depends on an external `tsc` run.

---

## NOTE

- **N-1 · Confirm runtime globals at simulate time.** The bundle references `TextEncoder`/`TextDecoder` and probes `globalThis.crypto`; the SDK's own code relies on these, so the QuickJS runtime is expected to provide them — but verify in `cre workflow simulate` before any real deployment.
- **N-2 · Module-header comments overstate behavior.** Scorer headers claim "signed cryptographic attestation" and weights "loaded from Vault DON secrets" ([confidentialScorer.ts:22-27](../src/handlers/confidentialScorer.ts#L22)) — both false today. The *honest* parts (verified:false) are good; the comments should match them.

---

## Verdict

The DON layer is **QuickJS-clean, SDK-API-correct, and properly isolated from the Node side** — a real improvement over earlier phases: the unified scorer boundary both triggers route into is exactly the right shape, `runtime.now()` is used instead of `Date.now()`, there are no console/DOM/Node leaks, typecheck passes against the actual SDK, and the environment/config handling is sound.

But the **confidential-TEE proposition itself is not implemented** in this code path: the "private weights" are public literals compiled into the WASM (C-1), the workflow is registered as a standard DON handler rather than through the SDK's TEE mode (C-2), the attestation is a self-authored placeholder in no real format (C-3), and both trigger paths can emit SAFE for absent or fabricated data (H-1, H-2). **Do not treat this as a confidential workflow or deploy it as one.** In its current state it belongs in `local-simulation` only — the step that requires no owner approval and no network.

## Remediation order (when you choose to act — no code changed by this audit)

1. Move weights/thresholds/multipliers out of source into the runtime `secretsProvider`/Vault, and make the scorer read them.
2. Decide whether this is a confidential workflow; if so, register via `handlerInTee`/TeeRuntime semantics and wire real attestation — otherwise relabel the surface as "public DON scoring, weights not secret."
3. Make empty/malformed graph data a fail-closed `data_unavailable` outcome.
4. Give the Cron path a real monitored portfolio (or drop it), and either deliver its result with a real EVM write or stop preparing dead calldata.
5. Validate the HTTP payload with a `QueryParams` zod schema.
6. Reconcile targets (point local-sim at `config.local.json`, add `production-settings` to `project.yaml`, purge signal-feed config) and re-run `cre workflow simulate privatesignal --target local-simulation` to confirm runtime globals.
