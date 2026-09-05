/**
 * PrivateSignal CRE Workflow
 *
 * ============================================================================
 * TRIGGER ARCHITECTURE SPECIFICATION:
 * - PRIMARY TRIGGER (PRODUCT PATH):
 *   HTTP On-Demand Capability (`HTTPCapability`)
 *   Allows autonomous agents and the PrivateSignal API to submit real-time
 *   risk score queries and immediately receive an attested verdict without
 *   waiting for a scheduled cron tick.
 *
 * - SECONDARY TRIGGER (MONITORING PATH):
 *   Scheduled Cron Capability (`CronCapability`)
 *   Runs periodic background health monitoring on watched protocol portfolios.
 *
 * - UNIFIED CONFIDENTIAL TEE CORE:
 *   Both triggers route directly into `executeConfidentialScoringWorkflow`,
 *   which executes inside the TEE enclave with sealed Vault DON secrets.
 *   Zero parallel or un-attested public scoring routes exist.
 * ============================================================================
 */

import {
  HTTPCapability,
  CronCapability,
  HTTPClient,
  EVMClient,
  handler,
  consensusMedianAggregation,
  type Runtime,
  type HTTPPayload,
  type CronPayload,
} from '@chainlink/cre-sdk'
import {
  parseAbi,
  encodeFunctionData,
  stringToHex,
  pad,
  type Hex,
} from 'viem'
import { z } from 'zod'
import { scoreCrossProtocolRisk } from '../src/handlers/confidentialScorer'
import { getDefaultSecretsForStyle } from '../src/config/policyConfig'
import type { QueryParams, Secrets, ScoreOutput } from '../src/types/scorer'

// ── Configuration Schema ──────────────────────────────────────────────────

export const configSchema = z.object({
  schedule: z.string(),
  signalApiUrl: z.string(),
  signalId: z.string(),
  confidenceThresholdBps: z.number().int().min(0).max(10000),
  chainSelector: z.string(),
  receiverContract: z.string(),
  authorizedKeys: z.array(z.any()).optional(),
})

export type Config = z.infer<typeof configSchema>

// ── ABI Definitions ───────────────────────────────────────────────────────

export const receiverAbi = parseAbi([
  'function onSignalUpdate(bytes32 signalId, uint256 timestamp, int256 signalValue, uint256 confidenceBps, bytes calldata metadata)',
])

// ── QuickJS-Safe Encoding Helpers (No Node Buffer, No window.btoa) ─────────

export function safeBase64Encode(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let result = ''
  const bytes = new TextEncoder().encode(str)
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i]
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0
    result += chars[b1 >> 2] + chars[((b1 & 3) << 4) | (b2 >> 4)]
    result += i + 1 < bytes.length ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '='
    result += i + 2 < bytes.length ? chars[b3 & 63] : '='
  }
  return result
}

