/**
 * @title PrivateSignal Score-Gated Action Execution
 * @author Justin Gramke
 * @notice Enforces policy threshold before executing native USDC transfers on Arc testnet.
 */

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

export interface CandidateAction {
  id: string
  name: string
  description: string
  threshold: number
  amountUSDC: number
  recipient: string
}

// Standard candidate actions for risk management demo
export const STANDARD_CANDIDATE_ACTIONS: Record<string, CandidateAction> = {
  safe_allocation: {
    id: 'act_safe_allocation_01',
    name: 'Conservative Protocol Allocation',
    description: 'Deploys capital to primary AAA lending pool on Arc',
    threshold: 65, // Requires score >= 65
    amountUSDC: 0.20,
    recipient: '0x3333333333333333333333333333333333333333',
  },
  yield_strategy: {
    id: 'act_yield_strategy_02',
    name: 'Aggressive Yield Strategy Injection',
    description: 'Supplies liquidity to leveraged cross-protocol pool',
    threshold: 80, // Requires score >= 80
    amountUSDC: 0.50,
    recipient: '0x4444444444444444444444444444444444444444',
  },
}

export interface GatedActionResult {
  actionId: string
  actionName: string
  score: number
  threshold: number
  passed: boolean
  status: 'EXECUTED_ON_ARC' | 'BLOCKED_BY_RISK_POLICY' | 'SIMULATED_DRY_RUN'
  transactionHash?: Hash
  amountUSDC: number
  destination: string
  blockedReason?: string
  timestamp: number
}

/**
 * Evaluates risk score against candidate action threshold and conditionally
 * executes native USDC transfer on Arc testnet.
 */
export async function executeScoreGatedAction(
  action: CandidateAction,
  scoreOrOutput: number | ScoreOutput,
  options: { dryRun?: boolean } = {},
): Promise<GatedActionResult> {
  const score = typeof scoreOrOutput === 'number' ? scoreOrOutput : scoreOrOutput.score
  const threshold = action.threshold
  const now = Math.floor(Date.now() / 1000)

  // 1. HARD POLICY GATE EVALUATION
  if (score < threshold) {
    const blockedReason = `BLOCKED_BY_RISK_POLICY: Attested score (${score}) is below required policy threshold (${threshold}) for ${action.name}. Action aborted.`
    console.log(`[POLICY_GATE_REJECTED] ${blockedReason}`)

    return {
      actionId: action.id,
      actionName: action.name,
      score,
      threshold,
      passed: false,
      status: 'BLOCKED_BY_RISK_POLICY',
      amountUSDC: action.amountUSDC,
      destination: action.recipient,
      blockedReason,
      timestamp: now,
    }
  }

  // 2. Score passes threshold -> Execute on Arc testnet
  console.log(
    `[POLICY_GATE_PERMITTED] Score (${score}) satisfies threshold (${threshold}). Executing native USDC transfer of ${action.amountUSDC} USDC to ${action.recipient}...`,
  )

  if (options.dryRun) {
    return {
      actionId: action.id,
      actionName: action.name,
      score,
      threshold,
      passed: true,
      status: 'SIMULATED_DRY_RUN',
      amountUSDC: action.amountUSDC,
      destination: action.recipient,
      timestamp: now,
    }
  }

  const publicClient = getArcPublicClient()
  const walletClient = getArcWalletClient()
  const account = getAgentAccount()

  // Check agent has enough balance
  const { balanceUSDC } = await getArcBalance(account.address)
  if (balanceUSDC < action.amountUSDC) {
    throw new Error(
      `INSUFFICIENT_ARC_BALANCE: Agent balance (${balanceUSDC} USDC) cannot execute action amount (${action.amountUSDC} USDC)`,
    )
  }

  // Send native USDC transaction
  const valueWei = parseEther(action.amountUSDC.toString())
  const txHash = await walletClient.sendTransaction({
    chain: arcTestnet,
    account,
    to: action.recipient as `0x${string}`,
    value: valueWei,
  })

  // Wait for confirmation
  await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  })

  return {
    actionId: action.id,
    actionName: action.name,
    score,
    threshold,
    passed: true,
    status: 'EXECUTED_ON_ARC',
    transactionHash: txHash,
    amountUSDC: action.amountUSDC,
    destination: action.recipient,
    timestamp: now,
  }
}
