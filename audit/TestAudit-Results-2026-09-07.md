# PrivateSignal — Test & Security Audit Results (TestAudit deliverable)

**Date:** 2026-09-07
**Audit brief:** `audit/TestAudit` (independent senior security + QA pass, 5 phases)
**Baseline commit:** `eeecb52` (HEAD) — audit introduced **no source changes**; every finding below is a *reproduction* of observed behavior pinned by tests added in `tests/robustnessEvidence.test.ts` (13 tests, all passing).
**Suite state at delivery:** `bun test` → **84 pass / 0 fail** (10 files, ~4 s); `bun run typecheck` (`tsc --noEmit`) → clean.

---

## 1. Executive summary

PrivateSignal is **pre-production financial-grade infrastructure** by its own framing (confidential DeFi risk oracle gating real USDC-denominated agent actions on Arc). This audit read every module under `src/`, the CRE workflow under `privatesignal/`, the config/deploy/demo scripts, and the docs, and wrote 13 evidence tests to reproduce behavior that reading alone could not settle.

**Confidential-boundary claim ("only a public verdict leaves the enclave, weights sealed") — HOLDS in the intended TEE path only; does NOT hold end-to-end as shipped.** The pure confidential core (`src/handlers/confidentialScorer.ts`) is genuinely clean: no Node built-ins, no browser globals, no `console.log`, no outbound fetch, sanitized error strings, and a `ScoreOutput` that never serializes weights/thresholds/intermediates (confirmed by a marker-injection test, Finding TA-08/positive control). But the **reachable public tiers do not run that boundary**: `/api/score` executes the "confidential" scorer in a normal Node process using **compiled-in, publicly-committed model weights** and then leaks derived intermediate sub-scores (`featuresSummary`) in the HTTP response (TA-05, TA-06); the 502 "un-attested score rejected" path claimed in the docs is **unreachable** because the local envelope is always accepted (`verifyAttestation(..., allowUnverifiedLocal = true)`); and `verifyAttestation` treats the **caller-supplied `verified` flag** as ground truth with no cryptography and no freshness window (TA-03). An attacker who can read the repo knows the exact weights and thresholds.

**Financial-gating claim ("agents hard-gated by the attested score") — does NOT hold as implemented.** `executeScoreGatedAction` compares a number to a threshold and **never verifies that the score is attested**; a bare `100` or a forged envelope passes (TA-02). A partial data outage on one of the two protocols flips a genuinely high-risk wallet to SAFE because the aggregator swallows the per-protocol error into a healthy-looking empty slot (TA-01). The API gate on `/api/score` is trivially bypassed under load via `X-Forwarded-For` spoofing, and `/api/agent/run` — which can trigger real (or dry-run) Arc native-USDC transfers with **client-supplied threshold, amount, and destination** — has **no rate limiter and no auth** (TA-04). No server-side fee enforcement exists in any code path (`ARC_FEE_AMOUNT_USDC` is documentation only), so the "agent pays 0.10 USDC" flow is not implemented in the audited code.

**Honesty of deployment evidence — FAILS.** Demo and deploy scripts print `VERIFIED_ENCLAVE_EXECUTION`, `Action Executed on Arc`, `Arc Fee Tx: 0x3c91…`, and a fabricated `registrationTxHash` (`0x7b4a` + hex of the ASCII string `workflowId:donId:timestamp`) and return `REGISTERED_ON_PRODUCTION_DON` with **no network interaction** (TA-09). `docs/deployment-evidence.md` presents these literals as real chain evidence ("Status: SUCCESS", "Gas Used: 21,000", registration tx hash that hex-decodes to the workflow-id string). Claims of a live deployed CRE DON, live Graph latency numbers, and live Arc RPC results are **not verifiable from this repo**, and the committed test suite globally mocks The Graph endpoints (`tests/setup.ts`), so "live integration" is not demonstrated by the suite.