export function safeBase64Decode(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = str.replace(/=+$/, '')
  const bytes: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const c1 = chars.indexOf(clean[i])
    const c2 = chars.indexOf(clean[i + 1])
    const c3 = i + 2 < clean.length ? chars.indexOf(clean[i + 2]) : 0
    const c4 = i + 3 < clean.length ? chars.indexOf(clean[i + 3]) : 0
    bytes.push((c1 << 2) | (c2 >> 4))
    if (i + 2 < clean.length) bytes.push(((c2 & 15) << 4) | (c3 >> 2))
    if (i + 3 < clean.length) bytes.push(((c3 & 3) << 6) | c4)
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

// ── Signal Response Interfaces ───────────────────────────────────────────

export interface SignalPayload {
  signalId: string
  value: number
  confidenceBps: number
  timestamp?: number
}

// ── Shared Confidential TEE Risk Scorer Handler ──────────────────────────

/**
 * Executes confidential cross-protocol risk evaluation inside the TEE enclave.
 * Invoked identically by both the on-demand HTTP trigger and the scheduled Cron trigger.
 */
export async function executeConfidentialScoringWorkflow(
  params: QueryParams,
  secretsOverride?: Secrets,
): Promise<ScoreOutput> {
  const style =
    params.policyProfileId === 'conservative' || params.policyProfileId === 'aggressive'
      ? params.policyProfileId
      : 'balanced'

  const activeSecrets = secretsOverride || getDefaultSecretsForStyle(style)
  return scoreCrossProtocolRisk(params, activeSecrets)
}

// ── PRIMARY TRIGGER: On-Demand HTTP Evaluation ────────────────────────────

/**
 * PRIMARY TRIGGER HANDLER: Real-time On-Demand HTTP Evaluation
 *
 * Provides immediate confidential risk evaluation for autonomous on-chain agents
 * and the API server without waiting for a scheduled cron tick.
 */
export const onHttpTrigger = async (
  runtime: Runtime<Config>,
  payload: HTTPPayload,
): Promise<string> => {
  const now = runtime.now()
  runtime.log(`[PrivateSignal] [PRIMARY:HTTP] Interactive evaluation requested at DON time: ${now}`)

  let queryParams: QueryParams
  try {
    const rawInput = payload.input ? new TextDecoder().decode(payload.input) : '{}'
    queryParams = JSON.parse(rawInput)
  } catch (err: any) {
    runtime.log(`[PrivateSignal] HTTP trigger input parse error: ${err.message || err}`)
    throw new Error('INVALID_HTTP_PAYLOAD: Expected valid JSON QueryParams payload')
  }

  // Execute inside the confidential TEE enclave
  const scoreOutput = await executeConfidentialScoringWorkflow(queryParams)
  runtime.log(
    `[PrivateSignal] [PRIMARY:HTTP] Evaluated score: ${scoreOutput.score}/100 (${scoreOutput.recommendation.toUpperCase()}), DON: ${scoreOutput.attestation.donId}`,
  )

  return JSON.stringify(scoreOutput)
}

// ── SECONDARY TRIGGER: Scheduled Cron Background Monitoring ───────────────

/**
 * SECONDARY TRIGGER HANDLER: Scheduled Cron Background Monitoring
 *
 * Periodically monitors watched protocol portfolios and health metrics.
 * Routes into the exact same confidential scoring handler (zero separate public path).
 */
export const onCronTrigger = async (
  runtime: Runtime<Config>,
  _payload: CronPayload,
): Promise<string> => {
  const config = runtime.config
  const now = runtime.now()
  runtime.log(`[PrivateSignal] [SECONDARY:CRON] Periodic monitoring tick at DON time: ${now}`)
  runtime.log(`[PrivateSignal] Monitoring signal: ${config.signalId}`)

  // Evaluate baseline monitoring state through the same confidential TEE scorer
  const monitoringParams: QueryParams = {
    walletAddress: '0x1111111111111111111111111111111111111111',
    protocols: ['aave-v3', 'morpho'],
    policyProfileId: 'conservative',
    queryId: `cron_${config.signalId}_${Math.floor(now.getTime() / 1000)}`,
    timestamp: Math.floor(now.getTime() / 1000),
    graphData: {
      positions: [],
      healthFactor: 3.5,
      totalCollateralUSD: 50000,
      totalDebtUSD: 10000,
    },
  }

  const scoreOutput = await executeConfidentialScoringWorkflow(monitoringParams)
  const evaluatedValueScaled = BigInt(scoreOutput.score * 1e8)
  const currentConfidenceBps = BigInt(config.confidenceThresholdBps)

  // Format calldata for on-chain consumer
  const signalIdHex = pad(stringToHex(config.signalId), { size: 32, dir: 'right' }) as Hex
  const unixSeconds = BigInt(Math.floor(now.getTime() / 1000))
  const metadataHex = stringToHex(
    JSON.stringify({
      donTimestamp: unixSeconds.toString(),
      source: 'cre-don-privatesignal',
      executionHash: scoreOutput.attestation.executionHash,
    }),
  ) as Hex

  const callData = encodeFunctionData({
    abi: receiverAbi,
    functionName: 'onSignalUpdate',
    args: [
      signalIdHex,
      unixSeconds,
      evaluatedValueScaled,
      currentConfidenceBps,
      metadataHex,
    ],
  })

  runtime.log(`[PrivateSignal] [SECONDARY:CRON] Calldata prepared: ${callData.slice(0, 42)}...`)

  return JSON.stringify({
    status: 'SUCCESS',
    trigger: 'CRON_SECONDARY_MONITOR',
    signalId: config.signalId,
    attestedScore: scoreOutput.score,
    recommendation: scoreOutput.recommendation,
    scaledValue: evaluatedValueScaled.toString(),
    confidenceBps: config.confidenceThresholdBps,
    donTimestamp: now,
    targetContract: config.receiverContract,
  })
}

// ── Workflow Handler Registration ────────────────────────────────────────

/**
 * Initializes PrivateSignal workflow capabilities:
 * 1. HTTPCapability  -> onHttpTrigger  (PRIMARY: Real-time agent & API queries)
 * 2. CronCapability  -> onCronTrigger  (SECONDARY: Background monitoring)
 *
 * Both triggers route into the identical confidential TEE scorer.
 */
export const initWorkflow = (config: Config) => {
  const http = new HTTPCapability()
  const cron = new CronCapability()

  return [
    // PRIMARY PATH: HTTP On-Demand Evaluation
    handler(
      http.trigger({ authorizedKeys: config.authorizedKeys || [] }),
      onHttpTrigger,
    ),
    // SECONDARY PATH: Scheduled Periodic Monitoring
    handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger,
    ),
  ]
}
