# PrivateSignal — Combined testing1 + testing2 Re-Audit (post-fix)
**Date:** 2026-09-07 | **Scope:** top-to-bottom re-verification, inside the DON (confidential CRE workflow) and outside (Node services) after the TA-01…TA-15 fixes
**Method:** Every number below was re-measured live this run — full test suite, `tsc --noEmit`, local confidential WASM simulation, and read-only Chainlink CRE API queries against the deployed workflow. Nothing is inherited from prior reports. A prior `TestAudit2` document on this same path reported different figures; its claims are reconciled against reality in §2 and §6.

---

## 1. Executive Summary

**Overall verdict: PASS WITH GAPS**

The fixes are real and verified. Re-measured today:

- **Typecheck:** clean (`tsc --noEmit`, exit 0).
- **Full suite (outside the DON):** **111 pass / 0 fail / 507 `expect()` calls / 11 files / 3.15 s** — including **28 new tests in `tests/testing2.test.ts`** that close all 15 testing2 gaps (G1–G15).
- **In-DON confidential workflow (inside the DON):**
  - Local confidential WASM simulation of the in-DON bundle **compiles, boots, loads secrets, runs the pure scorer** — allow payload → **Score 85/100 SAFE**, deny payload → **Score 40/100 CAUTION**. Missing required secret → simulator **refuses to boot** (fails closed).
  - Deployed workflow `privatesignal-production` on a **private registry is ACTIVE** (Workflow ID `00cd6793…56f3`). Read-only ledger shows a **real SUCCESS execution `c47f06e6…`** on 2026-09-05 in which **7 DON nodes logged "Score 100/100 (SAFE)"**, plus **four FAILURE executions** that corroborate the blocked/error path.

### Top 5 residual risks
1. **[HIGH — architecture]** The interactive/agent/demo decision is scored **in-process on the Node tier with public mirror weights** (`getDefaultSecretsForStyle`). The deployed confidential workflow is **not on any judged decision path** — the Node tier never calls it over HTTP and it has no counterpart of the Vault-secret load. The "confidential" boundary is thus cosmetic on the Node tier. See §8-R1.
2. **[HIGH — trust]** Attestation "verification" on the Node tier is **format + trusted-flag only**. Everywhere it is called with `allowUnverifiedLocal=true`, so a self-authored `LOCAL_PROTOTYPE_MODE` envelope (`UNVERIFIED_LOCAL_EXECUTION`, `verified:false`) passes the gate; there is **no freshness/expiry guard** and no signature check. §8-R2.
3. **[MEDIUM — product]** The **oracle payment/fee path is removed** — nothing in the system pays for a score. Product-truth step 4 ("Arc agent pays USDC…") is reduced to a **score-gated native-USDC capital transfer**; the "pay-for-oracle" leg is gone. §8-R3.
4. **[MEDIUM — evidence hygiene]** `docs/deployment-evidence.md` and the superseded report cite execution GUIDs `99fcf049…` (SAFE 100/100) and `98725025…` (GRAPH_DATA_UNAVAILABLE) that **do not exist in the live execution ledger**. The real SUCCESS id is `c47f06e6…`; the real FAILUREs are `33268cee…`, `b02c37cc…`, `39766ceb…`, `2c76f0a4…`. The **outcomes described are real**, but the identifiers are unbacked. §8-R5.
5. **[MEDIUM — evidence hygiene]** The **prior TestAudit2 report on this path claimed 124 tests / 41 new**; the suite actually produces **111 / 28**. The per-file matrix there also drifts from reality (e.g. it lists apiServer 12 / endToEnd 6 / graphRobustness 9 / robustnessEvidence 13; measured today are 11 / 11 / 11 / 12). Corrected tables in §2/§3. §8-R6.

---

## 2. Claims vs Reality