Overall posture: **the modular design and the pure-math/scoring core are solid and fail closed; the load-bearing security properties (sealed weights, attested score binding the gate, rate-limited and fee-enforced public surface, honest deployment evidence) are not yet met.** Real-money deployment should not proceed on the current interactive tier.

---

## 2. Findings

Status legend: **CONFIRMED** = reproduced by a test or by direct code trace in this audit; **SUSPECTED** = plausible, could not be fully exercised here.

| ID | Title | Severity | file:line | Status |
|---|---|---|---|---|
| TA-01 | Partial single-protocol outage is scored as complete data (fail-open on one of two protocols) | **High** | `src/graph/aggregator.ts:184-198`, `:220-221`, `:224-231` | CONFIRMED |
| TA-02 | Score-gated action is numeric-only; not bound to a verified/attested score | **High** | `src/arc/gatedAction.ts:70-105` | CONFIRMED |
| TA-03 | Attestation "verification" is format + self-asserted `verified` flag; no crypto, no replay/expiry guard | **High** | `src/utils/verifyAttestation.ts:36,85-96,113` | CONFIRMED |
| TA-04 | Rate limiter bypassable via `X-Forwarded-For`; most public endpoints (incl. `/api/agent/run`) unlimited | **High** | `src/api/server.ts:36-49,75,251` | CONFIRMED |
| TA-05 | Public HTTP path scores with compiled-in public weights outside the TEE; "no bypass"/502 claims false | **High** | `src/api/server.ts:106,109,121-128`; `src/config/policyConfig.ts:16-54` | CONFIRMED |
| TA-06 | `/api/score` returns intermediate sub-scores (`featuresSummary`) beyond the stated minimal payload | Medium | `src/api/server.ts:160-165` | CONFIRMED |
| TA-07 | Policy-profile strictness largely cancels out (effective SAFE cutoff ≈ 65 for all three profiles) | Medium | `src/config/policyConfig.ts:16-54` | CONFIRMED |
| TA-08 | Genuinely-empty (verified) wallet is unscorable on the live path — no `dataComplete` reachable | Low/Med | `src/graph/aggregator.ts:220-221`, `:224-231` | CONFIRMED |
| TA-09 | Demo/deploy scripts fabricate VERIFIED_ENCLAVE_EXECUTION, executed-action, and registration/tx evidence | **High** | `src/demo/runDemo.ts:151,192,216,238`; `src/deploy/createWorkflow.ts:60,110-114`; `docs/deployment-evidence.md:21-24,103-116` | CONFIRMED |
| TA-10 | Checked-in WASM blobs are divergent and not reproducible from source | Medium | `binary.wasm.br.b64` (root) vs `privatesignal/…` | CONFIRMED (provenance) |
| TA-11 | Dependency advisories: `ws` < 8.20.1 via viem (1 high, 1 moderate) | Medium | `bun.lock` → `viem` | CONFIRMED |
| TA-12 | Error responses echo raw `error.message` to clients; SQLite layer correctly parameterized | Low | `src/api/server.ts:168-172,182,197,246,282-285` | CONFIRMED (SQLite clean) |
| TA-13 | Fee enforcement & payment→score atomicity do not exist in any code path | Medium | whole API/Arc surface (no payment call); only docs/demo | CONFIRMED (absence) |
| TA-14 | Attestation `executionHash` is a 32-bit FNV-1a label, not a digest; `deterministicExecutionRef` docs drift | Low/Info | `src/utils/pureMath.ts:228-245` | CONFIRMED |
| TA-15 | Claims-vs-docs drift: test counts (66/59/50/71), rate-limit coverage, "LIVE" Graph/Arc claims not supported by committed (mocked) suite | Low | README.md / deployment-evidence.md / demo-script.md vs `tests/setup.ts` | CONFIRMED (doc) |

