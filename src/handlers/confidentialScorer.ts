/**
 * PrivateSignal — Confidential Risk Scorer
 *
 * Executes inside the Chainlink DON (QuickJS/WASM). This file must stay free of
 * Node.js built-ins, browser globals, and any SDK import so it can run unchanged
 * in the WASM runtime AND be imported by Node-side helpers for deterministic tests.
 *
 * PRIVACY & RUNTIME BOUNDARY (NON-NEGOTIABLE):
 * 1. PROHIBITED: Node built-ins (`crypto`, `fs`, `http`, `os`, `path`, `buffer`).
 * 2. PROHIBITED: Browser globals (`fetch`, `window`, `document`, `setTimeout`).
 * 3. PROHIBITED: `console.log` and any error string that embeds a private weight,
 *    threshold, profile value, or intermediate calculation.
 * 4. OUTBOUND RESTRICTION: no network calls. All external state enters as params.
 *
 * WHAT STAYS INSIDE THE BOUNDARY (CONFIDENTIAL):
 * - Model weights, thresholds, and policy profiles — loaded ONLY from the runtime
 *   secrets provider (`loadSecretsFromProvider`), never from source literals.
 * - Raw intermediate feature values and normalization steps.
 *
 * WHAT LEAVES THE BOUNDARY (PUBLIC):
 * - Final integer score (0-100), coarse recommendation, coarse reason codes,
 *   and an HONEST execution envelope (see AttestationEnvelope docs). This code
 *   cannot mint real enclave attestation; `verified` is always false and no
 *   signature it emits is cryptographic.
 */

import type {
  QueryParams,
  Secrets,
  ScoreOutput,
  AttestationEnvelope,
  PolicyProfile,
  PolicyThresholds,
  CanonicalPolicyProfileId,
  SecretProviderLike,
} from '../types/scorer'
import {
  extractCrossProtocolFeatures,
  assessGraphDataReliability,
  normalizePolicyProfileId,
  deterministicExecutionRef,
} from '../utils/pureMath'

/** Secret ids the confidential core requires from the CRE secrets provider / Vault DON. */
export const CONFIDENTIAL_SECRET_IDS = [
  'MODEL_WEIGHTS',
  'POLICY_THRESHOLDS',
  'POLICY_PROFILES',
] as const

const BALANCED_BASE_THRESHOLDS: PolicyThresholds = { safe: 65, caution: 40, highRisk: 20 }

// ── Secret loading (config comes from secrets, not source) ──────────────────

function requireFiniteNumber(value: unknown, label: string): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`INVALID_ENCLAVE_CONFIG: ${label} must be a finite number`)
  }
  return n
}

function parsePolicyThresholds(value: unknown, label: string): PolicyThresholds {
  if (!value || typeof value !== 'object') {
    throw new Error(`INVALID_ENCLAVE_CONFIG: ${label} must be an object`)
  }
  const obj = value as Record<string, unknown>
  return {
    safe: requireFiniteNumber(obj.safe, `${label}.safe`),
    caution: requireFiniteNumber(obj.caution, `${label}.caution`),
    highRisk: requireFiniteNumber(obj.highRisk, `${label}.highRisk`),
  }
}

function parsePolicyProfiles(value: unknown): PolicyProfile[] {
  if (!Array.isArray(value)) {
    throw new Error('INVALID_ENCLAVE_CONFIG: POLICY_PROFILES must be a JSON array')
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`INVALID_ENCLAVE_CONFIG: POLICY_PROFILES[${index}] is not an object`)
    }
    const obj = entry as Record<string, unknown>
    const canonical = normalizePolicyProfileId(typeof obj.profileId === 'string' ? obj.profileId : '')
    if (!canonical) {
      throw new Error(
        `INVALID_ENCLAVE_CONFIG: POLICY_PROFILES[${index}] has an unrecognized profileId`,
      )
    }
    const multiplier = requireFiniteNumber(obj.multiplier, `POLICY_PROFILES[${index}].multiplier`)
    const profile: PolicyProfile = {
      profileId: canonical,
      name: typeof obj.name === 'string' ? obj.name : canonical,
      multiplier,
    }
    if (obj.weightAdjustment !== undefined) {
      const adj = obj.weightAdjustment
      if (!Array.isArray(adj) || adj.length !== 4 || !adj.every((w) => Number.isFinite(Number(w)))) {
        throw new Error(
          `INVALID_ENCLAVE_CONFIG: POLICY_PROFILES[${index}].weightAdjustment must be 4 numbers`,
        )
      }
      profile.weightAdjustment = adj.map((w) => Number(w))
    }
    if (obj.thresholds !== undefined) {
      profile.thresholds = parsePolicyThresholds(obj.thresholds, `POLICY_PROFILES[${index}].thresholds`)
    }
    return profile
  })
}

