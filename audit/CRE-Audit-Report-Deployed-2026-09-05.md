# CRE Deployment Audit — PrivateSignal (DON + confidential deploy)

**Audit date:** 2026-09-05
**Auditor:** Claude Code (evidence-based — every claim below tied to a command, file read, or live CLI result)
**Prior report:** [`CRE-Audit-Report.md`](CRE-Audit-Report.md) (pre-remediation, review-only) — this report is the **post-deployment** follow-up against the code that is actually live.
**Head revision:** `9decfab` (clean at audit start; one out-of-band test fix + this report in the working tree afterward).

---

## 1. Executive status

| Area | Status |
|---|---|
| DON / QuickJS-WASM compatibility | ✅ **CLEAN** — no Node built-ins or browser DOM on the in-DON path (verified by grep + typecheck + simulate) |
| Confidential config source of truth | ✅ **FIXED** — weights/thresholds/profiles load from Vault DON secrets (`getSecrets`), never compiled-in on the DON path |
| TEE registration | ✅ **FIXED** — single handler via `handlerInTee(…, TEE_CONSTRAINT nitro us-west-2)` |
| Fail-closed data handling | ✅ **FIXED & PROVEN LIVE** — empty graph → `GRAPH_DATA_UNAVAILABLE` (execution `98725025…`, ×9 nodes) |
| Honest output envelope | ✅ `verified:false` everywhere; **no** fabricated attestation/tx claim in code or in this audit |
| Deployed artifact | ✅ **ACTIVE** on the **private** registry — workflow `006da2b7…`, `txHash: null` (expected off-chain) |
| Open items | ⚠️ 1 low + 8 notes (Section 7) — none block the current staging deployment |

**Bottom line:** the DON layer that is live now resolves each finding the prior audit raised against the old code. This is a confidential HTTP workflow on the private registry, exercising secrets + fail-closed behavior with real evidence. It is **not** an on-chain / mainnet deployment, and nothing here claims an on-chain attestation or a `verified:true` score.

---

## 2. Deployed artifact — live evidence (read-only `cre` CLI)

```
cre workflow get privatesignal --target staging-settings --output json
```
```json
{
  "deployment": { "status": "ACTIVE", "deployedAt": "2026-09-05T08:53:00Z", "txHash": null },
  "workflow": {
    "name": "privatesignal-staging",
    "status": "ACTIVE",
    "workflowId": "006da2b72e685b2639308a5397fc80a610f43c2d4bcb796121aefa4e62dd935f",
    "registeredAt": "2026-09-05T08:22:15Z",
    "ownerAddress": "0232eb285b517a69a16f6a57c2b2a72cfce36074"
  }
}
```
- Registry: **private** (`deployment-registry: "private"` in `workflow.yaml`). `txHash: null` is correct for the off-chain private registry — there is no on-chain provenance to claim.
- Local simulation of the **same committed HEAD** reproduced the exact deployed config hash and executed an end-to-end confidential eval (Section 4.4).

---

## 3. Scope

Files that execute inside the DON (QuickJS/WASM) or configure the deployment — same scope contract as the prior report:

| File | Role |
|---|---|
| `privatesignal/main.ts` | CRE `Runner` entrypoint |
| `privatesignal/workflow.ts` | zod boundary schema + confidential HTTP handler + `handlerInTee` registration |
| `privatesignal/workflow.yaml` | target map (local / staging-private / production) |
| `workflow.yaml` (root), `project.yaml` | project/target settings |
| `privatesignal/config.{staging,local,production}.json` | trigger `authorizedKeys` |
| `src/handlers/confidentialScorer.ts` | confidential scoring core + secret loading |
| `src/utils/pureMath.ts` | feature math + fail-closed reliability gate |
| `src/config/policyConfig.ts` | **Node/test-only** mirror of secret JSON (see §5) |
| `src/types/scorer.ts` | boundary types |
| `secrets.yaml` | secret-id → env-var map |
| `tests/confidentialScorer.test.ts`, `tests/privatesignal.test.ts` | DON-scoped tests (used as evidence only) |

**Out of scope (Node side):** `src/api/*`, `src/arc/*`, `src/graph/*`, `frontend/*`, other `tests/*`.

---

## 4. Verification performed (evidence)