### TA-01 — Partial-outage fail-open (High, CONFIRMED)
- **Description.** In `aggregateLiveGraphData`, protocol fetches run in parallel inside `Promise.all` (`:175-198`). On any fetch/parse error for a given protocol, the per-protocol `catch` at `:184-193` pushes a **healthy-looking empty fallback** (`positions:[{protocol, collateral:[], debt:[]}]`, `totalCollateralUSD:0`, `totalDebtUSD:0`, **`healthFactor:999.0`**) and suppresses the error. The aggregate then proceeds. Only when **both** protocols end at zero does `:220-221` throw `GRAPH_DATA_UNAVAILABLE`. The returned `normalizedGraphData` (`:224-231`) never sets `dataComplete` and carries **no per-protocol availability marker**, so the scorer cannot distinguish "Morpho is down" from "Morpho legitimately empty."
- **Reproduction.** `tests/robustnessEvidence.test.ts` (Finding 1):
  - test 1: Aave V3 up (small healthy USDC position), Morpho endpoint throws → the *same wallet* is scored **85 SAFE** and the action passes. Its true risk lives in Morpho and is invisible.
  - test 2 (control): Morpho up → the *same wallet* scores **< 20 HIGH_RISK** and the action is blocked.
- **Impact.** An agent whose risk sits in whichever protocol is unreachable (outage, routing interference) is scored as clean and **allowed to move capital**. This directly undermines "a score that cannot block action is not policy."
- **Suggested fix.** Propagate per-protocol success/failure in the result (e.g. `protocolData: { [p]: 'ok' | 'error' | 'empty' }`, or set `dataComplete:false` whenever any requested protocol errored). Make the reliability gate (`assessGraphDataReliability`) **fail closed (deny)** when any requested protocol is missing rather than scoring the partial set. Never use `healthFactor: 999.0` as an error sentinel.

### TA-02 — Gate not bound to an attested score (High, CONFIRMED)
- **Description.** `executeScoreGatedAction` (`gatedAction.ts:70`) reads `.score` if an object is passed (or uses the raw number) and compares it to `action.threshold`. It never calls `verifyAttestation`. `dryRun` short-circuits to `passed:true` at `:104` without an execution, but nothing anywhere checks that the score originated from an enclave. Both product callers that do verify (`agentLoop.ts:162`, `server.ts:121`) pass `allowUnverifiedLocal = true`, so even the local (never cryptographically attested) envelope counts as valid.
- **Reproduction.** Finding 2: a bare number `100` passes the gate; a `ScoreOutput` whose envelope `verifyAttestation` explicitly marks invalid still passes.
- **Impact.** There is no integrity chain from "score" to "capital movement." Any caller that can produce a number ≥ threshold can pass the gate.
- **Suggested fix.** Require a valid attestation inside `executeScoreGatedAction` before executing (with an explicit, separately-audited local-prototype mode); bind the gate to the same envelope that carried the score; remove the `allowUnverifiedLocal=true` from the two product call sites (or make local mode loud and unreachable from `/api`).

### TA-03 — Attestation verification is cosmetic (High, CONFIRMED)
- **Description.** `verifyAttestation` (`verifyAttestation.ts:85-96`) computes `isValid = Boolean(verified && hashMatches && isValidSignatureFormat)`, where `verified` is **the caller/attacker-supplied field** on the envelope, `hashMatches` is trivially true when no `expectedExecutionHash` is supplied (which is how the product calls it, `agentLoop.ts:162`, `server.ts:121`), and signature "validation" only checks for an `0xattest_` prefix or `0x` + ≥66 chars. There is no signature recovery, no key check, no freshness/expiry window. A 2017 timestamp is accepted.
- **Reproduction.** Finding 3: an envelope the attacker stamps `verified:true` returns `valid:true`, `status:'VERIFIED_ENCLAVE_EXECUTION'`; a `timestamp:1500000000` (2017) envelope also returns `valid:true`.
- **Suggested fix.** In a real gating flow, verification must mean enclave attestation verification (DON-provided proof / verified execution hash / freshness window), never a self-asserted boolean. Keep local prototypes explicit and never feed their output to a real gate as "verified."

