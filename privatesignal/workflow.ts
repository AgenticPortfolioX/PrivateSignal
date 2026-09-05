/**
 * PrivateSignal CRE Workflow
 *
 * ============================================================================
 * TRIGGER ARCHITECTURE (single, truthful trigger):
 * - PRIMARY (AND ONLY) TRIGGER:
 *   HTTP On-Demand Capability (`HTTPCapability`), registered through the SDK's
 *   confidential surface `handlerInTee` with an explicit Nitro TEE constraint.
 *   Agents and the PrivateSignal API submit a validated QueryParams payload and
 *   immediately receive a scored verdict. The handler runs on `TeeRuntime` and
 *   loads its model weights / thresholds / profiles from CRE DON secrets
 *   (`runtime.getSecret`) — never from compiled-in constants.
 *
 * - REMOVED: the Cron "monitoring" trigger. Its prior implementation scored a
 *   hardcoded fabricated wallet and prepared calldata it never sent. Until a real
 *   monitored-account configuration and an EVM write path exist, there is no
 *   truthful scheduled path, so no Cron handler is registered.
 * ============================================================================
 */

import {
  HTTPCapability,
  handlerInTee,
  type TeeRuntime,
  type HTTPPayload,
  type TeeConstraint,
} from '@chainlink/cre-sdk'
import { z } from 'zod'
import {
  scoreCrossProtocolRisk,
  loadSecretsFromProvider,
} from '../src/handlers/confidentialScorer'
import type { QueryParams, ScoreOutput } from '../src/types/scorer'

// ── Configuration Schema ──────────────────────────────────────────────────
// The DON config no longer models the legacy signal feed (schedule,
// signalApiUrl, chainSelector, receiverContract, ...). It carries only what the
// HTTP trigger needs; confidential model parameters live in secrets, not config.
export const configSchema = z.object({
  authorizedKeys: z.array(z.any()).optional(),
})

export type Config = z.infer<typeof configSchema>

// ── Confidential execution constraint ──────────────────────────────────────
// Runs the registered handler inside an AWS Nitro enclave in us-west-2. Only
// this TEE family/region is supported by the SDK (NITRO_REGIONS).
export const TEE_CONSTRAINT: TeeConstraint = [{ tee: 'nitro', regions: ['us-west-2'] }]

// ── HTTP Boundary Validation (zod, QuickJS-safe) ──────────────────────────
// Validates every field before it reaches the confidential scorer. Caller-
// supplied queryId/timestamp/protocols/policyProfileId are now schema-checked
// (was: JSON.parse + field-presence only).

const positionEntrySchema = z.object({
  token: z.object({
    symbol: z.string(),
    decimals: z.number(),
  }),
  amount: z.string(),
  valueUSD: z.number(),
})

const protocolPositionSchema = z.object({
  protocol: z.string(),
  collateral: z.array(positionEntrySchema),
  debt: z.array(positionEntrySchema),
})

const normalizedGraphDataSchema = z.object({
  positions: z.array(protocolPositionSchema),
  healthFactor: z.number().optional(),
  totalCollateralUSD: z.number().optional(),
  totalDebtUSD: z.number().optional(),
  correlatedCollateralUSD: z.number().optional(),
  crossProtocolFeatures: z.unknown().optional(),
  dataComplete: z.boolean().optional(),
})

export const queryParamsSchema = z.object({
  walletAddress: z.string().min(1),
  protocols: z.array(z.string()).min(1),
  policyProfileId: z.enum([
    'conservative',
    'balanced',
    'aggressive',
    'conservative-v1',
    'balanced-v1',
    'aggressive-v1',
  ]),
  queryId: z.string().min(1),
  timestamp: z.number(),
  graphData: normalizedGraphDataSchema,
})

// ── PRIMARY TRIGGER: On-Demand HTTP Evaluation (runs inside the TEE) ──────

/**
 * Confidential HTTP evaluation handler. Runs on `TeeRuntime`:
 * - loads model weights / thresholds / policy profiles from DON secrets, then
 * - executes the fail-closed scorer, returning ONLY the public ScoreOutput.
 *
 * No outbound calls occur inside the handler; all external data (Graph results)
 * arrives as input parameters in the HTTP payload.
 */
export const onHttpTrigger = async (
  runtime: TeeRuntime<Config>,
  payload: HTTPPayload,
): Promise<string> => {
  const now = runtime.now()
  runtime.log(`[PrivateSignal] [HTTP/TEE] Evaluation requested at DON time: ${now.toISOString()}`)

  let rawInput: string
  try {
    rawInput = payload.input ? new TextDecoder().decode(payload.input) : ''
  } catch {
    throw new Error('INVALID_HTTP_PAYLOAD: HTTP input bytes could not be decoded')
  }

  // Boundary validation: strict zod parse, fail closed on any malformed field.
  let queryParams: QueryParams
  try {
    const parsed = queryParamsSchema.parse(JSON.parse(rawInput))
    queryParams = parsed as QueryParams
  } catch (err) {
    const reason =
      err instanceof z.ZodError
        ? `schema validation failed at '${err.issues[0]?.path?.join('.') ?? 'unknown'}'`
        : 'expected a JSON object'
    runtime.log(`[PrivateSignal] HTTP payload rejected: ${reason}`)
    throw new Error(`INVALID_HTTP_PAYLOAD: ${reason}`)
  }

  // Confidential config comes from the runtime secrets provider (Vault in a real
  // DON; secrets.yaml + .env in local simulation). Fails closed if missing.
  const secrets = loadSecretsFromProvider(runtime)

  // Execute the confidential scorer. Errors (e.g. GRAPH_DATA_UNAVAILABLE) are
  // returned to the caller as execution errors — never as a fabricated score.
  const scoreOutput: ScoreOutput = await scoreCrossProtocolRisk(queryParams, secrets)

  runtime.log(
    `[PrivateSignal] [HTTP/TEE] Score ${scoreOutput.score}/100 (${scoreOutput.recommendation.toUpperCase()})`,
  )

  return JSON.stringify(scoreOutput)
}

// ── Workflow Handler Registration ─────────────────────────────────────────

/**
 * Initializes the PrivateSignal workflow. Registers exactly one confidential
 * handler: HTTP on-demand evaluation executed in a Nitro TEE.
 */
export const initWorkflow = (config: Config) => {
  const http = new HTTPCapability()

  return [
    handlerInTee(
      http.trigger({ authorizedKeys: config.authorizedKeys || [] }),
      onHttpTrigger,
      TEE_CONSTRAINT,
    ),
  ]
}