| # | Check | Command / method | Result |
|---|---|---|---|
| 4.1 | Prohibited-global scan on in-DON files | `grep -nE "process\.|require\(|Buffer|fs\.|fetch\(|localStorage|setTimeout\|setInterval|console\.(log|error|warn)"` across `workflow.ts`, `main.ts`, `confidentialScorer.ts`, `pureMath.ts`, `scorer.ts` | ✅ only doc-comment mentions |
| 4.2 | Typecheck vs real SDK | `bunx --bun tsc --noEmit` in `privatesignal/` | ✅ exit 0 |
| 4.3 | DON-scoped unit tests | `bun test tests/confidentialScorer.test.ts tests/privatesignal.test.ts` | ✅ **13 pass / 0 fail** (after the one-line `authorizedKeys` test fix, §7-R3) |
| 4.4 | Local simulation from committed HEAD | `cre workflow simulate privatesignal --target local-simulation` + one HTTP eval | ✅ compiled; **binary `de971922…`, config hash `b2e76fd…`** (matches deployed config); handler scored **100/100 SAFE** |
| 4.5 | Live deployed state | `cre workflow get` (above), `cre execution list/status` (§6) | ✅ ACTIVE + full run ledger |
| 4.6 | Compiled defaults absent from DON path | `grep -rn "getDefaultSecretsForStyle|DEFAULT_MODEL_WEIGHTS|policyConfig"` in DON files | ✅ zero references (one explanatory comment in `scorer.ts`) |

---

## 5. Prior-audit finding resolution (old code → current code)

### C-1 (CRITICAL) Weights compiled into WASM → **RESOLVED — secrets are now the source of truth on the DON path.**
The DON path never imports `policyConfig.ts` (§4.6). The handler loads all confidential config from the runtime secrets provider. The **deployed-critical** line is the batched read (`confidentialScorer.ts`):
```ts
export const CONFIDENTIAL_SECRET_IDS = ['MODEL_WEIGHTS', 'POLICY_THRESHOLDS', 'POLICY_PROFILES'] as const
...
if (typeof provider.getSecrets === 'function') {
  let resolved: Record<string, { id: string; value: string }> | undefined
  try {
    resolved = provider.getSecrets(CONFIDENTIAL_SECRET_IDS.map((id) => ({ id }))).result()
  } catch {
    resolved = undefined
  }
  for (let i = 0; i < CONFIDENTIAL_SECRET_IDS.length; i++) {
    const id = CONFIDENTIAL_SECRET_IDS[i]
    requireValue(id, resolved?.[id]?.value)   // throws INVALID_ENCLAVE_CONFIG if missing/empty
  }
}
```
`secrets.yaml` wires the ids to env vars; values live in the Vault DON (owner `0x0232…`, namespace `main`):
```yaml
secretsNames:
  MODEL_WEIGHTS:        ["MODEL_WEIGHTS_VAR"]
  POLICY_THRESHOLDS:    ["POLICY_THRESHOLDS_VAR"]
  POLICY_PROFILES:      ["POLICY_PROFILES_VAR"]
```
`policyConfig.ts` is now explicitly a **labeled local/test mirror**, and even its header says so:
```ts
// These constants are NOT read by the Chainlink DON path. … it MUST mirror the
// secret JSON values stored under MODEL_WEIGHTS, POLICY_THRESHOLDS, and POLICY_PROFILES …
```
**Live proof:** three deployed runs failed with `INVALID_ENCLAVE_CONFIG: required secret 'POLICY_THRESHOLDS' is missing or empty ×9` (the sequential-`getSecret` limit), and the batched fix scored a real eval (§6) — the deployed enclave only produces a score when the Vault secrets resolve.

### C-2 (CRITICAL) Not wired through the SDK TEE surface → **RESOLVED — `handlerInTee` + Nitro constraint, single handler.**
`workflow.ts`:
```ts
export const TEE_CONSTRAINT: TeeConstraint = [{ tee: 'nitro', regions: ['us-west-2'] }]
export const initWorkflow = (config: Config) => {
  const http = new HTTPCapability()
  return [
    handlerInTee(
      http.trigger({ authorizedKeys: config.authorizedKeys || [] }),
      onHttpTrigger,
      TEE_CONSTRAINT,
    ),
  ]
}
```
The old Cron path was **removed** (its fabricated-wallet scoring + dead calldata no longer exist). The handler runs on `TeeRuntime` and receives all external data **as parameters** (`payload.input`) — no outbound calls (§ grep: none).

