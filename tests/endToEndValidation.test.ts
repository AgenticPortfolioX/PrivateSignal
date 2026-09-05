/**
 * PrivateSignal — Comprehensive End-to-End Testing & Validation Suite
 *
 * Validates:
 * 1. Graph Integration (Standardized queries, schema mapping, NL extraction)
 * 2. Confidential Core TEE Scorer (Determinism, policy variation, Vault secret boundary)
 * 3. Arc Agent Integration (Native USDC gas model, zero ERC-20 calls, gating allow/deny)
 * 4. End-to-End Offline Simulation (Full loop execution with fixtures, attestation spec)
 */

import { describe, it, expect } from 'bun:test'
import {
  SAMPLE_WALLETS,
  MOCK_HEALTHY_GRAPH_DATA,
  MOCK_RISKY_GRAPH_DATA,
  MOCK_CONCENTRATED_GRAPH_DATA,
  MOCK_RAW_MESSARI_AAVE_RESPONSE,
} from './fixtures/samplePositions'
import { buildProtocolQuery, SUPPORTED_PROTOCOLS } from '../src/graph/queries'
import { mapMessariResponse } from '../src/graph/schemaMapper'
import { routeToGraphQueryPlan } from '../src/graph/nlRouter'
import { scoreCrossProtocolRisk } from '../src/handlers/confidentialScorer'
import { getDefaultSecretsForStyle } from '../src/config/policyConfig'
import type { Secrets } from '../src/types/scorer'
import { verifyAttestation } from '../src/utils/verifyAttestation'
import {
  STANDARD_CANDIDATE_ACTIONS,
  executeScoreGatedAction,
  type CandidateAction,
} from '../src/arc/gatedAction'
import { runAgentLoop } from '../src/arc/agentLoop'
import { arcTestnet } from '../src/arc/agentWallet'