| Claim | Source | Measured reality this run |
|-------|--------|---------------------------|
| 124 tests, 41 new in testing2.test.ts | Prior `audit/TestAudit2-Results-2026-09-07.md` | **111 tests total; testing2.test.ts contains 28** (`grep -c` = 28; suite total 111 = 83 pre-existing + 28 new). 507 expects across 11 files. |
| Execution `99fcf049` = SAFE 100/100 | `docs/deployment-evidence.md` + prior reports | **No such id in the live ledger.** Real SUCCESS = `c47f06e6…` (7 nodes, "Score 100/100 (SAFE)"). The outcome is true; the id is not. |
| Execution `98725025` = GRAPH_DATA_UNAVAILABLE | `docs/deployment-evidence.md` + prior reports | **No such id in the live ledger.** Four real FAILUREs exist (`33268cee…`, `b02c37cc…`, `39766ceb…`, `2c76f0a4…`); their logs show the handler start evaluation then error before emitting a score — consistent with the fail-closed/data-unavailable path, but the cited id is unbacked. |
| Multipliers removed; thresholds distinct per profile | TA-07 fix set | Verified: conservative {75,50,25}, balanced {65,40,20}, aggressive {55,30,15}; policy strictness tests pass. |
| Verified-empty wallet scores deterministically | TA-08 fix set | Verified: empty verified wallet → 100 SAFE; determinism test (fixed queryId → equal executionHash) passes. |
| Gate requires attested ScoreOutput | fix set | Verified: `null`/missing attestation → `GATE_ERROR`; forged/invalid envelope → `GATE_ERROR: Invalid attestation`; bare number rejected. |
| No model internals outside the TEE | privacy contract | Verified: `/api/score` body, SQLite columns, and ScoreOutput serialization carry only public fields; marker-weight/threshold negative controls pass. |
| Multiplier thresholds ~equal across profiles | deleted testing1 test (bug) | Correctly removed — profiles now differ by design. |

---

## 3. Test Results — outside the DON (measured today, 2026-09-07)

`bun test` → **111 pass, 0 fail, 507 expect() calls, 11 files, 3.15s.** `bun run typecheck` → exit 0.

| File | Tests | Status |
|------|-------:|--------|
| adversarial.test.ts | 7 | ✅ 7/7 |
| apiServer.test.ts | 11 | ✅ 11/11 |
| arcAgentLoop.test.ts | 7 | ✅ 7/7 |
| confidentialScorer.test.ts | 5 | ✅ 5/5 |
| endToEndValidation.test.ts | 11 | ✅ 11/11 |
| graphRobustness.test.ts | 11 | ✅ 11/11 |
| phase7Integration.test.ts | 8 | ✅ 8/8 |
| privatesignal.test.ts | 9 | ✅ 9/9 |
| robustnessEvidence.test.ts | 12 | ✅ 12/12 |
| security.test.ts | 2 | ✅ 2/2 |
| **testing2.test.ts (new)** | **28** | ✅ **28/28** |
| **TOTAL** | **111** | **111 pass / 0 fail / 507 expects** |

### testing2 gap closure (G1–G15 → `tests/testing2.test.ts`)

