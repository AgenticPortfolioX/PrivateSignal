/**
 * @title PrivateSignal Arc Agent Loop
 * @author Justin Gramke
 * @notice Orchestrates the closed-loop agent cycle including evaluation, and score-gated execution.
 */

import 'dotenv/config'
import {
  getArcBalance,
  getAgentAccount,
} from './agentWallet'
import {
  executeScoreGatedAction,
  STANDARD_CANDIDATE_ACTIONS,
  type CandidateAction,
  type GatedActionResult,
} from './gatedAction'
import { routeToGraphQueryPlan } from '../graph/nlRouter'
import { aggregateLiveGraphData } from '../graph/aggregator'
import { invokeCreWorkflow } from '../handlers/creInvoker'
import { getDefaultSecretsForStyle } from '../config/policyConfig'
import { verifyAttestation, type AttestationSummary } from '../utils/verifyAttestation'
import type { ScoreOutput } from '../types/scorer'

export interface AgentConfig {
  walletAddress: string
  policyThreshold: number
  candidateAction:
    | 'treasury_release'
    | 'credit_draw'
    | 'settlement_release'
    | 'allocate'
    | 'transfer'
    | 'none'
  actionType?: 'TREASURY_FUNDING_RELEASE' | 'CREDIT_LINE_DRAW' | 'CONDITIONAL_SETTLEMENT_RELEASE'
  actionAmountUSDC?: number
  actionDestination?: string
  recipientAddress?: string
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

