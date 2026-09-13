// Policy-gated capital release on Arc L1.
// Releases treasury USDC only when the confidential risk score clears the threshold.
// Justin Gramke

import 'dotenv/config'
import { parseEther, type Hash } from 'viem'
import {
  getArcPublicClient,
  getArcWalletClient,
  getArcBalance,
  getAgentAccount,
  arcTestnet,
} from './agentWallet'
import type { ScoreOutput } from '../types/scorer'
import { verifyAttestation } from '../utils/verifyAttestation'
import { deterministicExecutionRef } from '../utils/pureMath'

/**
 * Explicit capital action types representing real financial control functions.
 */
export type CapitalActionType =
  | 'TREASURY_FUNDING_RELEASE'
  | 'CREDIT_LINE_DRAW'
  | 'CONDITIONAL_SETTLEMENT_RELEASE'

/**
 * Candidate action model for policy-gated capital deployment.
 */
export interface CandidateAction {
  id: string
  name: string
  description: string
  type: CapitalActionType
  fromTreasury?: string
  toRecipient: string
  recipient: string // Backwards compatibility alias
  amountUSDC: number
  fundingAmount?: number // Alias for amountUSDC
  requiredScore: number
  threshold: number // Backwards compatibility alias
  policyProfileId?: string
}

/**
 * Policy profile to capital funding tier mapping.
 * Binds funding amounts and required score thresholds directly to risk profiles.
 */
export interface PolicyFundingTier {
  policyProfileId: string
  actionType: CapitalActionType
  name: string
  description: string
  requiredScore: number
  amountUSDC: number
}

export const POLICY_FUNDING_TIERS: Record<string, PolicyFundingTier> = {
  conservative: {
    policyProfileId: 'conservative',
    actionType: 'TREASURY_FUNDING_RELEASE',
    name: 'Conservative Treasury Funding Release',
    description: 'Releases treasury capital to counterparty clearing conservative risk policy',
    requiredScore: 65,
    amountUSDC: 0.20,
  },
  balanced: {
    policyProfileId: 'balanced',
    actionType: 'CREDIT_LINE_DRAW',
    name: 'Balanced Credit Line Draw',
    description: 'Authorizes credit line draw release under balanced risk policy',
    requiredScore: 65,
    amountUSDC: 0.50,
  },
  aggressive: {
    policyProfileId: 'aggressive',
    actionType: 'CONDITIONAL_SETTLEMENT_RELEASE',
    name: 'High-Conviction Conditional Settlement Release',
    description: 'Releases settlement capital under high-conviction risk policy',
    requiredScore: 80,
    amountUSDC: 1.00,
  },
}

/**
 * Standard candidate capital release actions for demo and production gating.
 */
export const STANDARD_CANDIDATE_ACTIONS: Record<string, CandidateAction> = {
  treasury_funding_release: {
    id: 'act_treasury_funding_01',
    name: 'Conservative Treasury Funding Release',
    description: 'Treasury capital release to counterparty clearing conservative policy',
    type: 'TREASURY_FUNDING_RELEASE',
    requiredScore: 65,
    threshold: 65,
    amountUSDC: 0.20,
    fundingAmount: 0.20,
    toRecipient: '0x3333333333333333333333333333333333333333',
    recipient: '0x3333333333333333333333333333333333333333',
    policyProfileId: 'conservative',
  },
  credit_line_draw: {
    id: 'act_credit_line_draw_02',
    name: 'Balanced Credit Line Draw',
    description: 'Credit line draw authorized under balanced risk policy',
    type: 'CREDIT_LINE_DRAW',
    requiredScore: 65,
    threshold: 65,
    amountUSDC: 0.50,
    fundingAmount: 0.50,
    toRecipient: '0x3333333333333333333333333333333333333333',
    recipient: '0x3333333333333333333333333333333333333333',
    policyProfileId: 'balanced',
  },
  conditional_settlement_release: {
    id: 'act_conditional_settlement_03',
    name: 'Conditional Settlement Release',
    description: 'Settlement capital release under high-conviction risk policy',
    type: 'CONDITIONAL_SETTLEMENT_RELEASE',
    requiredScore: 80,
    threshold: 80,
    amountUSDC: 0.50,
    fundingAmount: 0.50,
    toRecipient: '0x4444444444444444444444444444444444444444',
    recipient: '0x4444444444444444444444444444444444444444',
    policyProfileId: 'aggressive',
  },
  // Aliases for backwards compatibility with existing suites
  safe_allocation: {
    id: 'act_treasury_funding_01',
    name: 'Conservative Treasury Funding Release',
    description: 'Treasury capital release to counterparty clearing conservative policy',
    type: 'TREASURY_FUNDING_RELEASE',
    requiredScore: 65,
    threshold: 65,
    amountUSDC: 0.20,
    fundingAmount: 0.20,
    toRecipient: '0x3333333333333333333333333333333333333333',
    recipient: '0x3333333333333333333333333333333333333333',
    policyProfileId: 'conservative',
  },
  yield_strategy: {
    id: 'act_conditional_settlement_03',
    name: 'Conditional Settlement Release',
    description: 'Settlement capital release under high-conviction risk policy',
    type: 'CONDITIONAL_SETTLEMENT_RELEASE',
    requiredScore: 80,
    threshold: 80,
    amountUSDC: 0.50,
    fundingAmount: 0.50,
    toRecipient: '0x4444444444444444444444444444444444444444',
    recipient: '0x4444444444444444444444444444444444444444',
    policyProfileId: 'aggressive',
  },
}