| Gap | What testing2 required | Result |
|-----|------------------------|--------|
| G1 | All three policy profiles enforce **distinct** raw-score cutoffs after multiplier removal; same wallet classifies differently per profile | ✅ conservative 65/caution vs balanced 69/safe vs aggressive 66/safe on the same input; threshold-order + classification-change asserted |
| G2 | Score determinism: same inputs → same output; execution reference stable for a fixed queryId | ✅ fixed queryId → identical `executionHash`; different queryId → different ref |
| G3 | SQLite stores only the 7 public fields; **no modelWeights/thresholds** | ✅ PRAGMA column audit in-memory DB |
| G4 | `/api/score` response shape: allowed vs forbidden fields | ✅ no `modelWeights`, `thresholds`, `policyProfiles`, `featuresSummary`, `ltvScore`; honest attestation present |
| G5 | Gate with **null/missing attestation** → throw | ✅ `GATE_ERROR` |
| G6 | NL `conservative` keyword → `policyProfileId` routed into scorer; classification changes | ✅ |
| G7 | Graph schema edge cases: null account, zero positions, partial data | ✅ dataComplete:true on empty; single-protocol outage fails closed `GRAPH_DATA_UNAVAILABLE` |
| G8 | Large collateral + zero debt → score ≥ 90 | ✅ 94 |
| G9 | Zero-position verified wallet → deterministic, no throw | ✅ 100 SAFE when dataComplete:true; `DATA_UNAVAILABLE` without dataComplete |
| G10 | Agent loop fails closed on Graph outage | ✅ propagates `GRAPH_DATA_UNAVAILABLE` (also at E2E loop level in phase7/arcAgentLoop) |
| G11 | Attestation status accuracy | ✅ local → `MISSING_ATTESTATION` (never `VERIFIED_ENCLAVE_EXECUTION`); forged `0xattest_…` → `INVALID_ATTESTATION` |
| G12 | Rate-limit 429 body shape | ✅ `{ error: RATE_LIMIT_EXCEEDED, message: string }` |
| G13 | Gate boundary: `score == threshold` passes; `threshold − 1` blocks | ✅ 65 passes, 64 blocks (also in robustnessEvidence Finding set) |
| G14 | CRE config accuracy: `handlerInTee`, `tee: nitro`, `loadSecretsFromProvider`, private registry, real workflowId in docs | ✅ file-read assertions on `workflow.ts` / `workflow.yaml` / `docs/deployment-evidence.md` |
| G15 | `featuresSummary` must NOT appear over HTTP | ✅ absent from `/api/score` response |

**Auxiliary (also added):** dry-run produces no fake transaction hash (`SIMULATED_DRY_RUN`, no `transactionHash`); no fake-tx path anywhere.

---

## 4. In-DON evidence — the confidential workflow (measured today)

### 4a. Local confidential simulation (`cre workflow simulate … --target local-simulation`)
Re-run against the in-DON bundle after the fixes. The harness **compiles the WASM handler, boots the TEE runtime, resolves Vault secrets by name from env, and returns only public outputs.**

| Payload | Result |
|---------|--------|
| Healthy (USDC-only collateral, zero debt, HF high, multi-protocol) | **Score 85/100 SAFE** — reasonCodes `HIGH_CONCENTRATION`, `CROSS_PROTOCOL_EXPOSURE` |
| Risky (USDC 1000 coll / 900 debt, HF 1.15) | **Score 40/100 CAUTION** (below balanced conservative thresholds → deny-side classification) |
| Missing required secret env (`MODEL_WEIGHTS_VAR`, `POLICY_THRESHOLDS_VAR`, …) | **Simulator refuses to boot**: "failed to replace secret names with environment variables … not found" → **fails closed** rather than running with defaults |

### 4b. Deployed workflow (read-only CRE API, no secrets touched)
- `cre workflow list` → **`privatesignal-production` … ACTIVE**, registry **private**, Workflow ID `00cd6793e74ece8644e7700732e4e4f2649b315f4227a61f67de5598723356f3` (matches the repo docs).
- `cre execution list` → 5 executions on 2026-09-05:
  - **`c47f06e6…` SUCCESS** (19 s). `cre execution logs` for it → **7 DON nodes logged "Score 100/100 (SAFE)"** — the allow outcome is real and attested by the DON.
  - **`33268cee…`, `b02c37cc…`, `39766ceb…`, `2c76f0a4…` FAILURE** — logs show the handler start evaluation and end without emitting a score, i.e. the blocked/fail-closed path exists on the deployed workflow (consistent with GRAPH_DATA_UNAVAILABLE).
- **Caveat (see R5):** these are the real ids; the ones printed in the docs are not.

---

## 5. Privacy boundary & critical-failure sweep

- **No private value leaves the TEE or the model code** — re-verified three ways: (1) `/api/score` HTTP body and `ScoreOutput` JSON contain only public fields; (2) SQLite stores only the 7 public columns (wallet, score, recommendation, protocols, donId, timestamp, queryId); (3) marker-weight/threshold negative controls (`0.6123456789`-style sentinels never appear in any serialized output). Audit logs redact the wallet to 8 chars.
- **Local path is honestly labeled** — `donId: LOCAL_PROTOTYPE_MODE`, `signature: UNVERIFIED_LOCAL_EXECUTION`, `verified: false`, status `MISSING_ATTESTATION`. Nothing on the Node tier claims `VERIFIED_ENCLAVE_EXECUTION`.
- **Fail-closed behavior verified:** Graph partial/single-protocol outage → `GRAPH_DATA_UNAVAILABLE` (no partial score); missing TEE secret → simulator refuses to boot; `null` attestation → gate throws.
- **No critical failures remain** in the automated suite or the in-DON runs (0 fail / 0 boot with-defaults).