  const c = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
  }

  const recordStep = (
    name: string,
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED',
    details: string,
    durationMs: number,
  ) => {
    steps.push({ name, status, details, durationMs })
    
    let displayStatus = status === 'FAILED' ? `${c.red}[BLOCKED]${c.reset}` : `[${status}]`
    if (status === 'SUCCESS') displayStatus = `${c.green}[SUCCESS]${c.reset}`

    let displayDetails = details
    
    // Custom replacements requested by user
    if (displayDetails.includes('Attested score: 100/100 (SAFE)')) {
      displayDetails = displayDetails.replace('Attested score: 100/100 (SAFE)', `${c.green}Attested score: 100/100 (SAFE)${c.reset}`)
    }
    
    if (displayDetails.includes('Attested score: 55/100 (HIGH_RISK)') || displayDetails.includes('Attested score: 55/100')) {
      displayDetails = displayDetails.replace(/Attested score: 55\/100.*/, `${c.red}Attested score: 55/100 (UNSAFE)${c.reset}`)
    }

    if (displayDetails.includes('FUNDING_BLOCKED')) {
      // Colorize ONLY specific substrings requested by user
      displayDetails = displayDetails.replace(/\[FUNDING_BLOCKED\]/g, `${c.red}[FUNDING_BLOCKED]${c.reset}`)
      displayDetails = displayDetails.replace(/\(FUNDING_BLOCKED: Confidential score \(\d+\)/g, (match) => `${c.red}${match}${c.reset}`)
    }

    console.log(`[AGENT_STEP] ${displayStatus} ${name} (${durationMs}ms) — ${displayDetails}`)
  }

  try {

    const s1Start = Date.now()
    const balanceInfo = await getArcBalance()
    const requiredMinimum = (config.actionAmountUSDC || 0.1)

    if (balanceInfo.balanceUSDC < requiredMinimum && !config.dryRun) {
      throw new Error(
        `INSUFFICIENT_ARC_BALANCE: Current balance (${balanceInfo.balanceUSDC} USDC) < minimum required (${requiredMinimum} USDC)`,
      )
    }
    recordStep(
      'CHECK_ARC_BALANCE',
      'SUCCESS',
      `Verified Treasury native USDC balance: ${balanceInfo.balanceUSDC} USDC on Arc Testnet`,
      Date.now() - s1Start,
    )


    const s3Start = Date.now()
    const queryInput =
      config.queryString || {
        walletAddress: config.walletAddress,
        protocols: config.protocols || ['aave-v3', 'morpho'],
        policyProfileId: config.policyProfileId || 'conservative',
      }

    const plan = routeToGraphQueryPlan(queryInput)
    let graphData;
    if (plan.walletAddress.toLowerCase() === '0x2222222222222222222222222222222222222222') {
      // Mock risky data for the Deny Path Demo
      graphData = {
        normalizedGraphData: {
          positions: [],
          dataComplete: true,
          totalCollateralUSD: 0,
          totalDebtUSD: 1000,
          healthFactor: 0.8,
          correlatedCollateralUSD: 0,
          crossProtocolFeatures: {
            combinedCollateralValue: 0,
            totalDebtUSD: 1000,
            concentrationScore: 100,
            healthPressureIndex: 100,
            correlatedAssetRatio: 0,
            correlatedAssetFlags: { isEthDerivativeConcentrated: false, correlatedAssetRatio: 0 }
          }
        },
        features: { combinedCollateralValue: 0 }
      } as any;
    } else {
      graphData = await aggregateLiveGraphData(plan.walletAddress, plan.protocols)
    }
    recordStep(
      'FETCH_GRAPH_DATA',
      'SUCCESS',
      `Aggregated positions across ${plan.protocols.join(', ')} (total collateral: $${graphData.features.combinedCollateralValue})`,
      Date.now() - s3Start,
    )


    const s4Start = Date.now()
    const queryId = `arc_agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const style =
      plan.policyProfileId === 'conservative' || plan.policyProfileId === 'aggressive'
        ? plan.policyProfileId
        : 'balanced'
    const secrets = getDefaultSecretsForStyle(style)

    const scoreOutput = await invokeCreWorkflow({
      walletAddress: plan.walletAddress,
      protocols: plan.protocols,
      policyProfileId: plan.policyProfileId,
      queryId,
      timestamp: Math.floor(Date.now() / 1000),
      graphData: graphData.normalizedGraphData,
    })

    const attestationSummary = verifyAttestation(scoreOutput.attestation, undefined, true)
    if (!attestationSummary.valid) {
      throw new Error(`ATTESTATION_FAILED: Cryptographic enclave proof failed verification`)
    }

    recordStep(
      'CONFIDENTIAL_TEE_SCORING',
      'SUCCESS',
      `Attested score: ${scoreOutput.score}/100 (${scoreOutput.recommendation.toUpperCase() === 'HIGH_RISK' ? 'UNSAFE' : scoreOutput.recommendation.toUpperCase()}), DON: ${attestationSummary.donId}`,
      Date.now() - s4Start,
    )


    const s5Start = Date.now()
    let gatedActionResult: GatedActionResult | undefined

    if (config.candidateAction !== 'none') {
      let candidate: CandidateAction
      if (config.candidateAction === 'credit_draw') {
        candidate = STANDARD_CANDIDATE_ACTIONS.credit_line_draw
      } else if (config.candidateAction === 'settlement_release') {
        candidate = STANDARD_CANDIDATE_ACTIONS.conditional_settlement_release
      } else if (config.candidateAction === 'treasury_release' || config.candidateAction === 'allocate') {
        candidate = STANDARD_CANDIDATE_ACTIONS.treasury_funding_release
      } else {
        const actType = config.actionType || 'TREASURY_FUNDING_RELEASE'
        const fundingAmount = config.actionAmountUSDC || (actType === 'CREDIT_LINE_DRAW' ? 0.5 : actType === 'CONDITIONAL_SETTLEMENT_RELEASE' ? 1.0 : 0.2)
        candidate = {
          id: `act_custom_${Date.now()}`,
          name: `${actType.replace(/_/g, ' ')}`,
          description: `Score-gated ${actType.toLowerCase().replace(/_/g, ' ')} on Arc`,
          type: actType,
          fromTreasury: balanceInfo.address,
          toRecipient: config.recipientAddress || config.actionDestination || config.walletAddress,
          recipient: config.recipientAddress || config.actionDestination || config.walletAddress,
          requiredScore: config.policyThreshold,
          threshold: config.policyThreshold,
          amountUSDC: fundingAmount,
          fundingAmount,
          policyProfileId: config.policyProfileId || 'conservative',
        }
      }

      gatedActionResult = await executeScoreGatedAction(candidate, scoreOutput, {
        dryRun: config.dryRun,
      })

      const stepStatus = gatedActionResult.passed ? 'SUCCESS' : 'FAILED'
      recordStep(
        'POLICY_GATE_EVALUATION',
        stepStatus,
        gatedActionResult.passed
          ? `[FUNDING_RELEASED] [${candidate.type}] Score ${scoreOutput.score} >= ${candidate.threshold}: Released ${candidate.amountUSDC} USDC to ${candidate.toRecipient} on Arc (tx: ${gatedActionResult.transactionHash})`
          : `[FUNDING_BLOCKED] [${candidate.type}] Score ${scoreOutput.score} < ${candidate.threshold}: Preserved capital (${gatedActionResult.blockedReason})`,
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
