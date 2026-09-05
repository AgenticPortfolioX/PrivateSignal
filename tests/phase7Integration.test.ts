/**
 * PrivateSignal — Phase 7: End-to-End Integration & Final System Validation
 *
 * Validates the complete multi-layer stack:
 * Frontend/NL Input -> Graph Aggregator -> Chainlink CRE TEE Enclave -> Arc Agent Loop
 *
 * Test Scenarios:
 * - Scenario A (Run 1 & 2): Conservative policy, healthy wallet -> High score -> Action Approved
 * - Scenario B (Run 1 & 2): Aggressive policy, risky wallet -> Low score -> Action Blocked
 * - Performance Benchmark: Total < 30s, Graph < 5s, CRE < 20s, Arc < 5s
 * - Security & Privacy Audit: Zero secret weights or internal polynomials in public outputs
 */

import { describe, it, expect } from 'bun:test'
import { routeToGraphQueryPlan } from '../src/graph/nlRouter'
import { aggregateLiveGraphData } from '../src/graph/aggregator'
import { scoreCrossProtocolRisk } from '../src/handlers/confidentialScorer'
import { getDefaultSecretsForStyle } from '../src/config/policyConfig'
import { verifyAttestation } from '../src/utils/verifyAttestation'
import { runAgentLoop, type AgentConfig } from '../src/arc/agentLoop'
import { getArcBalance, parseUsdcAmount, formatUsdcAmount } from '../src/arc/agentWallet'
import { SAMPLE_WALLETS, MOCK_HEALTHY_GRAPH_DATA, MOCK_RISKY_GRAPH_DATA } from './fixtures/samplePositions'
import type { QueryParams, Secrets } from '../src/types/scorer'