/**
 * Reads the confidential configuration from a CRE secrets provider and validates
 * it into a `Secrets` object. In the DON this provider is the `TeeRuntime` (which
 * extends `SecretsProvider` and resolves secrets from the Vault DON); in local
 * simulation it resolves from secrets.yaml + `.env`. Fails closed with
 * `INVALID_ENCLAVE_CONFIG` on any missing/malformed secret — never falls back to
 * compiled-in defaults.
 */
export function loadSecretsFromProvider(provider: SecretProviderLike): Secrets {
  if (!provider || typeof provider.getSecret !== 'function') {
    throw new Error('INVALID_ENCLAVE_CONFIG: secrets provider unavailable')
  }

  // Prefer a single batched `getSecrets` request: the confidential runtime
  // resolves every secret for an execution in one round trip. Sequential
  // per-id `getSecret` calls are kept only as a fallback for providers that do
  // not expose batching (e.g. minimal test doubles).
  const rawValues: Record<string, string> = {}
  const requireValue = (id: string, value: string | undefined): void => {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`INVALID_ENCLAVE_CONFIG: required secret '${id}' is missing or empty`)
    }
    rawValues[id] = value
  }

  if (typeof provider.getSecrets === 'function') {
    let resolved: Record<string, { id: string; value: string }> | undefined
    try {
      resolved = provider.getSecrets(CONFIDENTIAL_SECRET_IDS.map((id) => ({ id }))).result()
    } catch {
      resolved = undefined
    }
    for (let i = 0; i < CONFIDENTIAL_SECRET_IDS.length; i++) {
      const id = CONFIDENTIAL_SECRET_IDS[i]
      requireValue(id, resolved?.[id]?.value)
    }
  } else {
    for (let i = 0; i < CONFIDENTIAL_SECRET_IDS.length; i++) {
      const id = CONFIDENTIAL_SECRET_IDS[i]
      let value: string | undefined
      try {
        value = provider.getSecret({ id }).result().value
      } catch {
        value = undefined
      }
      requireValue(id, value)
    }
  }

  let weightsRaw: unknown
  let thresholdsRaw: unknown
  let profilesRaw: unknown
  try {
    weightsRaw = JSON.parse(rawValues.MODEL_WEIGHTS)
  } catch {
    throw new Error('INVALID_ENCLAVE_CONFIG: MODEL_WEIGHTS is not valid JSON')
  }
  try {
    thresholdsRaw = JSON.parse(rawValues.POLICY_THRESHOLDS)
  } catch {
    throw new Error('INVALID_ENCLAVE_CONFIG: POLICY_THRESHOLDS is not valid JSON')
  }
  try {
    profilesRaw = JSON.parse(rawValues.POLICY_PROFILES)
  } catch {
    throw new Error('INVALID_ENCLAVE_CONFIG: POLICY_PROFILES is not valid JSON')
  }

  if (
    !Array.isArray(weightsRaw) ||
    weightsRaw.length !== 4 ||
    !weightsRaw.every((w) => Number.isFinite(Number(w)))
  ) {
    throw new Error('INVALID_ENCLAVE_CONFIG: MODEL_WEIGHTS must be an array of 4 numbers')
  }
  const thresholds = parsePolicyThresholds(thresholdsRaw, 'POLICY_THRESHOLDS')
  const policyProfiles = parsePolicyProfiles(profilesRaw)

  return {
    modelWeights: weightsRaw.map((w) => Number(w)),
    thresholds,
    policyProfiles,
    strategyStyle: 'balanced',
  }
}

// ── Scoring core ─────────────────────────────────────────────────────────────

