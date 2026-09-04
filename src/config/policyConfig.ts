/**
 * PrivateSignal — Policy Configuration
 *
 * Provides standard baseline policy definitions, thresholds, and default weights
 * stored inside Vault DON secrets.
 */

import type { PolicyProfile, PolicyThresholds, Secrets } from '../types/scorer'

export const CONSERVATIVE_THRESHOLDS: PolicyThresholds = {
  safe: 75,
  caution: 50,
  highRisk: 25,
}

export const BALANCED_THRESHOLDS: PolicyThresholds = {
  safe: 65,
  caution: 40,
  highRisk: 20,
}

export const AGGRESSIVE_THRESHOLDS: PolicyThresholds = {
  safe: 55,
  caution: 30,
  highRisk: 15,
}

export const DEFAULT_MODEL_WEIGHTS = [0.3, 0.2, 0.2, 0.3] // [LTV / Collateral Ratio, Health Factor, Concentration, Asset Correlation]

export const STANDARD_POLICY_PROFILES: PolicyProfile[] = [
  {
    profileId: 'conservative-v1',
    name: 'Conservative Risk Policy',
    multiplier: 1.15,
    weightAdjustment: [0.35, 0.25, 0.2, 0.2],
  },
  {
    profileId: 'balanced-v1',
    name: 'Balanced Market Policy',
    multiplier: 1.0,
    weightAdjustment: [0.3, 0.2, 0.2, 0.3],
  },
  {
    profileId: 'aggressive-v1',
    name: 'High Yield Capital Efficiency Policy',
    multiplier: 0.85,
    weightAdjustment: [0.25, 0.2, 0.25, 0.3],
  },
]

export function getDefaultSecretsForStyle(style: 'conservative' | 'balanced' | 'aggressive'): Secrets {
  const thresholds =
    style === 'conservative'
      ? CONSERVATIVE_THRESHOLDS
      : style === 'aggressive'
        ? AGGRESSIVE_THRESHOLDS
        : BALANCED_THRESHOLDS

  return {
    modelWeights: DEFAULT_MODEL_WEIGHTS,
    thresholds,
    policyProfiles: STANDARD_POLICY_PROFILES,
    strategyStyle: style,
  }
}