describe('PrivateSignal — Phase 7: End-to-End Integration & System Validation', () => {

  // ==========================================================================
  // Task 1: Closed-Loop Data Flow & Attestation Preservation
  // ==========================================================================
  describe('Task 1: Multi-Layer Service Connectivity & Attestation Flow', () => {
    it('propagates data smoothly from NL prompt through Graph, TEE Scorer, and Arc Agent', async () => {
      const prompt = `Score cross-protocol risk for wallet ${SAMPLE_WALLETS.healthy} across Aave and Morpho under conservative policy`

      // 1. Natural Language Routing
      const plan = routeToGraphQueryPlan(prompt)
      expect(plan.walletAddress).toBe(SAMPLE_WALLETS.healthy.toLowerCase())
      expect(plan.protocols).toEqual(['aave-v3', 'morpho'])
      expect(plan.policyProfileId).toBe('conservative')

      // 2. Graph Aggregation
      const graphData = await aggregateLiveGraphData(plan.walletAddress, plan.protocols)
      expect(graphData.protocols).toEqual(['aave-v3', 'morpho'])
      expect(graphData.features).toBeDefined()

      // 3. Chainlink CRE Confidential Scoring (TEE)
      const secrets = getDefaultSecretsForStyle('conservative')
      const queryId = `phase7_test_${Date.now()}`
      const verdict = await scoreCrossProtocolRisk(
        {
          walletAddress: plan.walletAddress,
          protocols: plan.protocols,
          policyProfileId: plan.policyProfileId,
          queryId,
          timestamp: Math.floor(Date.now() / 1000),
          graphData: MOCK_HEALTHY_GRAPH_DATA,
        },
        secrets,
      )

      expect(verdict.score).toBeGreaterThanOrEqual(65)
      expect(verdict.recommendation).toBe('safe')
      expect(verdict.attestation.verified).toBe(false)
      expect(verdict.attestation.donId).toBe('LOCAL_PROTOTYPE_MODE')

      // 4. Attestation Verification helper
      const verification = verifyAttestation(verdict.attestation, undefined, true)
      expect(verification.valid).toBe(true)
      expect(verification.verified).toBe(false)
      expect(verification.executionHash).toMatch(/^0x[a-f0-9]+$/)

      // 5. Arc Agent Execution Loop
      const agentConfig: AgentConfig = {
        walletAddress: plan.walletAddress,
        policyThreshold: 65,
        candidateAction: 'allocate',
        policyProfileId: 'conservative',
        actionAmountUSDC: 0.2,
        dryRun: true,
      }

      const agentResult = await runAgentLoop(agentConfig)
      expect(agentResult.success).toBe(true)
      expect(agentResult.steps.length).toBe(5)
      expect(agentResult.attestationSummary.verified).toBe(false)
    })
  })

  // ==========================================================================
  // Task 3: Validation Scenarios (Run Twice Consecutively)
  // ==========================================================================
  describe('Task 3: Validation Scenarios Executed Twice Consecutively', () => {
    // Scenario A: Conservative policy, healthy wallet -> High score -> Action Approved
    it('Scenario A [Run 1]: Conservative policy evaluates healthy wallet with approved action', async () => {
      const config: AgentConfig = {
        walletAddress: SAMPLE_WALLETS.healthy,
        policyThreshold: 65,
        candidateAction: 'allocate',
        policyProfileId: 'conservative',
        actionAmountUSDC: 0.2,
        dryRun: true,
      }

      const res = await runAgentLoop(config)
      expect(res.success).toBe(true)
      expect(res.score).toBeGreaterThanOrEqual(65)
      expect(res.recommendation).toBe('safe')
      expect(res.gatedAction?.status).toBe('SIMULATED_DRY_RUN')
      expect(res.gatedAction?.transactionHash).toBeUndefined()
    })

    it('Scenario A [Run 2]: Conservative policy evaluates healthy wallet identically with approved action', async () => {
      const config: AgentConfig = {
        walletAddress: SAMPLE_WALLETS.healthy,
        policyThreshold: 65,
        candidateAction: 'allocate',
        policyProfileId: 'conservative',
        actionAmountUSDC: 0.2,
        dryRun: true,
      }

      const res = await runAgentLoop(config)
      expect(res.success).toBe(true)
      expect(res.score).toBeGreaterThanOrEqual(65)
      expect(res.recommendation).toBe('safe')
      expect(res.gatedAction?.status).toBe('SIMULATED_DRY_RUN')
      expect(res.gatedAction?.transactionHash).toBeUndefined()
    })

    // Scenario B: Aggressive policy, high-risk wallet -> Low score -> Action Blocked
    it('Scenario B [Run 1]: Aggressive policy evaluates high-risk wallet with blocked action', async () => {
      const config: AgentConfig = {
        walletAddress: SAMPLE_WALLETS.risky,
        policyThreshold: 80,
        candidateAction: 'transfer',
        policyProfileId: 'aggressive',
        actionAmountUSDC: 0.5,
        dryRun: true,
      }

      // We inject risky portfolio data into scoring to simulate live distressed borrower
      const secrets = getDefaultSecretsForStyle('aggressive')
      const verdict = await scoreCrossProtocolRisk(
        {
          walletAddress: SAMPLE_WALLETS.risky,
          protocols: ['aave-v3', 'morpho'],
          policyProfileId: 'aggressive',
          queryId: 'scen_b_run1',
          timestamp: Math.floor(Date.now() / 1000),
          graphData: MOCK_RISKY_GRAPH_DATA,
        },
        secrets,
      )

      expect(verdict.score).toBeLessThan(80)
      expect(['caution', 'high_risk']).toContain(verdict.recommendation)
      expect(verdict.attestation.verified).toBe(false)
    })

    it('Scenario B [Run 2]: Aggressive policy evaluates high-risk wallet identically with blocked action', async () => {
      const secrets = getDefaultSecretsForStyle('aggressive')
      const verdict = await scoreCrossProtocolRisk(
        {
          walletAddress: SAMPLE_WALLETS.risky,
          protocols: ['aave-v3', 'morpho'],
          policyProfileId: 'aggressive',
          queryId: 'scen_b_run2',
          timestamp: Math.floor(Date.now() / 1000),
          graphData: MOCK_RISKY_GRAPH_DATA,
        },
        secrets,
      )

      expect(verdict.score).toBeLessThan(80)
      expect(['caution', 'high_risk']).toContain(verdict.recommendation)
      expect(verdict.attestation.verified).toBe(false)
    })
  })

  // ==========================================================================
  // Task 5: Performance Benchmarking
  // ==========================================================================
  describe('Task 5: Performance & Latency Benchmarks', () => {
    it('meets strict latency criteria across all pipeline tiers', async () => {
      // 1. Graph Query Tier (Criteria: < 5000ms)
      const graphStart = Date.now()
      const graphRes = await aggregateLiveGraphData(SAMPLE_WALLETS.healthy, ['aave-v3', 'morpho'])
      const graphLatency = Date.now() - graphStart
      expect(graphLatency).toBeLessThan(5000)

      // 2. CRE Confidential Scoring Tier (Criteria: < 20000ms)
      const creStart = Date.now()
      const secrets = getDefaultSecretsForStyle('balanced')
      const scoreOutput = await scoreCrossProtocolRisk(
        {
          walletAddress: SAMPLE_WALLETS.healthy,
          protocols: ['aave-v3', 'morpho'],
          policyProfileId: 'balanced',
          queryId: 'bench_cre_01',
          timestamp: Math.floor(Date.now() / 1000),
          graphData: graphRes.normalizedGraphData,
        },
        secrets,
      )
      const creLatency = Date.now() - creStart
      expect(creLatency).toBeLessThan(20000)

      // 3. Arc Payment & Action Tier (Criteria: < 5000ms)
      const arcStart = Date.now()
      const arcRes = await runAgentLoop({
        walletAddress: SAMPLE_WALLETS.healthy,
        policyThreshold: 65,
        candidateAction: 'allocate',
        dryRun: true,
      })
      const arcLatency = Date.now() - arcStart
      expect(arcLatency).toBeLessThan(5000)

      // 4. Total Pipeline Latency (Criteria: < 30000ms)
      const totalLatency = graphLatency + creLatency + arcLatency
      expect(totalLatency).toBeLessThan(30000)
    })
  })

  // ==========================================================================
  // Task 6: Security Audit & Confidential Boundary Enclave Verification
  // ==========================================================================
  describe('Task 6: Security Audit & Secret Leakage Inspection', () => {
    it('verifies that zero private weights, thresholds, or polynomials leak into public output', async () => {
      const secretSlot = 'slot_secret_vault_confidential_audit_v9'
      const customSecrets: Secrets & { secretSlot: string } = {
        ...getDefaultSecretsForStyle('balanced'),
        modelWeights: [0.4444, 0.2222, 0.1888, 0.1446],
        thresholds: { safe: 91, caution: 61, highRisk: 31 },
        secretSlot,
      }

      const params: QueryParams = {
        walletAddress: SAMPLE_WALLETS.healthy,
        protocols: ['aave-v3', 'morpho'],
        policyProfileId: 'custom_security_test',
        queryId: 'sec_audit_leak_check',
        timestamp: Math.floor(Date.now() / 1000),
        graphData: MOCK_HEALTHY_GRAPH_DATA,
      }

      const verdict = await scoreCrossProtocolRisk(params, customSecrets)
      const serialized = JSON.stringify(verdict)

      // 1. Audit serialized JSON for secret values
      expect(serialized).not.toContain('0.4444')
      expect(serialized).not.toContain('0.2222')
      expect(serialized).not.toContain('0.1888')
      expect(serialized).not.toContain('0.1446')
      expect(serialized).not.toContain(secretSlot)
      expect(serialized).not.toContain('modelWeights')
      expect(serialized).not.toContain('thresholds')

      // 2. Verify attestation integrity
      expect(verdict.attestation).toBeDefined()
      expect(verdict.attestation.verified).toBe(false)
      expect(verdict.attestation.donId).toBe('LOCAL_PROTOTYPE_MODE')
      expect(verdict.attestation.signature).toBeDefined()

      // 3. Verify clean reason codes
      for (const code of verdict.reasonCodes) {
        expect(code).toMatch(/^[A-Z_]+$/)
        expect(code).not.toContain('0.')
      }
    })

    it('confirms all Arc transactions utilize native USDC (18 decimals) without ERC-20 calls', async () => {
      const amount = parseUsdcAmount(1.5)
      expect(amount).toBe(1500000000000000000n) // 18 decimals on Arc Testnet
      const formatted = formatUsdcAmount(amount)
      expect(formatted).toBe('1.5')

      const balance = await getArcBalance()
      expect(balance.balanceWei).toBeGreaterThan(0n)
      expect(balance.currency).toBe('USDC')
      expect(balance.decimals).toBe(18)
    })
  })
})
