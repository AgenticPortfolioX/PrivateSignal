/**
 * PrivateSignal — Core Type Definitions
 *
 * Defines the strict interfaces for parameters entering the TEE enclave,
 * private configuration loaded from Vault DON secrets, and attested output emitted.
 */

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

export interface NormalizedGraphData {
  positions: ProtocolPosition[]
  healthFactor?: number
  totalCollateralUSD?: number
  totalDebtUSD?: number
  correlatedCollateralUSD?: number
  crossProtocolFeatures?: CrossProtocolFeatures
}

export interface QueryParams {
  walletAddress: string
  protocols: string[]
  policyProfileId: string
  queryId: string
  timestamp: number
  graphData: NormalizedGraphData
}

export interface PolicyProfile {
  profileId: string
  name: string
  multiplier: number
  weightAdjustment?: number[]
}

export interface PolicyThresholds {
  safe: number
  caution: number
  highRisk: number
}

export interface Secrets {
  modelWeights: number[]
  thresholds: PolicyThresholds
  policyProfiles: PolicyProfile[]
  strategyStyle: 'conservative' | 'balanced' | 'aggressive'
}

export interface AttestationEnvelope {
  donId: string
  workflowId: string
  executionHash: string
  signature: string
  timestamp: number
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
