/**
 * Phase 1 Confidential Core Tests
 *
 * Validates:
 * 1. TEE Scorer logic and pure-math normalization
 * 2. Privacy boundary enforcement (no secret leakage in output)
 * 3. Strategy styles (conservative, balanced, aggressive)
 * 4. Attestation generation and verification
 */

import { describe, it, expect } from 'bun:test'
import { scoreCrossProtocolRisk } from '../src/handlers/confidentialScorer'
import {
  CONSERVATIVE_THRESHOLDS,
  BALANCED_THRESHOLDS,
  AGGRESSIVE_THRESHOLDS,
  DEFAULT_MODEL_WEIGHTS,
  STANDARD_POLICY_PROFILES,
  getDefaultSecretsForStyle,
} from '../src/config/policyConfig'
import type { QueryParams, Secrets } from '../src/types/scorer'

describe('PrivateSignal: Confidential Core Scorer', () => {
  const mockHealthyParams: QueryParams = {
    walletAddress: '0x1111111111111111111111111111111111111111',
    protocols: ['aave-v3', 'morpho'],
    policyProfileId: 'conservative-v1',
    queryId: 'test-query-healthy-01',
    timestamp: 1757000000,
    graphData: {
      positions: [
        {
          protocol: 'aave-v3',
          collateral: [
            { token: { symbol: 'WETH', decimals: 18 }, amount: '10.0', valueUSD: 30000 },
            { token: { symbol: 'WBTC', decimals: 8 }, amount: '0.5', valueUSD: 30000 },
          ],
          debt: [
            { token: { symbol: 'USDC', decimals: 6 }, amount: '5000.0', valueUSD: 5000 },
          ],
        },
      ],
      healthFactor: 3.2,
      totalCollateralUSD: 60000,
      totalDebtUSD: 5000,
      correlatedCollateralUSD: 0,
    },
  }

  const mockRiskyParams: QueryParams = {
    walletAddress: '0x2222222222222222222222222222222222222222',
    protocols: ['aave-v3'],
    policyProfileId: 'conservative-v1',
    queryId: 'test-query-risky-01',
    timestamp: 1757000000,
    graphData: {
      positions: [
        {
          protocol: 'aave-v3',
          collateral: [
            { token: { symbol: 'stETH', decimals: 18 }, amount: '10.0', valueUSD: 25000 },
          ],
          debt: [
            { token: { symbol: 'WETH', decimals: 18 }, amount: '9.2', valueUSD: 23000 },
          ],
        },
      ],
      healthFactor: 1.08,
      totalCollateralUSD: 25000,
      totalDebtUSD: 23000,
      correlatedCollateralUSD: 25000,
    },
  }

  const conservativeSecrets: Secrets = {
    modelWeights: DEFAULT_MODEL_WEIGHTS,
    thresholds: CONSERVATIVE_THRESHOLDS,
    policyProfiles: STANDARD_POLICY_PROFILES,
    strategyStyle: 'conservative',
  }

  it('scores healthy positions with high score and "safe" recommendation', async () => {
    const output = await scoreCrossProtocolRisk(mockHealthyParams, conservativeSecrets)

    expect(output.score).toBeGreaterThanOrEqual(75)
    expect(output.recommendation).toBe('safe')
    expect(output.reasonCodes).toContain('HEALTHY_PROFILE')
    expect(output.attestation.verified).toBe(false)
  })

  it('scores overleveraged risky positions with "high_risk"', async () => {
    const output = await scoreCrossProtocolRisk(mockRiskyParams, conservativeSecrets)

    expect(output.score).toBeLessThan(50)
    expect(output.recommendation).toBe('high_risk')
    expect(output.reasonCodes).toContain('HEALTH_FACTOR_PRESSURE')
  })

  it('strictly enforces the privacy boundary — no secret weights or intermediate calculations in output', async () => {
    const output = await scoreCrossProtocolRisk(mockHealthyParams, conservativeSecrets)

    const rawKeys = Object.keys(output)
    expect(rawKeys.sort()).toEqual(
      ['attestation', 'queryId', 'reasonCodes', 'recommendation', 'score', 'timestamp', 'policyProfileId', 'protocols'].sort(),
    )

    // Ensure no private model weights, thresholds, or intermediate feature variables leaked
    expect((output as any).modelWeights).toBeUndefined()
    expect((output as any).thresholds).toBeUndefined()
    expect((output as any).policyProfiles).toBeUndefined()
    expect((output as any).intermediateFeatures).toBeUndefined()
    expect((output as any).ltvScore).toBeUndefined()
  })

  it('evaluates strategy styles (conservative vs aggressive)', async () => {
    const aggressiveSecrets = getDefaultSecretsForStyle('aggressive')

    const outputConservative = await scoreCrossProtocolRisk(mockHealthyParams, conservativeSecrets)
    const outputAggressive = await scoreCrossProtocolRisk(mockHealthyParams, aggressiveSecrets)

    expect(outputConservative.score).toBeGreaterThan(0)
    expect(outputAggressive.score).toBeGreaterThan(0)
  })

  it('generates verifiable deterministic attestation envelope', async () => {
    const output1 = await scoreCrossProtocolRisk(mockHealthyParams, conservativeSecrets)
    const output2 = await scoreCrossProtocolRisk(mockHealthyParams, conservativeSecrets)

    expect(output1.attestation.executionHash).toBe(output2.attestation.executionHash)
    expect(output1.attestation.workflowId).toBe('privatesignal-local-harness')
    expect(output1.attestation.donId).toBe('LOCAL_PROTOTYPE_MODE')
    expect(output1.attestation.verified).toBe(false)
  })
})