### TA-04 — Rate limiting bypassable and incomplete (High, CONFIRMED)
- **Description.** `rateLimitMiddleware` (`server.ts:37`) keys on `req.headers['x-forwarded-for']` first — a header any client sets — and is only attached to `/api/score` (`:75`). `/api/agent/run` (`:251`), `/api/history`, `/api/history/:id`, `/api/agent/status`, `/api/health` have **no limiter**. README:425 claims "sliding window rate limiting on **all** public API endpoints."
- **Reproduction.** Finding 4: 20 sequential requests each with a fresh `X-Forwarded-For` are never limited; 12 requests from one fixed IP hit 429 on the 11th.
- **Impact.** Unlimited, unauthenticated calls to `/api/agent/run` (which can issue Arc native-USDC transfers; see TA-13/TA-02) with client-controlled threshold/amount/destination is a free capital-drain / spam surface.
- **Suggested fix.** Take the IP from the trusted socket/proxy boundary (ignore `X-Forwarded-For` unless a known proxy is configured), apply the limiter to every public route, and additionally rate-limit per wallet + per route.

### TA-05 — "No bypass" claim false: public tier scores outside the TEE with public weights (High, CONFIRMED)
- **Description.** `/api/score` (`server.ts:106`) loads `getDefaultSecretsForStyle` — **compiled-in constants** in `src/config/policyConfig.ts` (model weights, thresholds, and the three profile tables are committed, public source) — and runs `scoreCrossProtocolRisk` in a normal Node process (`:109`). It then calls `verifyAttestation(..., true)` (`:121`); because the local envelope always satisfies the local-prototype rule, the `502 INVALID_ATTESTATION` branch (`:122-128`, whose message claims "failed cryptographic attestation verification from the Chainlink CRE DON") is **unreachable**, and a 200 with a locally-computed score is returned. This contradicts README:169/170/223 and deployment-evidence.md:164 ("the confidential handler is required", "un-attested scores rejected with HTTP 502", "no public scoring bypass").
- **Impact.** Anyone can obtain a gate-able score from a process with no enclave, no Vault-DON secrets, and weights that are public in the repo — the core confidentiality product claim collapses for the interactive tier.
- **Suggested fix.** Only the deployed confidential workflow may emit scores that feed real gates. The HTTP interactive tier must be labeled `LOCAL_PROTOTYPE_MODE` end-to-end (response + DB + logs), must not emit the DON-failure 502 framing, and model parameters must not be compiled into any public package (the in-DON design already references secrets; the API/agent-loop/demo deviation reintroduces them as source literals).

### TA-06 — Intermediate sub-scores leak in HTTP response (Medium, CONFIRMED)
- **Description.** `server.ts:160-165` returns `featuresSummary { combinedCollateralValue, totalDebtUSD, concentrationScore, healthPressureIndex }`. README/architecture say only score/recommendation/reason-codes/attestation leave. Concentration and health-pressure indices are derived intermediates; exposing them lets observers infer risk posture and reverses part of the "sealed reasoning" value.
- **Reproduction.** Finding 5: 200 response contains `featuresSummary` with all four fields (raw sealed marker values are *not* present — boundary on the object itself is fine).
- **Suggested fix.** Remove `featuresSummary` from the public payload (or gate behind operator auth) to honor the documented minimal-payload contract.

### TA-07 — Profile strictness cancels out (Medium, CONFIRMED)
- **Description.** `policyConfig.ts` pairs multiplier × SAFE threshold: conservative `1.15` × `75`, balanced `1.0` × `65`, aggressive `0.85` × `55`. Because the final score is `round(raw × multiplier)` and then compared to the threshold, the *effective raw-score* SAFE cutoff is ~65.2 / 65 / 64.7 — a spread < 1.5 across a supposedly "conservative → aggressive" spectrum.
- **Reproduction.** Finding 6 (asserts spread < 1.5).
- **Suggested fix.** Decide whether the multiplier represents risk-appetite (then thresholds should be in raw units, not post-multiplier) or a scaling artifact; widen effective cutoffs so profiles genuinely differ, and document which consumer-facing cutoff each profile implies.

