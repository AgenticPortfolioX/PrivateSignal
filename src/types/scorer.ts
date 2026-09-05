/**
 * PrivateSignal — Core Type Definitions
 *
 * Defines the strict interfaces for:
 * - parameters entering the confidential execution boundary (QueryParams),
 * - the private configuration loaded from CRE DON secrets (Secrets),
 * - the public output emitted after scoring (ScoreOutput).
 *
 * PRIVACY BOUNDARY: Secrets and any object derived from them must never be
 * logged, persisted, or returned outside the confidential execution context.
 * Only ScoreOutput leaves the boundary.
 */

/** Canonical (normalized) policy profile identifiers understood by the scorer. */
export type CanonicalPolicyProfileId = 'conservative-v1' | 'balanced-v1' | 'aggressive-v1'

/**
 * Policy profile identifiers a caller may submit. Short forms without the
 * "-v1" suffix are normalized to the canonical form before profile lookup.
 */
export type RequestablePolicyProfileId =
  | 'conservative'
  | 'balanced'
  | 'aggressive'
  | CanonicalPolicyProfileId

export interface PositionToken {
  symbol: string
  decimals: number
}

export interface PositionEntry {
  token: PositionToken
  amount: string
  valueUSD: number
}

export interface ProtocolPosition {
  protocol: string
  collateral: PositionEntry[]
  debt: PositionEntry[]
}

/**
 * Normalized on-chain position data entering the confidential scorer.
 *
 * FAIL-CLOSED CONTRACT: a payload with an empty/absent `positions` array is
 * treated as *missing data* unless the caller explicitly asserts, via
 * `dataComplete: true`, that the graph response was complete and the wallet
 * genuinely has no open exposure (a verified zero-position case). This keeps
 * "fetch failed / nothing was loaded" distinct from "a healthy empty wallet".
 */
export interface NormalizedGraphData {
  positions: ProtocolPosition[]
  healthFactor?: number
  totalCollateralUSD?: number
  totalDebtUSD?: number
  correlatedCollateralUSD?: number
  crossProtocolFeatures?: CrossProtocolFeatures
  /**
   * Set `true` only when the upstream data layer verified the graph response
   * was complete (including a legitimate zero-position / zero-debt wallet).
   * When absent or `false`, an empty `positions` array is scored as
   * data-unavailable, never as a clean healthy portfolio.
   */
  dataComplete?: boolean
}

/**
 * Policy profile identifier a caller may submit. Known ids
 * (`conservative`, `balanced`, `aggressive`, and their `-v1` canonical forms)
 * are normalized to a canonical profile whose multiplier / weights / thresholds
 * are applied by the scorer. The external HTTP boundary restricts input to
 * `RequestablePolicyProfileId` (see the workflow zod schema); internal Node
 * callers may pass other ids, which the scorer treats as an explicit
 * custom-config request using the supplied base secrets.
 */
export interface QueryParams {
  walletAddress: string
  protocols: string[]
  policyProfileId: string
  queryId: string
  timestamp: number
  graphData: NormalizedGraphData
}

/**
 * A risk policy profile. Profile parameters on the confidential path are read
 * from CRE DON secrets — never from compiled source constants alone.
 * `thresholds`, when present, overrides the base `Secrets.thresholds` set.
 */
export interface PolicyProfile {
  profileId: CanonicalPolicyProfileId
  name: string
  multiplier: number
  weightAdjustment?: number[]
  thresholds?: PolicyThresholds
}

export interface PolicyThresholds {
  safe: number
  caution: number
  highRisk: number
}

/**
 * Confidential model configuration. On the confidential (DON) path this object
 * is constructed from secrets read through the runtime's secrets provider
 * (`getSecret`/`getSecrets`). Public module-level defaults in policyConfig.ts
 * exist ONLY as non-confidential fallbacks for local engineering and tests;
 * the DON path must not use them.
 */
export interface Secrets {
  modelWeights: number[]
  /** Base thresholds; a matched PolicyProfile.thresholds overrides these. */
  thresholds: PolicyThresholds
  policyProfiles: PolicyProfile[]
  strategyStyle: 'conservative' | 'balanced' | 'aggressive'
}

/**
 * Public execution metadata emitted with every score.
 *
 * HONESTY CONTRACT — this is NOT a cryptographic attestation:
 * - `verified` is always `false` here. Real enclave/DON attestation is produced
 *   by the confidential workflow platform around this handler's output, not by
 *   this handler, so this code never stamps `verified: true` or an enclave
 *   signature of its own.
 * - `executionHash` is a deterministic non-cryptographic execution reference
 *   (FNV-1a based). It is NOT a SHA-256 digest and does not prove enclave
 *   execution. Use it only to match a score back to its inputs (idempotency).
 * - `signature` is a status sentinel, never a real signature.
 */
export interface AttestationEnvelope {
  /** Execution-context label. Set to a local marker unless a real DON id is supplied by the caller/host. */
  donId: string
  workflowId: string
  /** Deterministic execution reference (non-cryptographic). See type doc. */
  executionHash: string
  /** Status sentinel only — e.g. 'UNVERIFIED_LOCAL_EXECUTION' / 'NOT_ATTESTED'. */
  signature: string
  timestamp: number
  /** Always `false` on output from this handler; see type doc. */
  verified: boolean
}

export interface ScoreOutput {
  score: number
  recommendation: 'safe' | 'caution' | 'high_risk'
  reasonCodes: string[]
  attestation: AttestationEnvelope
  queryId: string
  timestamp: number
}

export interface CrossProtocolFeatures {
  combinedCollateralValue: number
  totalDebtUSD: number
  concentrationScore: number
  healthPressureIndex: number
  correlatedAssetRatio: number
  correlatedAssetFlags?: {
    isEthDerivativeConcentrated: boolean
    correlatedAssetRatio: number
  }
}

/**
 * Structural subset of the CRE runtime secrets provider. The scorer only needs
 * `getSecret`/`getSecrets`; passing this shape keeps the confidential core free
 * of a direct SDK import so it can run unchanged in QuickJS/WASM and in unit
 * tests.
 */
export interface SecretProviderLike {
  getSecret(request: { id: string; namespace?: string }): {
    result(): { id: string; value: string }
  }
  getSecrets?(requests: Array<{ id: string; namespace?: string }>): {
    result(): Record<string, { id: string; value: string }>
  }
}
