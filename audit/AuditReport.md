# PrivateSignal Security & Architecture Audit Report

**Date**: 2026-09-07
**Version**: 1.0.0
**Target**: PrivateSignal (Chainlink CRE Confidential Scoring System)
**Auditor**: Antigravity [Gemini 3.0]

## Executive Summary

A comprehensive architectural review and dynamic test expansion was conducted on the PrivateSignal codebase. The focus was on identifying logic errors in cross-protocol aggregation, securing the Confidential Runtime Environment (CRE) boundaries, stress-testing boundary conditions in the pure math modules, validating the native Arc USDC fee model, and preventing secret leakage under fault conditions.

The system relies on a **Fail-Closed** design. Zero confidential material (thresholds, model weights, API keys) was found to leak into the public outputs, even during explicitly thrown exceptions (e.g., overflow conditions or simulated API failures).

The test suite was significantly expanded to 71 assertions, including adversarial inputs (prompt injection, undefined protocols, malformed GraphQL payloads) and mathematical edge bounds (NaN, Infinity). 100% of tests currently pass.

## Architecture Review

### 1. Confidential Execution Boundary
- **Status**: Secure.
- **Finding**: The system only outputs `ScoreOutput`, which includes `policyProfileId`, `protocols`, `score`, `recommendation`, `reason`, and `timestamp`. In the `confidentialScorer.ts` module, any caught runtime exceptions throw `DATA_UNAVAILABLE` or `UNSUPPORTED_PROTOCOL` without attaching internal state strings or weight matrices. Fuzz tests confirm that numerical overflow arrays never propagate to the output layer.

### 2. Attestation Model & Idempotency
- **Status**: Secure (Honest claims verified).
- **Finding**: `verifyAttestation` accurately identifies `LOCAL_PROTOTYPE_MODE` as unverified and tags it as `verified: false`. When in local simulation, signatures are distinctly marked as `UNVERIFIED_LOCAL`. The system successfully prevents a forged signature from being passed off as valid.

### 3. Financial Logistics (Arc Chain / Native USDC)
- **Status**: Secure.
- **Finding**: The `agentWallet.ts` functions interacting with the Arc Testnet correctly use `parseEther()` for native token handling. As Arc treats USDC as the native gas token (18 decimals, unlike ERC-20 USDC on Ethereum mainnet), the native token send `sendTransaction` implementation strictly respects the 18-decimal invariant.

### 4. Graph Router & Input Validation
- **Status**: Robust.
- **Finding**: The Natural Language Router (`nlRouter.ts`) was stress-tested against prompt injections and exceedingly long strings. Since the architecture relies on deterministic regex matching and deterministic substring filtering rather than LLM inference, it safely ignores prompt injection and either succeeds in pulling the wallet or safely throws an explicit address exception.

## Findings & Remediation

| ID | Component | Severity | Finding | Status |
|---|---|---|---|---|
| **PS-01** | `pureMath.ts` | Medium | `calculateConcentrationScore` returned score curves that violated the intended mathematical floor (0 instead of 25) for single-asset portfolios. | **FIXED** (Math modified to floor exactly at 25 and scale linearly down from 100). |
| **PS-02** | `pureMath.ts` | Low | `calculateHealthPressureIndex` yielded `NaN` if Graph data returned `NaN` or uninitialized variables. | **FIXED** (Added strict `isNaN()` checking to return a baseline fail of `0` pressure score). |
| **PS-03** | `nlRouter.ts` | Low | Missing wallet edge cases in prompt injection caused unhandled routing behavior. | **FIXED** (Adversarial test confirms it now extracts safely or explicitly rejects). |

## Test Suite Expansion

Added the following test modules (bringing total tests to 71):
- **`tests/adversarial.test.ts`**: Fuzzing, boundary edge cases, input malformation on routing, and TEE overflow conditions.
- **`tests/security.test.ts`**: Express rate limiting thresholds, attestation tampering/forgery vectors.

All tests run via `bun test` and have 0 regressions. Strict typechecking with `bun run typecheck` emits 0 warnings.

## Recommendations for Future Optimization
1. **Dynamic Secrets Refresh**: Current prototype architecture re-fetches secrets via the DON batched key fetch per-run. As mainnet loads increase, implement an internal caching mechanism utilizing TEE secure memory.
2. **Advanced Heuristics**: If transitioning the `nlRouter` to LLM-driven inference in the future, integrate prompt-injection screening models before the structured output parser.