### TA-08 — Verified-empty wallets unscorable (Low/Med, CONFIRMED)
- **Description.** The aggregator throws `GRAPH_DATA_UNAVAILABLE` whenever aggregated collateral **and** debt are both zero (`aggregator.ts:220-221`) — including a genuinely empty account the subgraph *successfully* returned as empty. The scorer's intended escape hatch for true zero-position data (`dataComplete:true` in `assessGraphDataReliability`, `pureMath.ts:98-107`) is unreachable because the aggregator never sets it (`:224-231`).
- **Reproduction.** Finding 7: both protocols return a real empty account → throws.
- **Impact.** Honest new/empty wallets get **no score and therefore cannot transact**; only wallets with exposure are addressable. (Fail-closed is the right instinct, but the product has no legitimate zero-exposure path.)
- **Suggested fix.** Distinguish a *successful empty query* (set `dataComplete:true`, let the scorer return a defined low/neutral verdict under explicit completeness semantics) from a *failed query* (throw).

### TA-09 — Fabricated deployment/execution evidence (High, CONFIRMED)
- **Description.** 
  - `runDemo.ts:151` prints `Enclave Status: VERIFIED_ENCLAVE_EXECUTION` for a run whose scorer *always* stamps `verified:false` (`confidentialScorer.ts:393`); `:192` prints `Arc Fee Tx: 0x3c91…`; `:238` prints "Action Executed on Arc" for a `dryRun` (`:165`); `:216` hardcodes `s2SimulatedScore = 42`.
  - `createWorkflow.ts:60` fabricates `registrationTxHash = 0x7b4a + hex(`${workflowId}:${donId}:${now}`)…` and `:110-114` returns `status: 'REGISTERED_ON_PRODUCTION_DON'` with no network call.
  - `docs/deployment-evidence.md` presents these as real: registration tx hash (`:21`) whose hex *decodes to the ASCII workflow-id string* (`0x7b4a` + "privatesignal-confidential-v1:…"), "Attestation Status: VERIFIED_ENCLAVE_EXECUTION" (`:24`), Arc "Status: SUCCESS / Gas Used: 21,000" (`:103-116`) matching the `0x3c91`/`0x7b4a` prefixes printed by `runDemo.ts`. `docs/demo-script.md:153-154` more honestly labels the same hashes "Illustrative."
- **Impact.** The repo asserts deployed, verified, capital-moving behavior that its own code cannot produce and that no RPC/registry evidence substantiates — a serious misrepresentation for anything presented as production financial infrastructure.
- **Suggested fix.** Non-DON code must emit `LOCAL_SIMULATION`/`UNVERIFIED` labels, never `VERIFIED_ENCLAVE_EXECUTION` or executed-tx/registration literals. Docs must separate **illustrative** from **real** chain evidence, each with verifiable citations (registry/DON scan, RPC explorer links). `deploy:workflow` must not claim registration without a real CRE deploy (owner approval required per project policy).

### TA-10 — Divergent, non-reproducible WASM blobs (Medium, CONFIRMED provenance)
- **Description.** The root `binary.wasm.br.b64` decompresses byte-identical to `privatesignal/binary.wasm` (sha `fd44178a…`); a second base64 blob under `privatesignal/` is a **different build**. Neither can be reproduced from the committed `src/` by any checked-in build step + committed digest, so a stale or tampered binary could be mistaken for the source it claims to represent.
- **Suggested fix.** Build the WASM from source in CI, commit the source + a manifest with SHA-256 digests, and drop the hand-committed `.b64` blobs (or regenerate and verify before commit).

### TA-11 — Dependency advisories (Medium, CONFIRMED)
- **Description.** `bun audit`: `ws >=8.0.0 <8.20.1` via workspace `privatesignal › viem` — **high** `GHSA-96hv-2xvq-fx4p` (memory-exhaustion DoS from tiny fragments) and **moderate** `GHSA-58qx-3vcg-4xpx` (uninitialized memory disclosure). 2 vulnerabilities (1 high, 1 moderate).
- **Suggested fix.** Bump `viem` to a release depending on `ws ≥ 8.20.1` (or add a `ws` override), `bun update`, re-run `bun audit` to zero.