export interface GatedActionResult {
  actionId: string
  actionName: string
  actionType: CapitalActionType
  type: CapitalActionType // Alias
  fromTreasury: string
  toRecipient: string
  recipient: string // Alias
  destination: string // Backwards compatibility alias
  score: number
  actualScore: number // Alias
  threshold: number
  requiredScore: number // Alias
  amountUSDC: number
  fundingAmount: number // Alias
  policyProfileId?: string
  passed: boolean
  status: 'FUNDING_RELEASED' | 'FUNDING_BLOCKED'
  transactionHash?: Hash
  blockedReason?: string
  reason?: string // Alias
  receiptMessage: string
  reasonCodes?: string[]
  dryRun?: boolean
  timestamp: number
}

/**
 * Factory to construct a typed capital release action with explicit roles and policy binding.
 */
export function createCapitalReleaseAction(params: {
  type?: CapitalActionType
  name?: string
  description?: string
  amountUSDC?: number
  requiredScore?: number
  policyProfileId?: string
  fromTreasury?: string
  toRecipient: string
}): CandidateAction {
  const type = params.type || 'TREASURY_FUNDING_RELEASE'
  const profileId = params.policyProfileId || 'conservative'
  const tier = POLICY_FUNDING_TIERS[profileId] || POLICY_FUNDING_TIERS.conservative

  const requiredScore = params.requiredScore ?? tier.requiredScore
  const amountUSDC = params.amountUSDC ?? tier.amountUSDC
  const name =
    params.name ??
    (type === 'TREASURY_FUNDING_RELEASE'
      ? 'Treasury Funding Release'
      : type === 'CREDIT_LINE_DRAW'
      ? 'Credit Line Draw'
      : 'Conditional Settlement Release')

  return {
    id: `act_${type.toLowerCase()}_${Date.now()}`,
    name,
    description: params.description ?? `${name} under ${profileId} risk policy`,
    type,
    fromTreasury: params.fromTreasury,
    toRecipient: params.toRecipient,
    recipient: params.toRecipient,
    amountUSDC,
    fundingAmount: amountUSDC,
    requiredScore,
    threshold: requiredScore,
    policyProfileId: profileId,
  }
}

/**
 * Evaluates risk score against candidate action policy threshold and conditionally
 * releases treasury capital (native USDC) on Arc testnet.
 */