### C-3 (CRITICAL) Fake attestation format → **HONEST (by design) — `verified` is always `false`.**
The scorer emits a self-authored envelope that never claims cryptographic attestation (`confidentialScorer.ts`):
```ts
const attestation: AttestationEnvelope = {
  donId: 'LOCAL_PROTOTYPE_MODE',
  workflowId: 'privatesignal-local-harness',
  executionHash,
  signature: 'UNVERIFIED_LOCAL_EXECUTION',
  timestamp: params.timestamp,
  verified: false,
}
```
The type doc is explicit that this is **not** an attestation. **Open honesty question:** whether the CRE platform attaches a *real* enclave attestation around confidential executions (retrievable via `cre execution …`/events) was **not** verified here — the HTTP smoke response and the emitted `ScoreOutput` carry none. Any "attested score / score is only valid if it originates from the TEE" claim must point at platform attestation, not this envelope (§7-R6).

### H-1 (HIGH) Empty data fails OPEN → **RESOLVED & PROVEN LIVE — fails closed.**
`pureMath.ts` gates before scoring:
```ts
export function assessGraphDataReliability(data: NormalizedGraphData): GraphDataReliability {
  if (!data || typeof data !== 'object')
    return { status: 'malformed', reason: 'GRAPH_DATA_MALFORMED: graphData is not an object' }
  if (!Array.isArray(data.positions))
    return { status: 'malformed', reason: 'GRAPH_DATA_MALFORMED: positions is not an array' }
  // …sums only real, finite, positive USD exposure…
  if (materialCollateralUSD > 0 || materialDebtUSD > 0) return { status: 'usable' }
  if (data.dataComplete === true) {
    if (Number.isFinite(data.totalCollateralUSD) && Number.isFinite(data.totalDebtUSD))
      return { status: 'usable' }          // only a verified zero-position wallet may proceed
    return { status: 'unavailable', reason: 'GRAPH_DATA_UNAVAILABLE: dataComplete asserted but totals missing' }
  }
  return { status: 'unavailable',
    reason: 'GRAPH_DATA_UNAVAILABLE: no positions carried exposure and no dataComplete assertion was supplied; refusing to score missing data as a healthy portfolio' }
}
```
Live: an empty-`positions` eval **failed** with exactly that reason, ×9 (§6).

### H-2 (HIGH) Fabricated Cron path → **RESOLVED — removed.** No Cron handler is registered; only the one confidential HTTP handler exists (asserted by test `registers exactly one confidential handler … (no Cron)`).

### H-3 (HIGH) Vault-deployment config doesn't match needs → **RESOLVED.** The Vault holds exactly the three ids the scorer requires, and the deployed run proves resolution (§4.1 / §6).

### M-1 (MEDIUM) Policy-profile selection dead → **RESOLVED.** `resolvePolicy` normalizes `conservative→conservative-v1` and applies the profile's multiplier / weightAdjustment / thresholds; short + canonical forms are accepted at the zod boundary and normalized (`pureMath.normalizePolicyProfileId`). The zod enum is `conservative|balanced|aggressive|*-v1`.

### M-2 (MEDIUM) No runtime boundary validation → **RESOLVED.** `queryParamsSchema` (zod) strictly parses every HTTP payload before the scorer; a parse failure raises `INVALID_HTTP_PAYLOAD` with a non-leaking reason:
```ts
export const queryParamsSchema = z.object({
  walletAddress: z.string().min(1),
  protocols: z.array(z.string()).min(1),
  policyProfileId: z.enum(['conservative','balanced','aggressive',
                           'conservative-v1','balanced-v1','aggressive-v1']),
  queryId: z.string().min(1),
  timestamp: z.number(),
  graphData: normalizedGraphDataSchema,
})
```

### M-3 (MEDIUM) Target inconsistency → **RESOLVED.** `privatesignal/workflow.yaml` and root `workflow.yaml` now define all three targets (local / staging / production), each with its own config + the shared `secrets.yaml`; staging pins `deployment-registry: "private"`. `config.local.json` is referenced by `local-simulation`. Remaining note: config files were repurposed from the legacy signal-feed shape to `authorizedKeys` only (see §7-R1/R6 for the production-config consequence).

### M-4 (MEDIUM) FNV-1a-32 called "SHA-256 digest" → **RESOLVED (relabeled), minor doc drift remains.** Docs now correctly say it is **not** a digest. Drift: `pureMath.deterministicExecutionRef` and the `AttestationEnvelope` doc claim a "0x-prefixed 64-hex-char / 66-char" string, but the code emits `0x` + **32** hex chars (one FNV-1a-32 block repeated 4×):
```ts
const hex = (hash >>> 0).toString(16).padStart(8, '0')   // 8 hex chars
return `0x${hex}${hex}${hex}${hex}`.slice(0, 66)          // → 0x + 32 hex = 34 chars
```
Observed output: `0x3e1079703e1079703e1079703e107970` (34 chars). See §7-R4.

