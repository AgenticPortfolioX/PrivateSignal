/**
 * PrivateSignal — Arc Agent Loop Controller
 *
 * ============================================================================
 * AUTONOMOUS AGENT SPECIFICATION:
 * Complete closed-loop agent cycle:
 * 1. Verifies native USDC gas balance on Arc testnet (Circle L1).
 * 2. Pays native USDC fee for the score request.
 * 3. Submits risk evaluation (natural language or structured query) to the
 *    Chainlink CRE confidential core.
 * 4. Validates cryptographic attestation proof.
 * 5. Applies local policy threshold to the attested verdict.
 * 6. Executes score-gated action on Arc if threshold passes, or aborts if below.
 * 7. Returns end-to-end audit telemetry.
 * ============================================================================
 */

import 'dotenv/config'
import {
  getArcBalance,
  payForScore,
  type PaymentReceipt,
  DEFAULT_QUERY_FEE_USDC,
} from './agentWallet'
import {
  executeScoreGatedAction,
  STANDARD_CANDIDATE_ACTIONS,
  type CandidateAction,
  type GatedActionResult,
} from './gatedAction'
import { routeToGraphQueryPlan } from '../graph/nlRouter'
import { aggregateLiveGraphData } from '../graph/aggregator'
import { scoreCrossProtocolRisk } from '../handlers/confidentialScorer'
import { getDefaultSecretsForStyle } from '../config/policyConfig'
import { verifyAttestation, type AttestationSummary } from '../utils/verifyAttestation'
import type { ScoreOutput } from '../types/scorer'

export interface AgentConfig {
  walletAddress: string
  policyThreshold: number
  candidateAction: 'allocate' | 'transfer' | 'none'
  actionAmountUSDC?: number
  actionDestination?: string
  queryString?: string
  protocols?: string[]
  policyProfileId?: string
  maxRetries?: number
  dryRun?: boolean
}

export interface AgentLoopStep {
  name: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'
  details: string
  durationMs: number
}

export interface AgentResult {
  agentAddress: string
  targetWallet: string
  queryId: string
  score: number
  recommendation: string
  threshold: number
  passedPolicy: boolean
  feePayment?: PaymentReceipt
  gatedAction?: GatedActionResult
  attestationSummary: AttestationSummary
  steps: AgentLoopStep[]
  success: boolean
  totalDurationMs: number
  timestamp: number
}

/**
 * Runs the complete autonomous Arc agent loop
 */