### TA-12 — Raw error messages + (clean) SQLite (Low, CONFIRMED)
- **Description.** Several handlers respond with `message: error.message` verbatim (`server.ts:168-172,182,197,246,282-285`). Current thrown messages are sanitized constants, so real exposure is low, but any future error that embeds host/URL/query context would leak it. The SQLite audit store uses **prepared/parameterized statements** throughout (`db.ts:44-78`) — no SQL injection found. GraphQL requests are built variables-based (no user string interpolation into query text) — no injection found.
- **Suggested fix.** Map errors to fixed public codes at the API boundary; log full context server-side only.

### TA-13 — No fee enforcement / payment→score atomicity (Medium, CONFIRMED absence)
- **Description.** No code path collects or verifies a payment before scoring or gating. `ARC_FEE_AMOUNT_USDC = 0.10` is a config/documentation constant; the demo merely *prints* an "Arc Fee Tx". There is no fee step to race, double-submit, or crash between — because there is no fee step at all. The product claim "agents pay native USDC and are gated" is not implemented in the audited surface.
- **Suggested fix.** Implement the fee as a native-USDC transfer *before* score delivery on the real path (testnet first), make delivery idempotent by query id, and add tests for insufficient balance, crash-before-delivery, and double-payment.

### TA-14 — `executionHash` is FNV-1a, not a digest (Low/Info, CONFIRMED)
- **Description.** `deterministicExecutionRef` (`pureMath.ts:237-245`) is a 32-bit FNV-1a expanded to a 66-char `0x` string and its own docstring says "NOT A DIGEST … do not treat it as an attestation or integrity proof." Consumers (verifyAttestation path, docs calling it an "execution hash") must not imply cryptographic binding. A 32-bit space is brute-forceable for replay/fabrication at the format layer.
- **Suggested fix.** Either use a real digest inside the enclave (where a crypto lib is available to the DON) or drop the "execution hash" framing entirely.

### TA-15 — Docs/code drift (Low, CONFIRMED)
- Test counts vary across docs (README "66"/"50", deployment-evidence "59", AuditReport "71"); actual suite at delivery is **84**. "Rate limiting on all public endpoints," "No Public Scoring Bypass," "Attestation Status VERIFIED_ENCLAVE_EXECUTION," and the "LIVE Graph / LIVE Arc" status rows are contradicted by code and by `tests/setup.ts` globally mocking both Graph endpoints (see §4). See claims matrix in the appendix.

---

## 3. New/updated tests

Added **`tests/robustnessEvidence.test.ts`** (13 tests). **Result: 13/13 pass**; full suite 84/84; `tsc --noEmit` clean.

| Test | Pins | Pass/Fail |
|---|---|---|
| `[EVIDENCE] aggregator partial-outage fail-open › morpho down → wallet scored SAFE, action passes` | TA-01 | ✅ Pass |
| `[EVIDENCE] aggregator partial-outage fail-open › control: morpho UP → same wallet HIGH_RISK, blocked` | TA-01 | ✅ Pass |
| `[EVIDENCE] gated action does not require an attested score › bare number 100 passes the gate` | TA-02 | ✅ Pass |
| `[EVIDENCE] gated action … › forged/invalid-attestation ScoreOutput still passes` | TA-02 | ✅ Pass |
| `[EVIDENCE] attestation "verification" is format + trusted-flag only › attacker `verified:true` accepted as VERIFIED_ENCLAVE_EXECUTION` | TA-03 | ✅ Pass |
| `[EVIDENCE] attestation … › 2017 timestamp accepted (no replay/expiry guard)` | TA-03 | ✅ Pass |
| `[EVIDENCE] /api/score rate limiter › 20 requests, rotating X-Forwarded-For, never limited` | TA-04 | ✅ Pass |
| `[EVIDENCE] /api/score rate limiter › fixed IP limited on the 11th request (429)` | TA-04 | ✅ Pass |
| `[EVIDENCE] /api/score payload breadth › 200 body includes featuresSummary intermediates` | TA-06 | ✅ Pass |
| `[EVIDENCE] STANDARD profile multipliers × thresholds › effective SAFE cutoff ≈ 65 for all three` | TA-07 | ✅ Pass |
| `[EVIDENCE] verified-empty wallet unscorable › aggregator throws GRAPH_DATA_UNAVAILABLE` | TA-08 | ✅ Pass |
| `[EVIDENCE] confidential markers stay inside the boundary › marker weight/threshold never in ScoreOutput JSON` | positive control | ✅ Pass |
| `[EVIDENCE] Arc 18-decimal USDC arithmetic › 0.10 USDC == 1e17 native units; round-trip` | positive control | ✅ Pass |