interface ResolvedPolicy {
  multiplier: number
  weights: number[]
  thresholds: PolicyThresholds
}

/**
 * Resolves the caller-requested policy to the concrete numbers used for scoring.
 *
 * - Known requestable ids (`conservative|conservative-v1`, ...) are normalized to
 *   their canonical profile and that profile's multiplier / weightAdjustment /
 *   thresholds are actually applied (fixes the previously-dead profile path).
 * - An unrecognized id is treated as a direct custom-config request: the base
 *   `secrets.modelWeights` / `secrets.thresholds` supplied by the operator are
 *   used as-is with multiplier 1.0. The external HTTP boundary rejects ids outside
 *   the requestable set, so only trusted internal callers reach this path.
 */
export function resolvePolicy(
  requestedId: string | undefined,
  secrets: Secrets,
): ResolvedPolicy {
  const canonical = normalizePolicyProfileId(requestedId ?? '')
  const baseThresholds = secrets.thresholds || BALANCED_BASE_THRESHOLDS

  if (!canonical) {
    return {
      multiplier: 1.0,
      weights: secrets.modelWeights,
      thresholds: baseThresholds,
    }
  }

  const profile = findProfile(secrets.policyProfiles, canonical)
  if (!profile) {
    throw new Error(
      `INVALID_POLICY_PROFILE: canonical profile '${canonical}' is not present in the confidential config`,
    )
  }
  const profileWeights =
    Array.isArray(profile.weightAdjustment) && profile.weightAdjustment.length === 4
      ? profile.weightAdjustment
      : secrets.modelWeights
  return {
    multiplier: Number(profile.multiplier) > 0 ? profile.multiplier : 1.0,
    weights: profileWeights,
    thresholds: profile.thresholds || baseThresholds,
  }
}

function findProfile(
  profiles: PolicyProfile[],
  profileId: CanonicalPolicyProfileId,
): PolicyProfile | undefined {
  if (!Array.isArray(profiles)) return undefined
  for (let i = 0; i < profiles.length; i++) {
    if (profiles[i].profileId === profileId) return profiles[i]
  }
  return undefined
}

/**
 * Executes confidential cross-protocol risk evaluation.
 *
 * @param params  Public inputs (query context + normalized Graph data)
 * @param secrets Private configuration loaded from secrets (see loadSecretsFromProvider)
 * @returns Public score output; no weights, thresholds, profiles, or intermediates leak.
 */