export async function executeScoreGatedAction(
  action: CandidateAction,
  scorePayload: ScoreOutput,
  options: { dryRun?: boolean } = {},
): Promise<GatedActionResult> {
  if (
    !scorePayload ||
    typeof scorePayload.score !== 'number' ||
    !scorePayload.attestation ||
    !scorePayload.walletAddress
  ) {
    throw new Error(
      'GATE_ERROR: executeScoreGatedAction requires a complete ScoreOutput payload with attestation and walletAddress',
    )
  }

  // Cryptographically (or deterministically) bind the score payload to its attestation
  const expectedHash = deterministicExecutionRef(
    `${scorePayload.queryId}:${scorePayload.walletAddress}:${scorePayload.score}:${scorePayload.recommendation}:${scorePayload.timestamp}`,
  )

  // Locally verify attestation (this prevents forged payloads from passing)
  const attestationSummary = verifyAttestation(scorePayload.attestation, expectedHash, true)
  if (!attestationSummary.valid) {
    throw new Error(`GATE_ERROR: Invalid attestation. Action aborted. Status: ${attestationSummary.status}`)
  }

  const score = scorePayload.score
  const threshold = action.requiredScore ?? action.threshold
  const actionType: CapitalActionType = action.type || 'TREASURY_FUNDING_RELEASE'
  const recipient = action.toRecipient || action.recipient || scorePayload.walletAddress
  const now = Math.floor(Date.now() / 1000)

  // Resolve treasury wallet address
  let treasuryAddress: string
  try {
    const account = getAgentAccount()
    treasuryAddress = action.fromTreasury || account.address
  } catch {
    treasuryAddress = action.fromTreasury || process.env.ARC_AGENT_WALLET_ADDRESS || '0x748ABdeF0775132E8F941e1513152D5eb02D3a4B'
  }

  // 1. HARD POLICY GATE EVALUATION (DENY PATH)
  if (score < threshold) {
    const blockedReason = `FUNDING_BLOCKED: Confidential score (${score}) is below required treasury risk threshold (${threshold}) for ${action.name} [${actionType}]. Action aborted.`
    console.log(`[POLICY_GATE_REJECTED] ${blockedReason}`)

    return {
      actionId: action.id,
      actionName: action.name,
      actionType,
      type: actionType,
      fromTreasury: treasuryAddress,
      toRecipient: recipient,
      recipient,
      destination: recipient,
      score,
      actualScore: score,
      threshold,
      requiredScore: threshold,
      amountUSDC: action.amountUSDC,
      fundingAmount: action.amountUSDC,
      policyProfileId: action.policyProfileId,
      passed: false,
      status: 'FUNDING_BLOCKED',
      blockedReason,
      reason: blockedReason,
      receiptMessage: `Funding blocked: confidential score below treasury risk threshold (${score} < ${threshold})`,
      reasonCodes: scorePayload.reasonCodes,
      timestamp: now,
    }
  }

  // 2. Score passes threshold -> CAPITAL RELEASE PATH
  console.log(
    `[POLICY_GATE_PERMITTED] [${actionType}] Score (${score}) satisfies threshold (${threshold}). Releasing treasury funding of ${action.amountUSDC} USDC from ${treasuryAddress} to recipient ${recipient}...`,
  )

  const receiptMessage = `Funding released: recipient cleared ${action.policyProfileId || 'treasury'} risk policy (${score} >= ${threshold})`

  if (options.dryRun) {
    return {
      actionId: action.id,
      actionName: action.name,
      actionType,
      type: actionType,
      fromTreasury: treasuryAddress,
      toRecipient: recipient,
      recipient,
      destination: recipient,
      score,
      actualScore: score,
      threshold,
      requiredScore: threshold,
      amountUSDC: action.amountUSDC,
      fundingAmount: action.amountUSDC,
      policyProfileId: action.policyProfileId,
      passed: true,
      status: 'FUNDING_RELEASED',
      dryRun: true,
      receiptMessage,
      reasonCodes: scorePayload.reasonCodes,
      timestamp: now,
    }
  }

  const publicClient = getArcPublicClient()
  const walletClient = getArcWalletClient()
  const account = getAgentAccount()

  // Verify treasury wallet has sufficient USDC balance
  const { balanceUSDC } = await getArcBalance(account.address)
  if (balanceUSDC < action.amountUSDC) {
    throw new Error(
      `INSUFFICIENT_ARC_BALANCE: Treasury balance (${balanceUSDC} USDC) cannot execute funding amount (${action.amountUSDC} USDC)`,
    )
  }

  // Release native USDC funding transaction on Arc L1
  const valueWei = parseEther(action.amountUSDC.toString())
  const txHash = await walletClient.sendTransaction({
    chain: arcTestnet,
    account,
    to: recipient as `0x${string}`,
    value: valueWei,
  })

  // Wait for 1 confirmation
  await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  })

  return {
    actionId: action.id,
    actionName: action.name,
    actionType,
    type: actionType,
    fromTreasury: account.address,
    toRecipient: recipient,
    recipient,
    destination: recipient,
    score,
    actualScore: score,
    threshold,
    requiredScore: threshold,
    amountUSDC: action.amountUSDC,
    fundingAmount: action.amountUSDC,
    policyProfileId: action.policyProfileId,
    passed: true,
    status: 'FUNDING_RELEASED',
    transactionHash: txHash,
    receiptMessage,
    reasonCodes: scorePayload.reasonCodes,
    timestamp: now,
  }
}