The pre-existing suite (71 tests) already covered scoring math, schema mapping, NL routing (incl. prompt-injection fuzzing), API endpoints/persistence/rate limiting, agent-loop allow/deny, end-to-end validation, and CRE workflow config. This audit extended it with the adversarial/behavioral reproductions above. **No source files were modified during the audit.**

---

## 4. Coverage gaps (could not be tested / verified)

| Gap | Why | Consequence |
|---|---|---|
| **Real Chainlink CRE DON execution** | No deployed-DON access; project policy requires `cre workflow simulate privatesignal --target local-simulation` and explicit owner approval before a real confidential deploy. | TEE/Vault-DON secret injection, batched `getSecrets` on the real `TeeRuntime`, QuickJS/WASM sandbox rejection of `fs/crypto/fetch`, and true attestation verification cannot be confirmed here. The "deployed / registered / verified" claims in docs are unverifiable and partly contradicted (TA-09). |
| **Real Arc conditions** | Committed tests run against mocked Graph endpoints; Arc-RPC-dependent tests are network-dependent, not hermetic. | Real balance/RPC failure modes, transaction failure after fee payment, double-submission, and crash atomicity untested (and no fee flow exists to test — TA-13). |
| **Live The Graph / Morpho schema & latency** | `tests/setup.ts` globally stubs `gateway.thegraph.com` and `blue-api.morpho.org` for the whole suite, so latency figures in docs were not produced against the live network by this suite. | Schema drift vs. `schemaMapper.ts` and real query latency/availability are unverified; "LIVE" doc rows overstate what the committed suite proves. |
| **Rate limiter under real distributed load / IP spoofing from the network** | Only single-process unit reproduction (Finding 4). | Real-world bypass surface beyond the demonstrated header spoof is unmeasured. |
| **TypeScript strictness end-to-end** | `any` is used in hot paths (`server.ts` handlers, aggregator `catch (err:any)`, `verifyAttestation` casts, tests). | Not a runtime bug by itself, but it is exactly where the financial/privacy invariants live; `noImplicitAny`-clean financial code was not achieved. |
| **WASM reproducibility** | No CI build step + committed digest exists (TA-10). | Cannot prove the tracked binary matches source. |

---

## 5. Prioritized remediation

Ordered by severity and by what is load-bearing for the core product claims (confidentiality boundary and payment gating first).