export async function scoreCrossProtocolRisk(
  params: QueryParams,
  secrets: Secrets,
): Promise<ScoreOutput> {
  // 0. Input validation (structured errors without leaking confidential memory)
  if (!params || typeof params !== 'object') {
    throw new Error('INVALID_ENCLAVE_INPUT: Missing required query parameters')
  }
  if (typeof params.walletAddress !== 'string' || params.walletAddress.trim() === '') {
    throw new Error('INVALID_ENCLAVE_INPUT: Missing walletAddress')
  }
  if (!params.graphData || typeof params.graphData !== 'object') {
    throw new Error('INVALID_ENCLAVE_INPUT: Missing graphData')
  }
  if (
    !secrets ||
    !Array.isArray(secrets.modelWeights) ||
    !secrets.thresholds ||
    !Array.isArray(secrets.policyProfiles)
  ) {
    throw new Error('INVALID_ENCLAVE_CONFIG: Missing or corrupted confidential secrets')
  }

  // 1. FAIL-CLOSED DATA RELIABILITY: missing/empty/malformed graph data is never
  //    scored as a clean healthy portfolio. Only explicitly-asserted complete
  //    zero-position data (dataComplete) may proceed, and only then with no debt.
  const reliability = assessGraphDataReliability(params.graphData)
  if (reliability.status !== 'usable') {
    throw new Error(reliability.reason)
  }

  // 2. Resolve the effective policy numbers (profile actually applies).
  const policy = resolvePolicy(params.policyProfileId as string | undefined, secrets)
  const weightSum =
    (policy.weights[0] || 0) + (policy.weights[1] || 0) + (policy.weights[2] || 0) + (policy.weights[3] || 0)
  if (!(weightSum > 0)) {
    throw new Error('INVALID_ENCLAVE_CONFIG: model weights must sum to a positive value')
  }
  const w0 = (policy.weights[0] || 0) / weightSum
  const w1 = (policy.weights[1] || 0) / weightSum
  const w2 = (policy.weights[2] || 0) / weightSum
  const w3 = (policy.weights[3] || 0) / weightSum

  // 3. Compute cross-protocol features inside the boundary.
  const features = extractCrossProtocolFeatures(params.graphData)

  // 4. Sub-scores (0-100).
  //    LTV score: ratio of debt to collateral.
  let ltvScore = 100
  if (features.combinedCollateralValue > 0) {
    const debtRatio = features.totalDebtUSD / features.combinedCollateralValue
    if (debtRatio >= 0.9) {
      ltvScore = 10 // Extreme leverage
    } else if (debtRatio <= 0.2) {
      ltvScore = 100 // Minimal debt
    } else {
      ltvScore = Math.round(100 - ((debtRatio - 0.2) / 0.7) * 90)
    }
  } else if (features.totalDebtUSD > 0) {
    ltvScore = 0 // Debt with no collateral
  }

  //    Health score: with zero debt there is nothing to liquidate, so pressure is
  //    vacuously healthy; otherwise it is the derived health-pressure index.
  const healthScore =
    features.totalDebtUSD <= 0 ? 100 : Math.max(0, Math.min(100, features.healthPressureIndex))

  //    Concentration score (diversification).
  const concentrationScore = features.concentrationScore

  //    Correlation score: high correlated collateral (e.g. stETH behind ETH debt)
  //    increases depeg tail-risk.
  const correlationScore = Math.max(
    0,
    Math.min(100, Math.round((1 - features.correlatedAssetRatio) * 100)),
  )

  // 5. Composite score.
  const rawWeightedScore =
    ltvScore * w0 + healthScore * w1 + concentrationScore * w2 + correlationScore * w3
  let finalScore = Math.round(rawWeightedScore * policy.multiplier)
  if (finalScore < 0) finalScore = 0
  if (finalScore > 100) finalScore = 100

  // 6. Recommendation against the resolved profile thresholds.
  const thresholds = policy.thresholds
  let recommendation: 'safe' | 'caution' | 'high_risk' = 'high_risk'
  if (finalScore >= thresholds.safe) {
    recommendation = 'safe'
  } else if (finalScore >= thresholds.caution) {
    recommendation = 'caution'
  } else {
    recommendation = 'high_risk'
  }

  // 7. Coarse reason codes (non-identifying high-level indicators).
  const reasonCodes: string[] = []
  if (healthScore >= 70) {
    reasonCodes.push('HEALTH_FACTOR_NOMINAL')
  } else if (healthScore < 40) {
    reasonCodes.push('LIQUIDATION_PRESSURE_ELEVATED')
  }
  if (ltvScore >= 70) {
    reasonCodes.push('LEVERAGE_CONSERVATIVE')
  } else if (ltvScore < 40) {
    reasonCodes.push('LEVERAGE_ELEVATED')
  }
  if (concentrationScore >= 70) {
    reasonCodes.push('COLLATERAL_DIVERSIFIED')
  } else if (concentrationScore < 40) {
    reasonCodes.push('COLLATERAL_CONCENTRATED')
  }
  if (correlationScore < 50) {
    reasonCodes.push('CORRELATED_ASSET_EXPOSURE')
  }
  if (reasonCodes.length === 0) {
    reasonCodes.push('RISK_METRICS_BALANCED')
  }

  // 8. Honest execution envelope. This handler cannot produce real enclave
  //    attestation; see AttestationEnvelope docs. No verified:true is ever stamped.
  const executionHash = deterministicExecutionRef(
    `${params.queryId}:${params.walletAddress}:${finalScore}:${recommendation}:${params.timestamp}`,
  )
  const attestation: AttestationEnvelope = {
    donId: 'LOCAL_PROTOTYPE_MODE',
    workflowId: 'privatesignal-local-harness',
    executionHash,
    signature: 'UNVERIFIED_LOCAL_EXECUTION',
    timestamp: params.timestamp,
    verified: false,
  }

  return {
    score: finalScore,
    recommendation,
    reasonCodes,
    attestation,
    queryId: params.queryId,
    timestamp: params.timestamp,
  }
}