export async function runAgentLoop(config: AgentConfig): Promise<AgentResult> {
  const startTime = Date.now()
  const steps: AgentLoopStep[] = []

  const recordStep = (
    name: string,
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED',
    details: string,
    durationMs: number,
  ) => {
    steps.push({ name, status, details, durationMs })
    console.log(`[AGENT_STEP] [${status}] ${name} (${durationMs}ms) — ${details}`)
  }

  try {
    // -------------------------------------------------------------
    // STEP 1: Verify Arc Native USDC Balance
    // -------------------------------------------------------------
    const s1Start = Date.now()
    const balanceInfo = await getArcBalance()
    const requiredMinimum = DEFAULT_QUERY_FEE_USDC + (config.actionAmountUSDC || 0.1)

    if (balanceInfo.balanceUSDC < requiredMinimum && !config.dryRun) {
      throw new Error(
        `INSUFFICIENT_ARC_BALANCE: Current balance (${balanceInfo.balanceUSDC} USDC) < minimum required (${requiredMinimum} USDC)`,
      )
    }
    recordStep(
      'CHECK_ARC_BALANCE',
      'SUCCESS',
      `Verified native USDC balance: ${balanceInfo.balanceUSDC} USDC on Arc Testnet`,
      Date.now() - s1Start,
    )

    // -------------------------------------------------------------
    // STEP 2: Submit Fee Payment on Arc Testnet
    // -------------------------------------------------------------
    const s2Start = Date.now()
    let feeReceipt: PaymentReceipt
    if (config.dryRun) {
      feeReceipt = {
        txHash: '0xSIMULATED_FEE_RECEIPT_DRY_RUN' as `0x${string}`,
        amountUSDC: DEFAULT_QUERY_FEE_USDC,
        payer: balanceInfo.address,
        recipient: '0x748ABdeF0775132E8F941e1513152D5eb02D3a4B',
        blockNumber: '0',
        gasUsed: '0',
        status: 'SUCCESS',
        timestamp: Math.floor(Date.now() / 1000),
      }
    } else {
      feeReceipt = await payForScore(DEFAULT_QUERY_FEE_USDC)
    }
    recordStep(
      'PAY_USDC_FEE',
      'SUCCESS',
      `Sent ${feeReceipt.amountUSDC} native USDC fee on Arc (tx: ${feeReceipt.txHash.slice(0, 16)}...)`,
      Date.now() - s2Start,
    )

    // -------------------------------------------------------------
    // STEP 3: Route Query & Aggregate Graph Positions
    // -------------------------------------------------------------
    const s3Start = Date.now()
    const queryInput =
      config.queryString || {
        walletAddress: config.walletAddress,
        protocols: config.protocols || ['aave-v3', 'morpho'],
        policyProfileId: config.policyProfileId || 'conservative',
      }

    const plan = routeToGraphQueryPlan(queryInput)
    const graphData = await aggregateLiveGraphData(plan.walletAddress, plan.protocols)
    recordStep(
      'FETCH_GRAPH_DATA',
      'SUCCESS',
      `Aggregated positions across ${plan.protocols.join(', ')} (total collateral: $${graphData.features.combinedCollateralValue})`,
      Date.now() - s3Start,
    )

    // -------------------------------------------------------------
    // STEP 4: Execute Confidential TEE Scorer & Verify Attestation
    // -------------------------------------------------------------
    const s4Start = Date.now()
    const queryId = `arc_agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const style =
      plan.policyProfileId === 'conservative' || plan.policyProfileId === 'aggressive'
        ? plan.policyProfileId
        : 'balanced'
    const secrets = getDefaultSecretsForStyle(style)

    const scoreOutput: ScoreOutput = await scoreCrossProtocolRisk(
      {
        walletAddress: plan.walletAddress,
        protocols: plan.protocols,
        policyProfileId: plan.policyProfileId,
        queryId,
        timestamp: Math.floor(Date.now() / 1000),
        graphData: graphData.normalizedGraphData,
      },
      secrets,
    )

    const attestationSummary = verifyAttestation(scoreOutput.attestation, undefined, true)
    if (!attestationSummary.valid) {
      throw new Error(`ATTESTATION_FAILED: Cryptographic enclave proof failed verification`)
    }

    recordStep(
      'CONFIDENTIAL_TEE_SCORING',
      'SUCCESS',
      `Attested score: ${scoreOutput.score}/100 (${scoreOutput.recommendation.toUpperCase()}), DON: ${attestationSummary.donId}`,
      Date.now() - s4Start,
    )

    // -------------------------------------------------------------
    // STEP 5: Policy Gating & Candidate Action Execution
    // -------------------------------------------------------------
    const s5Start = Date.now()
    let gatedActionResult: GatedActionResult | undefined

    if (config.candidateAction !== 'none') {
      const candidate: CandidateAction =
        config.candidateAction === 'allocate'
          ? STANDARD_CANDIDATE_ACTIONS.safe_allocation
          : {
              id: 'custom_agent_action',
              name: 'Custom Agent Transfer',
              description: 'Score-gated native USDC transfer on Arc',
              threshold: config.policyThreshold,
              amountUSDC: config.actionAmountUSDC || 0.10,
              recipient: config.actionDestination || '0x3333333333333333333333333333333333333333',
            }

      gatedActionResult = await executeScoreGatedAction(candidate, scoreOutput, {
        dryRun: config.dryRun,
      })

      const stepStatus = gatedActionResult.passed ? 'SUCCESS' : 'FAILED'
      recordStep(
        'POLICY_GATE_EVALUATION',
        stepStatus,
        gatedActionResult.passed
          ? `Score ${scoreOutput.score} >= ${candidate.threshold}: Executed ${candidate.name} on Arc (tx: ${gatedActionResult.transactionHash})`
          : `Score ${scoreOutput.score} < ${candidate.threshold}: Aborted action (${gatedActionResult.blockedReason})`,
        Date.now() - s5Start,
      )
    } else {
      recordStep('POLICY_GATE_EVALUATION', 'SKIPPED', 'No candidate action configured', 0)
    }

    return {
      agentAddress: balanceInfo.address,
      targetWallet: plan.walletAddress,
      queryId,
      score: scoreOutput.score,
      recommendation: scoreOutput.recommendation,
      threshold: config.policyThreshold,
      passedPolicy: scoreOutput.score >= config.policyThreshold,
      feePayment: feeReceipt,
      gatedAction: gatedActionResult,
      attestationSummary,
      steps,
      success: true,
      totalDurationMs: Date.now() - startTime,
      timestamp: Math.floor(Date.now() / 1000),
    }
  } catch (error: any) {
    recordStep('AGENT_LOOP_ERROR', 'FAILED', error.message || String(error), Date.now() - startTime)
    throw error
  }
}
