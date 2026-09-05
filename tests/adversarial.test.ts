/**
 * PrivateSignal — Adversarial & Negative Test Suite
 *
 * Verifies system robustness against:
 * 1. Missing or malformed inputs (Graph API failure, invalid JSON, etc.)
 * 2. Exact cutoff boundaries for policy thresholds
 * 3. Out-of-order execution / missing attestation payloads
 */

import { describe, it, expect } from 'bun:test'
import { executeScoreGatedAction } from '../src/arc/gatedAction'
import { scoreCrossProtocolRisk } from '../src/handlers/confidentialScorer'
import { getDefaultSecretsForStyle } from '../src/config/policyConfig'
import { routeToGraphQueryPlan } from '../src/graph/nlRouter'
import { SAMPLE_WALLETS, MOCK_HEALTHY_GRAPH_DATA } from './fixtures/samplePositions'

describe('PrivateSignal: Adversarial & Negative Scenarios', () => {

  describe('Task 1: Boundary & Threshold Cutoffs', () => {
    it('strictly denies action when score exactly equals threshold minus 1', async () => {
      const result = await executeScoreGatedAction({
        id: 'boundary_test_deny',
        name: 'Boundary Test',
        description: 'Test',
        threshold: 65,
        amountUSDC: 0.1,
        recipient: '0x3333333333333333333333333333333333333333'
      }, 64, { dryRun: true })
      
      expect(result.passed).toBe(false)
      expect(result.status).toBe('BLOCKED_BY_RISK_POLICY')
    })

    it('strictly permits action when score exactly equals threshold', async () => {
      const result = await executeScoreGatedAction({
        id: 'boundary_test_allow',
        name: 'Boundary Test',
        description: 'Test',
        threshold: 65,
        amountUSDC: 0.1,
        recipient: '0x3333333333333333333333333333333333333333'
      }, 65, { dryRun: true })
      
      expect(result.passed).toBe(true)
      expect(result.status).toBe('SIMULATED_DRY_RUN')
    })
  })

  describe('Task 2: Malformed Inputs & Execution Ordering', () => {
    it('throws error when routing empty prompt to NL router', () => {
      expect(() => routeToGraphQueryPlan('')).toThrow('INVALID_ROUTER_INPUT')
    })

    it('confidential scorer throws on missing Vault DON secrets', async () => {
      const params = {
        walletAddress: SAMPLE_WALLETS.healthy,
        protocols: ['aave-v3'],
        policyProfileId: 'balanced',
        queryId: 'test_missing_secrets',
        timestamp: Math.floor(Date.now() / 1000),
        graphData: MOCK_HEALTHY_GRAPH_DATA,
      }
      
      // Pass empty secrets object
      await expect(scoreCrossProtocolRisk(params, {} as any)).rejects.toThrow('INVALID_ENCLAVE_CONFIG')
    })

    it('confidential scorer throws on missing Graph Data', async () => {
      const secrets = getDefaultSecretsForStyle('balanced')
      const params = {
        walletAddress: SAMPLE_WALLETS.healthy,
        protocols: ['aave-v3'],
        policyProfileId: 'balanced',
        queryId: 'test_missing_graph',
        timestamp: Math.floor(Date.now() / 1000),
      }
      
      await expect(scoreCrossProtocolRisk(params as any, secrets)).rejects.toThrow('INVALID_ENCLAVE_INPUT')
    })
  })
})
