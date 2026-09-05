# Slither Security Audit — PrivateSignal Contracts

**Audit date:** 2026-09-05
**Tool:** Slither `0.11.6` · solc `0.8.28+commit.7893614a.Windows.msvc`
**Scope:** `contracts/` — the only Solidity source in the repo:
- `contracts/IPrivateSignalReceiver.sol`
- `contracts/abi/PrivateSignalReceiver.json` (generated ABI — not analyzed, no Solidity)

**Command:** `slither contracts/ --solc-solcs-select 0.8.28`
**Final result:** `1 contract analyzed with 102 detectors → 0 findings` (after fix below).

---

## 1. Environment setup (record for reproducibility)

Slither and a compiler were not present initially; the Python TLS store also failed to fetch a compiler, so the binary was obtained directly.

| Tool | Version | Install command |
|---|---|---|
| Slither | 0.11.6 | `python -m pip install slither-analyzer solc-select` |
| solc | 0.8.28 | `solc-select install 0.8.28 && solc-select use 0.8.28` *(see TLS note)* |

> **TLS note:** `solc-select install` failed against `binaries.soliditylang.org` with `SSL: CERTIFICATE_VERIFY_FAILED` (Python cert store misconfigured in this environment; `curl` succeeds via the Windows store). The official Windows-amd64 binary was downloaded directly and registered under `~/.solc-select/artifacts/solc-0.8.28/`.

## 2. Finding found (1, Informational) → FIXED

| Detector | Severity (Slither) | Confidence | Location | Status |
|---|---|---|---|---|
| `solc-version` | Informational | High | `IPrivateSignalReceiver.sol#2` | **Fixed — re-run clean** |

**Original:** `pragma solidity ^0.8.20;`

**Why flagged:** the caret range permits compiler releases 0.8.20 and 0.8.21, which shipped known code-generation bugs:
- `VerbatimInvalidDeduplication` (0.8.20)
- `FullInlinerNonExpressionSplitArgumentEvaluationOrder` (0.8.21)
- `MissingSideEffectsOnSelectorAccess` (0.8.21)

**Why low impact here:** the flagged bugs live in the code generator/optimizer for function bodies and inline assembly. `IPrivateSignalReceiver` is a pure interface (events + one external signature) — it emits no runtime code, so none of these constructs are reachable. Still worth fixing for compiler determinism and to keep the repo slither-clean before any implementing contract is added.

**Fix applied — `pragma solidity 0.8.28;`** (pinned to the compiler the repo verifies against):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title IPrivateSignalReceiver
 * @author Justin Gramke
 * @notice Interface for on-chain contracts receiving attested private signals from CRE DON
 */
interface IPrivateSignalReceiver {
    // ... unchanged ...
}
```

> Note: Slither's detector fires on any two-token pragma range whose upper bound is not `<0.7.0` or lower, and checks the lower bound against its known-bug list. Both `0.8.28` (exact) and `^0.8.28` (caret) satisfy it; an exact pin was chosen for deterministic builds.

## 3. Post-fix verification

```
slither contracts/ --solc-solcs-select 0.8.28
> contracts/ analyzed (1 contracts with 102 detectors), 0 result(s) found
> compilation errors: none
```

## 4. False positives / limitations

- **The single `solc-version` finding was effectively a false positive in context** (an interface cannot exercise codegen bugs) — but it is now legitimately resolved by the pin.
- **Zero findings ≠ "the contracts are secure."** The repo contains only this interface; there is no implementing contract (no state, no function bodies) for Slither's behavioral detectors (reentrancy, access control, arithmetic, unchecked calls) to analyze. Any real implementation of `onSignalUpdate` should be added here and re-audited — with particular attention to the trusted-caller gating on who may update a signal, and the range/overflow safety of `signalValue` / `confidenceBps`.

## 5. Artifacts

- Audited source: `contracts/IPrivateSignalReceiver.sol`
- Prior audit trail in this folder: `CRE-Audit`, `CRE-Audit-Report.md`, `CRE-Audit-Report-Deployed-2026-09-05.md`, `Final-Test-Report.md`
