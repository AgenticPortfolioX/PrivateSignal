/**
 * Pure Math & Normalization Utilities
 *
 * CRITICAL RUNTIME CONSTRAINT: Runs inside QuickJS/WASM.
 * Absolutely zero Node.js dependencies, zero external libraries.
 * Deterministic math operations only.
 */

import type {
  NormalizedGraphData,
  CrossProtocolFeatures,
  CanonicalPolicyProfileId,
  RequestablePolicyProfileId,
} from '../types/scorer'

/**
 * Normalizes a caller-supplied policy profile id to its canonical form.
 *
 * Maps `conservative | conservative-v1` -> `conservative-v1`, etc. Returns
 * `null` for anything unrecognized so the scorer can fail closed instead of
 * silently degrading to a default profile.
 */
export function normalizePolicyProfileId(
  input: RequestablePolicyProfileId | string,
): CanonicalPolicyProfileId | null {
  switch (input) {
    case 'conservative':
    case 'conservative-v1':
      return 'conservative-v1'
    case 'balanced':
    case 'balanced-v1':
      return 'balanced-v1'
    case 'aggressive':
    case 'aggressive-v1':
      return 'aggressive-v1'
    default:
      return null
  }
}

/**
 * FAIL-CLOSED DATA RELIABILITY GATE.
 *
 * Decides whether graph data is trustworthy enough to score at all:
 *
 * - `malformed`  : not an object / `positions` is not an array.
 * - `unavailable`: no real exposure could be derived from `positions` AND the
 *                  caller did not assert `dataComplete`. Missing/empty data is
 *                  NEVER treated as a clean healthy portfolio.
 * - `usable`     : at least one position carries material USD exposure, OR the
 *                  caller explicitly asserted `dataComplete: true` with finite
 *                  totals (the only path a true zero-position wallet may take).
 */
export type GraphDataReliability =
  | { status: 'usable' }
  | { status: 'unavailable'; reason: string }
  | { status: 'malformed'; reason: string }

export function assessGraphDataReliability(data: NormalizedGraphData): GraphDataReliability {
  if (!data || typeof data !== 'object') {
    return { status: 'malformed', reason: 'GRAPH_DATA_MALFORMED: graphData is not an object' }
  }
  if (!Array.isArray(data.positions)) {
    return { status: 'malformed', reason: 'GRAPH_DATA_MALFORMED: positions is not an array' }
  }

  // Sum only entries that carry real, finite, positive USD exposure.
  let materialCollateralUSD = 0
  let materialDebtUSD = 0
  for (let i = 0; i < data.positions.length; i++) {
    const pos = data.positions[i]
    if (!pos || typeof pos !== 'object') {
      return { status: 'malformed', reason: 'GRAPH_DATA_MALFORMED: position entry is not an object' }
    }
    if (Array.isArray(pos.collateral)) {
      for (let j = 0; j < pos.collateral.length; j++) {
        const v = pos.collateral[j]?.valueUSD
        if (Number.isFinite(v) && v > 0) materialCollateralUSD += v
      }
    }
    if (Array.isArray(pos.debt)) {
      for (let k = 0; k < pos.debt.length; k++) {
        const v = pos.debt[k]?.valueUSD
        if (Number.isFinite(v) && v > 0) materialDebtUSD += v
      }
    }
  }

  if (materialCollateralUSD > 0 || materialDebtUSD > 0) {
    return { status: 'usable' }
  }

  // No exposure derived from positions. Only an explicit, validated
  // "complete" payload (true zero-position / zero-debt wallet) may proceed.
  const totalsPresent =
    Number.isFinite(data.totalCollateralUSD) && Number.isFinite(data.totalDebtUSD)

  if (data.dataComplete === true) {
    if (totalsPresent) {
      return { status: 'usable' }
    }
    return {
      status: 'unavailable',
      reason:
        'GRAPH_DATA_UNAVAILABLE: dataComplete asserted but totalCollateralUSD/totalDebtUSD totals are missing',
    }
  }

  return {
    status: 'unavailable',
    reason:
      'GRAPH_DATA_UNAVAILABLE: no positions carried exposure and no dataComplete assertion was supplied; refusing to score missing data as a healthy portfolio',
  }
}

/**
 * Calculates concentration score (0 - 100) from token collaterals
 * 100 = perfectly diversified, 0 = single asset concentration
 */
