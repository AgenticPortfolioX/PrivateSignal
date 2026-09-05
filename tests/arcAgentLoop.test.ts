/**
 * PrivateSignal — Arc Agent Loop Test Suite
 *
 * Tests:
 * 1. Arc Wallet & Native USDC Balance Service (src/arc/agentWallet.ts)
 * 2. Score-Gated Action Execution (src/arc/gatedAction.ts)
 * 3. Complete Autonomous Agent Loop Controller (src/arc/agentLoop.ts)
 */

import { describe, it, expect } from 'bun:test'
import { getArcBalance, getAgentAccount, DEFAULT_QUERY_FEE_USDC } from '../src/arc/agentWallet'
import {
  executeScoreGatedAction,
  STANDARD_CANDIDATE_ACTIONS,
  type CandidateAction,
} from '../src/arc/gatedAction'
import { runAgentLoop, type AgentConfig } from '../src/arc/agentLoop'

describe('PrivateSignal: Arc Agent Integration & Gated Action Loop', () => {
  const sampleWallet = '0x1111111111111111111111111111111111111111'

  describe('Task 1: Arc Wallet & Native USDC Balance', () => {
    it('initializes agent account from environment private key', () => {
      const account = getAgentAccount()
      expect(account.address).toBeDefined()
      expect(account.address.startsWith('0x')).toBe(true)
      expect(account.address.length).toBe(42)
    })

    it('reads live native USDC balance from Arc testnet RPC', async () => {
      const balanceInfo = await getArcBalance()
      expect(balanceInfo.address).toBeDefined()
      expect(balanceInfo.balanceUSDC).toBeGreaterThanOrEqual(0)
      expect(typeof balanceInfo.isLowBalance).toBe('boolean')
    })
  })

  describe('Task 2: Score-Gated Policy Action', () => {
    const candidate: CandidateAction = {
      id: 'test_action_01',
      name: 'Test Allocation',
      description: 'Test native USDC transfer gated by score',
      threshold: 70,
      amountUSDC: 0.1,
      recipient: '0x3333333333333333333333333333333333333333',
    }

    it('allows execution when attested score satisfies policy threshold (allow path)', async () => {
      const passingScore = 85 // 85 >= 70
      const result = await executeScoreGatedAction(candidate, passingScore, { dryRun: true })

      expect(result.passed).toBe(true)
      expect(result.status).toBe('EXECUTED_ON_ARC')
      expect(result.score).toBe(85)
      expect(result.threshold).toBe(70)
      expect(result.transactionHash).toBeDefined()
      expect(result.blockedReason).toBeUndefined()
    })

    it('strictly aborts execution when attested score is below threshold (deny path)', async () => {
      const failingScore = 52 // 52 < 70
      const result = await executeScoreGatedAction(candidate, failingScore, { dryRun: true })

      expect(result.passed).toBe(false)
      expect(result.status).toBe('BLOCKED_BY_RISK_POLICY')
      expect(result.score).toBe(52)
      expect(result.threshold).toBe(70)
      expect(result.transactionHash).toBeUndefined()
      expect(result.blockedReason).toContain('BLOCKED_BY_RISK_POLICY')
      expect(result.blockedReason).toContain('below required policy threshold')
    })

    it('evaluates standard candidate action profiles (safe allocation vs yield strategy)', async () => {
      const moderateScore = 72

      // Safe allocation (threshold 65) should pass
      const safeRes = await executeScoreGatedAction(
        STANDARD_CANDIDATE_ACTIONS.safe_allocation,
        moderateScore,
        { dryRun: true },
      )
      expect(safeRes.passed).toBe(true)

      // Yield strategy (threshold 80) should fail
      const yieldRes = await executeScoreGatedAction(
        STANDARD_CANDIDATE_ACTIONS.yield_strategy,
        moderateScore,
        { dryRun: true },
      )
      expect(yieldRes.passed).toBe(false)
    })
  })

  describe('Task 3: Full Autonomous Arc Agent Loop', () => {
    it('executes complete end-to-end agent cycle with telemetry', async () => {
      const config: AgentConfig = {
        walletAddress: sampleWallet,
        policyThreshold: 60,
        candidateAction: 'allocate',
        dryRun: true,
      }

      const result = await runAgentLoop(config)

      expect(result.success).toBe(true)
      expect(result.targetWallet).toBe(sampleWallet.toLowerCase())
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(100)
      expect(result.attestationSummary.valid).toBe(true)
      expect(result.attestationSummary.workflowId).toBe('privatesignal-confidential-v1')
      expect(result.feePayment).toBeDefined()
      expect(result.gatedAction).toBeDefined()
      expect(result.steps.length).toBeGreaterThanOrEqual(5)

      const stepNames = result.steps.map((s) => s.name)
      expect(stepNames).toContain('CHECK_ARC_BALANCE')
      expect(stepNames).toContain('PAY_USDC_FEE')
      expect(stepNames).toContain('FETCH_GRAPH_DATA')
      expect(stepNames).toContain('CONFIDENTIAL_TEE_SCORING')
      expect(stepNames).toContain('POLICY_GATE_EVALUATION')
    })

    it('processes natural language query prompt in agent loop', async () => {
      const config: AgentConfig = {
        walletAddress: sampleWallet,
        queryString: `Score cross-protocol risk for wallet ${sampleWallet} across Aave and Morpho under conservative policy`,
        policyThreshold: 75,
        candidateAction: 'transfer',
        dryRun: true,
      }

      const result = await runAgentLoop(config)

      expect(result.success).toBe(true)
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.passedPolicy).toBe(result.score >= 75)
    })
  })
})