---

## 6. Live-evidence provenance

| Evidence | How it was obtained | Status this run |
|----------|--------------------|-----------------|
| Suite 111/0 + typecheck clean | `bun test`, `bun run typecheck` re-run | ✅ re-collected now |
| Local sim allow 85/SAFE, deny 40/CAUTION | `cre workflow simulate` (local-simulation target) | ✅ re-collected now (local sim ≠ real DON execution — labeled) |
| Workflow ACTIVE, private registry, id `00cd6793…` | `cre workflow list` | ✅ re-collected now |
| SUCCESS execution `c47f06e6…`, 7 nodes "Score 100/100 (SAFE)" | `cre execution list` + `cre execution logs` | ✅ re-collected now |
| 4 FAILURE executions (`33268cee…` etc.) | `cre execution list` | ✅ re-collected now |
| Docs' GUIDs `99fcf049…` / `98725025…` | prior audit reports / `docs/deployment-evidence.md` | ❌ **not found in live ledger** — recommend correcting docs to the real ids (R5) |

---

## 7. Fixes applied (TA set) — verified present

| Fix | Verified by |
|-----|-------------|
| Multiplier removed from the policy model (`ResolvedPolicy` has no multiplier; per-profile `weightAdjustment`/thresholds only) | typecheck clean; G1 strictness tests; `confidentialScorer`/`policyConfig` read |
| Conservative / balanced / aggressive now enforce distinct cutoffs | G1 (75/65/55) |
| Empty verified wallets scorable & deterministic | G9 (100 SAFE) |
| Zero-debt large-collateral wallets score high | G8 (≥90) |
| Incomplete data throws `DATA_UNAVAILABLE` instead of guessing | G9 negative case |
| Gate requires a complete `ScoreOutput` + valid attestation, else `GATE_ERROR` | G5, robustnessEvidence Finding 2 |
| Attestation status accuracy | G11 |
| Rate-limit 429 body shape | G12 |
| Gate boundary exactness (`score == threshold` passes) | G13 |
| `/api/score` no longer exposes `featuresSummary`/model internals | G4/G15 |
| Partial Graph outage fails closed | G7/G10 + robustnessEvidence Finding 1 |

---

## 8. Remaining blockers / residual findings