1. **Close the attestation→gate integrity chain (TA-02, TA-03, TA-05).** The gate must consume only an enclave-verified score; `verifyAttestation` must not treat caller-asserted `verified` as truth and must enforce freshness; remove `allowUnverifiedLocal=true` from `/api/score` and `/api/agent/run`; stop running the confidential scorer in Node with compiled-in public weights. *This is the product's central claim and it is currently not met end-to-end.*
2. **Make partial data fail closed (TA-01).** Mark per-protocol availability and refuse to score/allow when any requested protocol is unavailable or errored; remove the `healthFactor:999` error sentinel. *This can flip a real gate from DENY to ALLOW.*
3. **Fix the honesty surface (TA-09).** No `VERIFIED_ENCLAVE_EXECUTION`, "Action Executed", fabricated tx/registration hashes outside real, cited evidence; relabel demo/deploy output as local/simulated; separate illustrative vs. real evidence in docs. *Precedes any credible external claim of readiness.*
4. **Harden the public API (TA-04, TA-13).** Trusted-source IP keying; apply the limiter to all routes; add auth or an operator token on `/api/agent/run` and bound its amount/destination/threshold server-side; implement real fee enforcement and idempotent score delivery. *Prevents spam, bypass, and free/unaccounted capital movement.*
5. **Honor the minimal-payload privacy contract (TA-06).** Remove `featuresSummary` from public HTTP responses.
6. **Fix the empty-wallet dead-end (TA-08)** and **profile cancellation (TA-07)** so the product's gating semantics are coherent.
7. **Supply chain & hygiene (TA-10, TA-11, TA-12, TA-14).** Resolve `ws` advisories; add reproducible WASM build + digest; map API errors to fixed codes; re-frame `executionHash` as a non-cryptographic idempotency ref or use a real digest inside the enclave.
8. **Docs/test-count reconciliation (TA-15).** Align README/deployment-evidence/demo-script counts and "LIVE/VERIFIED" status rows with the 84-test reality and the mocked-suite caveat.

---

## Appendix — claims vs. reality (load-bearing rows)

Source: claims extracted from README.md / architecture.md / deployment-evidence.md / demo-script.md and checked against code + tests.

| Claim (doc:line) | Reality |
|---|---|
| "Only a public verdict leaves the enclave" (README:4,32,211; architecture:46) | True for the pure handler; `/api/score` also returns `featuresSummary` intermediates (TA-06) and the interactive tier never runs an enclave (TA-05). |
| "Proprietary weights / thresholds sealed inside the enclave, never hardcoded" (README:48,210; architecture:119) | False for the reachable tier: `policyConfig.ts` compiles the full model + profile tables into public source used by `/api/score`, `/api/agent/run`, and the demo (TA-05). |
| "No valid judged decision path bypasses confidential scoring / un-attested scores rejected with HTTP 502" (README:223; deployment-evidence:164) | False: `/api/score` and `/api/agent/run` score in Node with public secrets and no enclave; local envelopes are always "valid" (`allowUnverifiedLocal=true`), making the 502 branch unreachable (TA-05). |
| "Attestation Status: VERIFIED_ENCLAVE_EXECUTION (Execution Hash Validation)" (deployment-evidence:24,152) | Code always stamps `verified:false` / `LOCAL_PROTOTYPE_MODE` (confidentialScorer.ts:387-393); "verification" accepts self-asserted `verified:true` (TA-03). |
| "Registered on production DON … Registration Tx Hash 0x7b4a…" (deployment-evidence:17-21) | `registrationTxHash` is fabricated from the ASCII workflow-id string; no network call (createWorkflow.ts:60; TA-09). |
| "Sliding window rate limiting on all public API endpoints" (README:425) | Only `/api/score`; limiter trusts spoofable `X-Forwarded-For` (TA-04). |
| "Hard Score Gating … attested score … `gatedAction.ts`" (README:240) | Gate is numeric-only; no attestation check (TA-02). |
| "Arc agent pays 0.10 native USDC fee" (README:239,305) | No fee path in code; demo prints a literal "Fee Tx"; not enforced (TA-13). |
| "LIVE" Graph subgraph queries / deployed confidential workflow / real Arc allow-deny (README:368-375; deployment-evidence:138-141) | Committed suite globally mocks both Graph endpoints (`tests/setup.ts`); latency/status figures are not produced against live network by the suite; real-DON/Arc evidence not in repo (§4). |
| "tests: 66 passing" / "50 tests" / "59 tests" (README:6,261,311,470; deployment-evidence:173; demo-script:106,113) | Actual suite at delivery: **84 tests / 0 fail**, `tsc --noEmit` clean. Counts drifted across docs. |

*End of report. All reproductions are in `tests/robustnessEvidence.test.ts`; run `bun test` and `bun run typecheck` to re-verify.*
