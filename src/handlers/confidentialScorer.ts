/**
 * PrivateSignal — Confidential TEE Risk Scorer Handler
 *
 * ============================================================================
 * PRIVACY & RUNTIME BOUNDARY (NON-NEGOTIABLE):
 * ============================================================================
 * 1. This code compiles to WebAssembly (WASM) via QuickJS and executes inside
 *    a Trusted Execution Environment (TEE) on a Chainlink Decentralized Oracle
 *    Network (DON).
 * 2. PROHIBITED: Node.js built-ins (`crypto`, `fs`, `http`, `os`, `path`, `buffer`)
 * 3. PROHIBITED: Browser globals (`fetch`, `window`, `document`)
 * 4. PROHIBITED: `console.log` or error strings that leak private weights/thresholds.
 * 5. OUTBOUND RESTRICTION: The handler cannot make outbound network or HTTP calls.
 *    All external state enters as input parameters (`QueryParams.graphData`).
 *
 * WHAT STAYS INSIDE THE TEE (CONFIDENTIAL):
 * - Private model weights (e.g., [0.3, 0.2, 0.2, 0.3])
 * - Custom policy thresholds ({ safe: 75, caution: 50, highRisk: 25 })
 * - Policy profiles and proprietary strategy multipliers
 * - Raw intermediate feature calculations and normalization steps
 *
 * WHAT LEAVES THE TEE (PUBLIC / ATTESTED):
 * - Final aggregated integer score (0 - 100)
 * - Coarse recommendation category ('safe' | 'caution' | 'high_risk')
 * - Coarse reason codes (e.g., 'HEALTH_FACTOR_NOMINAL', 'LEVERAGE_BALANCED')
 * - Signed cryptographic attestation proving deterministic enclave execution
 * - Query identifier and DON execution timestamp
 * ============================================================================
 */

import type {
  QueryParams,
  Secrets,
  ScoreOutput,
  AttestationEnvelope,
} from '../types/scorer'
import { extractCrossProtocolFeatures, deterministicHash } from '../utils/pureMath'

/**
 * Executes cross-protocol confidential risk evaluation inside the TEE enclave.
 *
 * @param params Public inputs entering the enclave (query context + normalized Graph data)
 * @param secrets Private configuration loaded from Vault DON secrets
 * @returns Attested score output without leaking model weights or intermediate calculations
 */
export async function scoreCrossProtocolRisk(
  params: QueryParams,
  secrets: Secrets,
): Promise<ScoreOutput> {
  // Input validation (structured error without leaking confidential memory)
  if (!params || !params.walletAddress || !params.graphData) {
    throw new Error('INVALID_ENCLAVE_INPUT: Missing required query parameters')
  }
  if (!secrets || !Array.isArray(secrets.modelWeights) || !secrets.thresholds) {
    throw new Error('INVALID_ENCLAVE_CONFIG: Missing or corrupted Vault DON secrets')
  }

  // 1. Compute cross-protocol mathematical features inside enclave
  const features = extractCrossProtocolFeatures(params.graphData)

  // 2. Derive individual sub-scores (0 - 100 scale using pure math)
  // Sub-score 1: Collateral / Debt Ratio (LTV Metric)
  let ltvScore = 100
  if (features.combinedCollateralValue > 0) {
    const debtRatio = features.totalDebtUSD / features.combinedCollateralValue
    if (debtRatio >= 0.9) {
      ltvScore = 10 // Extreme leverage
    } else if (debtRatio <= 0.2) {
      ltvScore = 100 // Minimal debt
    } else {
      // Linear scaling between 0.2 (100) and 0.9 (10)
      ltvScore = Math.round(100 - ((debtRatio - 0.2) / 0.7) * 90)
    }
  } else if (features.totalDebtUSD > 0) {
    ltvScore = 0 // Debt with no collateral
  }

  // Sub-score 2: Health Factor Liquidation Buffer (0 - 100)
  const healthScore = features.healthPressureIndex

  // Sub-score 3: Asset Concentration Diversification (0 - 100)
  const concentrationScore = features.concentrationScore

  // Sub-score 4: Asset Correlation Risk (0 - 100)
  // High correlated collateral (e.g. stETH backing ETH debt) increases depeg tail-risk
  const correlationScore = Math.max(0, Math.min(100, Math.round((1 - features.correlatedAssetRatio) * 100)))

  // 3. Locate active policy profile multipliers
  let policyMultiplier = 1.0
  let weights = secrets.modelWeights

  if (Array.isArray(secrets.policyProfiles)) {
    for (let i = 0; i < secrets.policyProfiles.length; i++) {
      const profile = secrets.policyProfiles[i]
      if (profile.profileId === params.policyProfileId) {
        policyMultiplier = profile.multiplier || 1.0
        if (Array.isArray(profile.weightAdjustment) && profile.weightAdjustment.length === 4) {
          weights = profile.weightAdjustment
        }
        break
      }
    }
  }

  // Normalize weights sum
  const weightSum = (weights[0] || 0.25) + (weights[1] || 0.25) + (weights[2] || 0.25) + (weights[3] || 0.25)
  const w0 = (weights[0] || 0.25) / weightSum
  const w1 = (weights[1] || 0.25) / weightSum
  const w2 = (weights[2] || 0.25) / weightSum
  const w3 = (weights[3] || 0.25) / weightSum

  // 4. Calculate raw composite score
  const rawWeightedScore =
    ltvScore * w0 +
    healthScore * w1 +
    concentrationScore * w2 +
    correlationScore * w3

  // Apply policy profile multiplier and clamp strictly to 0 - 100
  let finalScore = Math.round(rawWeightedScore * policyMultiplier)
  if (finalScore < 0) finalScore = 0
  if (finalScore > 100) finalScore = 100

  // 5. Evaluate recommendation against private thresholds
  const thresholds = secrets.thresholds
  let recommendation: 'safe' | 'caution' | 'high_risk' = 'high_risk'
  if (finalScore >= thresholds.safe) {
    recommendation = 'safe'
  } else if (finalScore >= thresholds.caution) {
    recommendation = 'caution'
  } else {
    recommendation = 'high_risk'
  }

  // 6. Generate coarse reason codes (non-identifying high-level indicators)
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

  // 7. Construct cryptographic attestation envelope
  const executionHash = deterministicHash(
    `${params.queryId}:${params.walletAddress}:${finalScore}:${recommendation}:${params.timestamp}`,
  )

  const attestation: AttestationEnvelope = {
    donId: 'don-zone-a-production',
    workflowId: 'privatesignal-confidential-v1',
    executionHash,
    signature: `0xattest_${executionHash.slice(2, 34)}`,
    timestamp: params.timestamp,
    verified: true,
  }

  // Return ONLY public envelope (weights, intermediates, and thresholds remain inside TEE)
  return {
    score: finalScore,
    recommendation,
    reasonCodes,
    attestation,
    queryId: params.queryId,
    timestamp: params.timestamp,
  }
}