describe('PrivateSignal: End-to-End Testing & Validation Suite', () => {

  // ==========================================================================
  // 1. Graph Integration Tests
  // ==========================================================================
  describe('Task 1.1: Graph Integration & Standardized Query Validation', () => {
    it('generates valid GraphQL queries for both Aave V3 and Morpho Blue', () => {
      for (const protocol of SUPPORTED_PROTOCOLS) {
        const query = buildProtocolQuery(protocol, SAMPLE_WALLETS.healthy)
        expect(query.endpoint).toBeDefined()
        expect(query.endpoint).toContain('subgraphs')
        expect(query.query).toContain('account(id: $walletAddress)')
        expect(query.query).toContain('positions')
        expect(query.query).toContain('maximumLTV')
        expect(query.variables.walletAddress).toBe(SAMPLE_WALLETS.healthy.toLowerCase())
      }
    })

    it('maps Messari Lending schema responses accurately into canonical protocol positions', () => {
      const mapped = mapMessariResponse('aave-v3', MOCK_RAW_MESSARI_AAVE_RESPONSE, SAMPLE_WALLETS.healthy)
      expect(mapped.account.id).toBe(SAMPLE_WALLETS.healthy.toLowerCase())
      expect(mapped.totalCollateralUSD).toBeGreaterThan(0)
      expect(mapped.totalDebtUSD).toBeGreaterThan(0)
      expect(mapped.positions[0].protocol).toBe('aave-v3')
      expect(mapped.positions[0].collateral.length).toBeGreaterThan(0)
      expect(mapped.healthFactor).toBeGreaterThan(1.0)
    })

    it('natural language router extracts target wallet, protocols, and policy profile', () => {
      const prompt = `Evaluate cross-protocol risk for wallet ${SAMPLE_WALLETS.healthy} across Aave and Morpho under aggressive policy`
      const plan = routeToGraphQueryPlan(prompt)

      expect(plan.walletAddress).toBe(SAMPLE_WALLETS.healthy.toLowerCase())
      expect(plan.protocols).toEqual(['aave-v3', 'morpho'])
      expect(plan.policyProfileId).toBe('aggressive')
      expect(plan.mcpToolCall.tool).toBe('execute_graph_query')
      expect(plan.multiProtocolToolCalls.length).toBe(2)
    })
  })

  // ==========================================================================
  // 2. Confidential Core Scoring Tests
  // ==========================================================================
  describe('Task 1.2: Confidential Scoring & TEE Enclave Privacy Boundary', () => {
    const secrets = getDefaultSecretsForStyle('balanced')

    it('produces identical deterministic scores for identical portfolio inputs', async () => {
      const params = {
        walletAddress: SAMPLE_WALLETS.healthy,
        protocols: ['aave-v3', 'morpho'],
        policyProfileId: 'balanced',
        queryId: 'test_det_01',
        timestamp: 1757000000,
        graphData: MOCK_HEALTHY_GRAPH_DATA,
      }

      const score1 = await scoreCrossProtocolRisk(params, secrets)
      const score2 = await scoreCrossProtocolRisk(params, secrets)

      expect(score1.score).toBe(score2.score)
      expect(score1.recommendation).toBe(score2.recommendation)
      expect(score1.attestation.executionHash).toBe(score2.attestation.executionHash)
    })

    it('produces distinct scores and recommendations for conservative vs aggressive policy profiles', async () => {
      const conservativeSecrets: Secrets = {
        ...getDefaultSecretsForStyle('conservative'),
        modelWeights: [0.55, 0.25, 0.1, 0.1], // Heavily penalizes high LTV
        thresholds: { safe: 80, caution: 55, highRisk: 30 },
      }
      const aggressiveSecrets: Secrets = {
        ...getDefaultSecretsForStyle('aggressive'),
        modelWeights: [0.15, 0.15, 0.35, 0.35], // Tolerates high leverage
        thresholds: { safe: 50, caution: 25, highRisk: 10 },
      }

      const params = {
        walletAddress: SAMPLE_WALLETS.risky,
        protocols: ['aave-v3', 'morpho'],
        policyProfileId: 'custom',
        queryId: 'test_policy_diff',
        timestamp: 1757000000,
        graphData: MOCK_RISKY_GRAPH_DATA,
      }

      const conservativeVerdict = await scoreCrossProtocolRisk(params, conservativeSecrets)
      const aggressiveVerdict = await scoreCrossProtocolRisk(params, aggressiveSecrets)

      expect(conservativeVerdict.score).toBeLessThan(aggressiveVerdict.score)
      expect(['caution', 'high_risk']).toContain(conservativeVerdict.recommendation)
    })

    it('strictly enforces the privacy boundary — zero secret weights in output', async () => {
      const secretSlot = 'slot_secret_vault_confidential_999'
      const customSecrets: Secrets & { secretSlot: string } = {
        ...getDefaultSecretsForStyle('balanced'),
        modelWeights: [0.45, 0.25, 0.15, 0.15],
        thresholds: { safe: 88, caution: 65, highRisk: 35 },
        secretSlot,
      }

      const params = {
        walletAddress: SAMPLE_WALLETS.healthy,
        protocols: ['aave-v3', 'morpho'],
        policyProfileId: 'proprietary_v1',
        queryId: 'test_privacy_leak_audit',
        timestamp: 1757000000,
        graphData: MOCK_HEALTHY_GRAPH_DATA,
      }

      const output = await scoreCrossProtocolRisk(params, customSecrets)
      const serialized = JSON.stringify(output)

      // Assert no secret values or slots leak into the output
      expect(serialized).not.toContain('0.45')
      expect(serialized).not.toContain('slot_secret_vault')
      expect(serialized).not.toContain(secretSlot)
      expect(serialized).not.toContain('modelWeights')
      expect(serialized).not.toContain('thresholds')
    })
  })

  // ==========================================================================
  // 3. Arc Integration & Native USDC Gas Tests
  // ==========================================================================
  describe('Task 1.3: Arc Native USDC Gas & Score-Gated Execution', () => {
    it('verifies Arc testnet configuration uses USDC as native gas currency (18 decimals)', () => {
      expect(arcTestnet.id).toBe(5042002)
      expect(arcTestnet.nativeCurrency.symbol).toBe('USDC')
      expect(arcTestnet.nativeCurrency.name).toBe('USDC')
      expect(arcTestnet.nativeCurrency.decimals).toBe(18)
    })

    it('enforces score-gated action allow path when score satisfies threshold', async () => {
      const action: CandidateAction = {
        id: 'act_safe_test',
        name: 'Safe Test Allocation',
        description: 'Mock capital deploy',
        threshold: 70,
        amountUSDC: 0.10,
        recipient: '0x3333333333333333333333333333333333333333',
      }

      const result = await executeScoreGatedAction(action, 85, { dryRun: true })
      expect(result.passed).toBe(true)
      expect(result.status).toBe('SIMULATED_DRY_RUN')
      expect(result.transactionHash).toBeUndefined()
      expect(result.blockedReason).toBeUndefined()
    })

    it('strictly aborts score-gated action deny path when score is below threshold', async () => {
      const action: CandidateAction = {
        id: 'act_safe_test',
        name: 'Safe Test Allocation',
        description: 'Mock capital deploy',
        threshold: 70,
        amountUSDC: 0.10,
        recipient: '0x3333333333333333333333333333333333333333',
      }

      const result = await executeScoreGatedAction(action, 55, { dryRun: true })
      expect(result.passed).toBe(false)
      expect(result.status).toBe('BLOCKED_BY_RISK_POLICY')
      expect(result.transactionHash).toBeUndefined()
      expect(result.blockedReason).toContain('BLOCKED_BY_RISK_POLICY')
    })
  })

  // ==========================================================================
  // 4. End-to-End Flow & Attestation Specification Validation
  // ==========================================================================
  describe('Task 1.4: End-to-End Flow & Attestation Specification', () => {
    it('completes closed-loop agent execution with mocked Graph & CRE', async () => {
      const result = await runAgentLoop({
        walletAddress: SAMPLE_WALLETS.healthy,
        policyThreshold: 65,
        candidateAction: 'allocate',
        dryRun: true,
      })

      expect(result.success).toBe(true)
      expect(result.passedPolicy).toBe(true)
      expect(result.score).toBeGreaterThanOrEqual(65)
      expect(result.feePayment).toBeDefined()
      expect(result.feePayment?.amountUSDC).toBe(0.10)
      expect(result.gatedAction?.status).toBe('SIMULATED_DRY_RUN')

      // Verify attestation specification format
      const attestation = result.attestationSummary
      expect(attestation.valid).toBe(true)
      expect(attestation.verified).toBe(false)
      expect(attestation.donId).toBe('LOCAL_PROTOTYPE_MODE')
      expect(attestation.workflowId).toBe('privatesignal-local-harness')
      expect(attestation.shortHash).toContain('0x')
      expect(attestation.status).toBe('MISSING_ATTESTATION')
    })

    it('blocks capital deployment end-to-end when evaluated with high-risk threshold', async () => {
      const result = await runAgentLoop({
        walletAddress: SAMPLE_WALLETS.risky,
        policyThreshold: 105, // Threshold above 100 ensures strict rejection
        candidateAction: 'transfer',
        dryRun: true,
      })

      expect(result.success).toBe(true)
      expect(result.passedPolicy).toBe(false)
      expect(result.gatedAction?.status).toBe('BLOCKED_BY_RISK_POLICY')
      expect(result.gatedAction?.transactionHash).toBeUndefined()
    })
  })
})