### M-5 (MEDIUM) Dead code / skipped type checks → **mostly RESOLVED.** Unused `EVMClient`/`HTTPClient`/`consensusMedianAggregation`/`safeBase64*` are gone from `workflow.ts`. Build still uses `--skip-type-checks` and `tsconfig.json` sets `"types": ["node"]` — typecheck is separate (`npm run typecheck`, verified exit 0). See §7-R7 (wire typecheck into build/CI).

### N-1 (NOTE) Confirm runtime globals at simulate time → **CLOSED WITH EVIDENCE.** `TextDecoder` is the only encoding global on the DON path (`workflow.ts` decodes `payload.input`), and the re-run simulation executed it in the WASM runtime successfully (§4.4).

### N-2 (NOTE) Module headers overstate → **RESOLVED.** Scorer + type headers now state exactly what is true: secrets come from the provider, the envelope is **not** an attestation, `verified` is always false.

---

## 6. Live execution ledger (private registry, workflow `006da2b7…`)

| Execution (uuid) | When (UTC) | Status | Error / outcome |
|---|---|---|---|
| `7fbbc9cc-8aa0-4347-9487-c6e0dab650d0` | 08:40 | **FAILURE** | `INVALID_ENCLAVE_CONFIG: required secret 'POLICY_THRESHOLDS' is missing or empty` ×9 — **pre-fix** (sequential `getSecret` limit) |
| `742e9314-52bd-4d03-9290-70b257e8f46c` | 08:46 | **FAILURE** | same signature ×9 — pre-fix |
| `715fd6da-8ac1-41c4-91ea-6de7a82bbbf5` | 08:49 | **FAILURE** | same signature ×9 — pre-fix |
| `99fcf049-d4db-49cf-bcda-898136718145` | 08:53:35 | **SUCCESS** | valid eval → **Score 100/100 (SAFE)** — batched `getSecrets` fix live; per-node logs show secrets resolved |
| `98725025-1acb-43c0-bb33-2f10913765d2` | 08:54:42 | **FAILURE** | empty graph → **`GRAPH_DATA_UNAVAILABLE`** ×9 — intended fail-closed; logs show **no** score line |

Notes:
- The three pre-fix failures are the evidence trail for the bug, not the current behavior.
- `cre execution logs` surfaced the handler's `runtime.log` lines **per node** (including the public `Score 100/100 (SAFE)` line) even though the local simulator banner claims confidential-handler user logs "will not be visible / not leave the TEE" — §7-R5.

---

## 7. Remaining findings (open)

### R1 · LOW — `config.production.json` has **empty `authorizedKeys`** (= open access if ever deployed)
```json
{ "authorizedKeys": [] }
```
Not deployed (production is out of scope and on-chain is prohibited), but if a future deploy ever reads `production-settings`, the HTTP trigger is open to any caller (and an empty key list caused the engine to **fail** the first staging deploy). **Action:** before any production intent, set the explicit operator key — same shape as `config.staging.json`:
```json
{ "authorizedKeys": [{ "type": "KEY_TYPE_ECDSA_EVM", "publicKey": "0x748ABdeF0775132E8F941e1513152D5eb02D3a4B" }] }
```

### R2 · LOW — the deployed-critical **batched `getSecrets` path has no unit test**
`tests/privatesignal.test.ts`'s stub only implements `getSecret`, so `loadSecretsFromProvider` always takes the sequential fallback branch in tests. The real-DON regression (only the first sequential secret resolves) would **not** be caught by these unit tests — it was caught only by live runs. **Action:** add a `getSecrets`-capable stub and assert (a) all three resolve, (b) a missing/empty one throws `INVALID_ENCLAVE_CONFIG`, (c) the batch request carries all three ids:
```ts
const store = { MODEL_WEIGHTS: '…', POLICY_THRESHOLDS: '…', POLICY_PROFILES: '…' }
const provider = {
  getSecret: /* existing */,
  getSecrets: (reqs) => ({
    result: () => Object.fromEntries(reqs.map(r => [r.id, { id: r.id, value: store[r.id] }])),
  }),
}
```

### R3 · LOW — `authorizedKeys` test now guards only shape, not open-access regression
The out-of-band fix asserts `Array.isArray(parsed.authorizedKeys)` — which passes on `[]` too. **Action:** tighten to fail on empty keys so an accidental revert to open access breaks CI:
```ts
expect(parsed.authorizedKeys.length).toBeGreaterThan(0)
expect(parsed.authorizedKeys[0].publicKey).toBe('0x748ABdeF0775132E8F941e1513152D5eb02D3a4B')
```