- **R1 [HIGH] Node-tier scoring is parallel-public, not confidential.** `/api/score`, the agent loop, and the demo all call `scoreCrossProtocolRisk` **in-process** using public mirror weights; the deployed confidential workflow is invoked by **no** Node code (verified: the only outbound HTTP in `src/` is the Graph aggregator). A deployer can therefore score a wallet on the Node tier without the TEE/Vault at all. *Resolution:* route interactive decisions through the deployed confidential trigger (HTTP evaluation) and verify its attestation before gating; keep the local mirror only as an offline/test fallback that is explicitly labeled.
- **R2 [HIGH] Attestation gate is format + trusted-flag only; no freshness.** `allowUnverifiedLocal=true` is passed everywhere, so a self-authored `LOCAL_PROTOTYPE_MODE` envelope passes; timestamps are not age-checked. *Resolution:* require a real DON-issued attestation on any path that moves capital; add an expiry window and a required signer/registry check.
- **R3 [MEDIUM] Payment-for-score path removed.** Product step 4's "pay for the score" leg no longer exists — only the score-gated capital transfer remains. *Resolution:* decide whether a per-query oracle fee is required by the product contract and reinstate it (native-USDC, non-`approve`) if so; otherwise amend the product truth.
- **R4 [MEDIUM] Demo deny path mocks the score.** `src/demo/runDemo.ts` Scenario 2 injects `42/100` ("Mock an overleveraged score") instead of running live Graph → confidential score → deny. Docs narration must not imply 42 was derived from live data. *Resolution:* feed a real risky wallet through the live aggregator for Scenario 2, or add a visible "(simulated)" tag in the demo narration.
- **R5 [MEDIUM] Deployment-evidence GUID drift.** Real ledger ids differ from the docs' `99fcf049…`/`98725025…`. *Resolution:* update `docs/deployment-evidence.md` and README to cite `c47f06e6…` (SUCCESS, 100/100 SAFE) and one real FAILURE id (`33268cee…`) so receipts reconcile with the ledger.
- **R6 [MEDIUM] Prior report figures did not reconcile** (124/41 vs 111/28; per-file drift). *Resolution:* this report supersedes; from now on cite `bun test` output verbatim.
- **R7 [LOW] Rate limiter trusts client `X-Forwarded-For`.** Rotating the header bypasses the limit (reproduced in robustnessEvidence Finding 4). *Resolution:* trust proxy config / hash socket address unless behind a stripping reverse proxy.
- **R8 [LOW] `/api/score` verifies but does not gate.** Invalid attestations return an honest `verified:false` status rather than a 502 rejection. *Resolution:* decide explicitly whether scoring should reject invalid envelopes (currently the gate in `gatedAction` still blocks capital movement, which is the safety-critical check).

---

## 9. Demo-readiness checklist

| Item | Status |
|------|--------|
| NL/MCP entry (query → graph plan) | ✅ READY — keyword routing to conservative/balanced/aggressive tested |
| Two-protocol Graph aggregation | ✅ READY — mocked-path tested; live requires Graph key |
| Confidential scoring core | ✅ READY — pure model tested; WASM handler simulates (85 SAFE / 40 CAUTION) |
| Allow path (score ≥ threshold, exact boundary) | ✅ READY — gate permits at 65, executes dry-run native-USDC transfer, no fake tx hash |
| Deny path (score < threshold) | ✅ READY — gate blocks at 64 and at 11; capital protected |
| Gate refuses missing/forged attestation | ✅ READY — `GATE_ERROR` |
| Privacy / zero secret leakage | ✅ READY — API, DB, logs, error messages clean |
| Honest enclave labeling | ✅ READY — `LOCAL_PROTOTYPE_MODE` everywhere local; nothing claims `VERIFIED` |
| Deployed-workflow evidence | ⚠️ PARTIAL — workflow + SUCCESS/FAILURE executions are real; docs' GUIDs need correcting (R5) |
| Demo deny path shows a live confidential low score | ❌ NOT READY — Scenario 2 injects 42 (R4) |
| Interactive/API scoring runs through the confidential workflow | ❌ NOT READY — Node tier scores in-process with public mirror weights (R1) |

---

## 10. Final recommendation

**Ship the demo with the fixes verified — but disclose the confidential-boundary limits, and close R1/R2 before claiming end-to-end confidential scoring.**

Everything the fixes targeted now holds: the model is deterministic, per-profile thresholds are distinct and boundary-exact, empty/zero-debt/partial-data edge cases behave, the gate refuses missing or forged attestations, nothing private leaks outside the TEE boundary, the in-DON bundle compiles and simulates (85 SAFE / 40 CAUTION), and the deployed private-registry workflow is ACTIVE with a real 7-node 100/100 SAFE execution and real FAILURE executions on record.

The two gaps that matter most for the project's core promise are architectural, not test-level: **(1)** today's interactive/agent/demo decisions are scored in-process with public mirror weights — the deployed confidential workflow is not yet wired into the judged decision path; and **(2)** attestation trust on the Node tier is format-plus-flag with no freshness bound. Both are honest, fixable, and clearly labeled today — they are not silent deceptions. Fix R1 (route decisions through the deployed confidential trigger) and R2 (require a real, fresh DON attestation to move capital), correct the docs' execution ids (R5), and re-run this same top-to-bottom pass before any testnet deployment.

*No tokens, keys, secrets, weights, thresholds, or private model values appear in this report.*