export function calculateConcentrationScore(
  collateralByToken: Record<string, number>,
  combinedCollateralValue: number,
): number {
  if (combinedCollateralValue <= 0) return 100
  let maxSingleTokenValue = 0
  const keys = Object.keys(collateralByToken)
  for (let i = 0; i < keys.length; i++) {
    const val = collateralByToken[keys[i]]
    if (val > maxSingleTokenValue) {
      maxSingleTokenValue = val
    }
  }
  const maxRatio = maxSingleTokenValue / combinedCollateralValue
  // If 100% in one token -> score = 25. If <= 20% in max token -> score = 100
  return Math.max(0, Math.min(100, Math.round((1 - (maxRatio - 0.2) / 0.8) * 100)))
}

/**
 * Calculates Health Pressure Index (0 - 100)
 * Measures safety margin above liquidation threshold (HF 1.0)
 * HF >= 2.5 -> 100 (Safe)
 * HF == 1.5 -> 65 (Moderate)
 * HF == 1.1 -> 20 (Danger)
 * HF <= 1.0 -> 0 (Liquidatable)
 */
export function calculateHealthPressureIndex(rawHF: number, _ltv?: number): number {
  if (rawHF <= 1.0) {
    return 0
  }
  if (rawHF >= 2.5) {
    return 100
  }
  return Math.round(((rawHF - 1.0) / 1.5) * 100)
}

/**
 * Calculates correlated asset ratio for staking derivatives
 */
export function calculateAssetCorrelation(
  correlatedCollateralUSD: number,
  combinedCollateralValue: number,
): number {
  if (combinedCollateralValue <= 0) return 0
  return Math.min(1, Math.max(0, correlatedCollateralUSD / combinedCollateralValue))
}

/**
 * Calculates cross-protocol features from normalized Graph position data
 * using pure mathematics.
 *
 * Callers MUST run `assessGraphDataReliability` first; this function does not
 * itself reject missing data (the empty-collateral concentration score is
 * vacuous by design and must not be reachable from an unverified payload).
 */
export function extractCrossProtocolFeatures(data: NormalizedGraphData): CrossProtocolFeatures {
  let combinedCollateralValue = 0
  let totalDebtUSD = 0
  const collateralByToken: Record<string, number> = {}

  // Aggregate collateral and debt across protocols
  if (Array.isArray(data.positions)) {
    for (let i = 0; i < data.positions.length; i++) {
      const pos = data.positions[i]
      if (Array.isArray(pos.collateral)) {
        for (let j = 0; j < pos.collateral.length; j++) {
          const col = pos.collateral[j]
          const val = Math.max(0, Number(col.valueUSD) || 0)
          combinedCollateralValue += val
          const sym = col.token && col.token.symbol ? col.token.symbol : 'UNKNOWN'
          collateralByToken[sym] = (collateralByToken[sym] || 0) + val
        }
      }
      if (Array.isArray(pos.debt)) {
        for (let k = 0; k < pos.debt.length; k++) {
          const d = pos.debt[k]
          const val = Math.max(0, Number(d.valueUSD) || 0)
          totalDebtUSD += val
        }
      }
    }
  }

  // Fallback to top-level aggregate fields if positions array was empty
  if (combinedCollateralValue === 0 && Number(data.totalCollateralUSD) > 0) {
    combinedCollateralValue = Number(data.totalCollateralUSD)
  }
  if (totalDebtUSD === 0 && Number(data.totalDebtUSD) > 0) {
    totalDebtUSD = Number(data.totalDebtUSD)
  }

  const concentrationScore = calculateConcentrationScore(collateralByToken, combinedCollateralValue)
  const healthPressureIndex = calculateHealthPressureIndex(Number(data.healthFactor) || 0)
  const correlatedAssetRatio = calculateAssetCorrelation(
    Number(data.correlatedCollateralUSD) || 0,
    combinedCollateralValue,
  )

  return {
    combinedCollateralValue,
    totalDebtUSD,
    concentrationScore,
    healthPressureIndex,
    correlatedAssetRatio,
  }
}

/**
 * Deterministic, non-cryptographic execution reference (FNV-1a 32-bit expanded
 * to a 0x-prefixed 64-hex-char string).
 *
 * NOT A DIGEST: do not call this "SHA-256" and do not treat it as an
 * attestation or integrity proof. It is a stable idempotency reference — the
 * same inputs produce the same string — useful only for matching a score back
 * to its query inputs. Runs in QuickJS without crypto or Node Buffer.
 */
export function deterministicExecutionRef(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0')
  return `0x${hex}${hex}${hex}${hex}`.slice(0, 66)
}