### R4 · NOTE — execution-ref doc/code drift (32 vs 64 hex)
`deterministicExecutionRef` actually returns `0x` + 32 hex chars; its own comment and the `AttestationEnvelope` doc say 64-hex / 66-char. Harmless (still a stable idempotency ref, still **not** a digest), but align the comments or widen the expansion.

### R5 · NOTE — DON `runtime.log` lines appear in real `cre execution logs` per node
The simulator banner says confidential-handler logs won't leave the TEE, yet the live run's execution logs contained the handler's log lines (timestamp + public score) under each node. The code logs **public values only** (`workflow.ts` logs the timestamp, a rejection reason, and `Score X/100 (REC)`), so this is compliant today — but it means the log-content discipline is an active control. **Action:** never add weights/thresholds/profile/intermediates to `runtime.log`; confirm with CRE whether per-node log surfacing is expected for confidential HTTP.

### R6 · NOTE — `audit/Final-Test-Report.md` overstates relative to code + this audit
That report (by a separate QA pass) says "PASS — READY FOR ETHGLOBAL SUBMISSION", "produces an attested score", and "A score is only considered valid if it originates from the TEE." The code's own envelope is `verified:false` / `UNVERIFIED_LOCAL_EXECUTION`, and the HTTP smoke response carried no per-call attestation proof. The platform may attach real attestation around confidential executions, but this repo neither emits nor verifies one end-to-end. **Action:** before making any public "attested" claim, point at a concrete platform attestation artifact — or keep the honest `verified:false` envelope and describe the score as confidential-executed, not self-attested.

### R7 · NOTE — build skips type checks; DON TS config allows Node types
`privatesignal/package.json`: `"build": "cre workflow build . --target local-simulation --skip-type-checks"`, and `tsconfig.json` sets `"types": ["node"]`. Typecheck currently passes (`tsc --noEmit` exit 0), but a future accidental `process.env`/Node-global reference could pass `--skip-type-checks` and only surface at simulate/deploy. **Action:** remove `--skip-type-checks` (or run `tsc --noEmit` in CI before build).

### R8 · NOTE — transport/docs mismatch from the deploy session
This private-registry confidential workflow is served by the **public gateway** `https://01.gateway.zone-a.cre.chain.link` (JWT `workflows.execute`); the enterprise gateway returned "Workflow not found" for the same ID. **Action:** confirm with Chainlink CRE which gateway is authoritative for private-registry confidential HTTP before wiring any production transport.

### R9 · NOTE — caller-supplied `timestamp` is unvalidated for freshness
The zod schema accepts any finite number. It feeds only public metadata + the idempotency ref, never security decisions, so this is acceptable — the gateway/platform is the freshness authority. No action required beyond awareness.

---

## 8. Verdict & recommended next actions

The confidential DON layer is **clean and live**: QuickJS-safe, SDK-API-correct (`tsc` clean), secrets-backed (no compiled-in model on the DON path), fail-closed on missing data (proven live), single `handlerInTee` registration, honest `verified:false` output, and ACTIVE on the **private** registry with a real success + real fail-closed run ledger. Nothing claims an on-chain deploy or a fabricated attestation.

**Recommended order (none blocks the current staging deployment):**
1. Tighten the `authorizedKeys` unit assertion to `length > 0` + key equality (R3) — guards the open-access regression.
2. Add a `getSecrets`-capable stub test for the batched secret load (R2) — closes the only untested branch of the deployed-critical path.
3. Set an explicit operator key in `config.production.json` (R1) and align the execution-ref doc (R4).
4. Wire `tsc --noEmit` into build/CI (R7) and confirm the confidential-HTTP log-surfacing + gateway-authority questions with CRE (R5, R8).
5. Reconcile `Final-Test-Report.md` wording with the honest envelope before any external "attested" claim (R6).

**Verification commands for the owner:**
```bash
# DON-scoped tests
bun test tests/confidentialScorer.test.ts tests/privatesignal.test.ts
# typecheck vs the real SDK
cd privatesignal && bunx --bun tsc --noEmit
# local simulation from current HEAD (matches deployed config hash b2e76fd…)
cre workflow simulate privatesignal --target local-simulation
# live deployed state
cre workflow get privatesignal --target staging-settings --output json
cre execution list privatesignal-staging --limit 6 --output json
```
