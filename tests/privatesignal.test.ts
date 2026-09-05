/**
 * PrivateSignal CRE Workflow Tests
 *
 * Validates the repaired confidential DON path:
 * - minimal HTTP-only config schema (legacy signal-feed config removed),
 * - a single confidential handler registered via handlerInTee with a TEE constraint,
 * - zod boundary validation of the HTTP payload,
 * - secrets resolved through the runtime secrets provider (never compiled-in),
 * - fail-closed scoring when graph data is empty / fabricated.
 */

import { describe, it, expect } from 'bun:test'
import {
  configSchema,
  initWorkflow,
  queryParamsSchema,
  TEE_CONSTRAINT,
  onHttpTrigger,
} from '../privatesignal/workflow'
import {
  scoreCrossProtocolRisk,
  loadSecretsFromProvider,
  CONFIDENTIAL_SECRET_IDS,
} from '../src/handlers/confidentialScorer'
import {
  BALANCED_THRESHOLDS,
  DEFAULT_MODEL_WEIGHTS,
  STANDARD_POLICY_PROFILES,
  getDefaultSecretsForStyle,
} from '../src/config/policyConfig'
import type { QueryParams, Secrets } from '../src/types/scorer'
import stagingConfig from '../privatesignal/config.staging.json'
import prodConfig from '../privatesignal/config.production.json'
import localConfig from '../privatesignal/config.local.json'
import { MOCK_HEALTHY_GRAPH_DATA } from './fixtures/samplePositions'

// Runtime secrets provider stub mirroring secrets.yaml (MODEL_WEIGHTS /
// POLICY_THRESHOLDS / POLICY_PROFILES) for offline handler-level tests.
function makeSecretsProvider(overrides: Record<string, string> = {}) {
  const store: Record<string, string> = {
    MODEL_WEIGHTS: JSON.stringify(DEFAULT_MODEL_WEIGHTS),
    POLICY_THRESHOLDS: JSON.stringify(BALANCED_THRESHOLDS),
    POLICY_PROFILES: JSON.stringify(STANDARD_POLICY_PROFILES),
    ...overrides,
  }
  return {
    getSecret(req: { id: string; namespace?: string }) {
      return {
        result: () => {
          if (!(req.id in store)) {
            throw new Error(`secret not found: ${req.id}`)
          }
          return { id: req.id, value: store[req.id] }
        },
      }
    },
  }
}

function makeRuntime(config: unknown = stagingConfig, provider = makeSecretsProvider()) {
  return {
    config,
    now: () => new Date(1757000000000),
    log: () => {},
    getSecret: provider.getSecret,
  }
}

describe('PrivateSignal CRE Workflow', () => {
  it('validates the minimal HTTP-only configuration schema', () => {
    expect(() => configSchema.parse(stagingConfig)).not.toThrow()
    expect(() => configSchema.parse(prodConfig)).not.toThrow()
    expect(() => configSchema.parse(localConfig)).not.toThrow()

    const parsed = configSchema.parse(stagingConfig)
    expect(parsed.authorizedKeys).toEqual([])
  })

  it('registers exactly one confidential handler with a TEE constraint (no Cron)', () => {
    const handlers = initWorkflow(stagingConfig as any)
    expect(Array.isArray(handlers)).toBe(true)
    expect(handlers.length).toBe(1)
    // A TEE-bound entry must carry non-null requirements so the runtime routes it
    // through the confidential TeeRuntime path.
    expect(handlers[0].requirements).toBeDefined()
    expect(TEE_CONSTRAINT).toEqual([{ tee: 'nitro', regions: ['us-west-2'] }])
  })

  it('validates HTTP payloads with the zod query schema', () => {
    const valid = queryParamsSchema.parse({
      walletAddress: '0x1111111111111111111111111111111111111111',
      protocols: ['aave-v3', 'morpho'],
      policyProfileId: 'conservative',
      queryId: 'http_req_01',
      timestamp: 1757000000,
      graphData: MOCK_HEALTHY_GRAPH_DATA,
    })
    expect(valid.walletAddress).toBe('0x1111111111111111111111111111111111111111')

    // Missing required field -> rejected
    expect(() =>
      queryParamsSchema.parse({
        walletAddress: '0x1111111111111111111111111111111111111111',
        protocols: ['aave-v3'],
        timestamp: 1757000000,
        graphData: MOCK_HEALTHY_GRAPH_DATA,
      } as any),
    ).toThrow()

    // policyProfileId outside the requestable set -> rejected
    expect(() =>
      queryParamsSchema.parse({
        walletAddress: '0x1111111111111111111111111111111111111111',
        protocols: ['aave-v3'],
        policyProfileId: 'not-a-profile',
        queryId: 'x',
        timestamp: 1757000000,
        graphData: MOCK_HEALTHY_GRAPH_DATA,
      } as any),
    ).toThrow()
  })

  it('loads confidential secrets through the runtime secrets provider', () => {
    const secrets = loadSecretsFromProvider(makeSecretsProvider())
    expect(secrets.modelWeights).toEqual(DEFAULT_MODEL_WEIGHTS)
    expect(secrets.policyProfiles).toHaveLength(3)

    expect(() => loadSecretsFromProvider(makeSecretsProvider({ MODEL_WEIGHTS: '' }))).toThrow(
      'INVALID_ENCLAVE_CONFIG',
    )
    expect(() => loadSecretsFromProvider({} as any)).toThrow('INVALID_ENCLAVE_CONFIG')
    expect(CONFIDENTIAL_SECRET_IDS).toEqual(['MODEL_WEIGHTS', 'POLICY_THRESHOLDS', 'POLICY_PROFILES'])
  })

  it('processes an HTTP evaluation through the confidential TEE handler', async () => {
    const runtime = makeRuntime()
    const payloadInput = JSON.stringify({
      walletAddress: '0x1111111111111111111111111111111111111111',
      protocols: ['aave-v3', 'morpho'],
      policyProfileId: 'conservative',
      queryId: 'http_req_01',
      timestamp: 1757000000,
      graphData: MOCK_HEALTHY_GRAPH_DATA,
    })

    const httpPayload: any = {
      input: new TextEncoder().encode(payloadInput),
    }

    const response = await onHttpTrigger(runtime as any, httpPayload)
    const parsed = JSON.parse(response)
    expect(parsed.recommendation).toBe('safe')
    expect(parsed.score).toBeGreaterThanOrEqual(75)
    expect(parsed.attestation.verified).toBe(false)
    // No secrets/intermediates leak into the response
    expect(JSON.stringify(parsed)).not.toContain('modelWeights')
    expect(JSON.stringify(parsed)).not.toContain('thresholds')
  })

  it('fails closed when the HTTP payload carries empty/fabricated graph data', async () => {
    const runtime = makeRuntime()
    const payloadInput = JSON.stringify({
      walletAddress: '0x1111111111111111111111111111111111111111',
      protocols: ['aave-v3', 'morpho'],
      policyProfileId: 'conservative',
      queryId: 'cron_invented_01',
      timestamp: 1757000000,
      graphData: {
        positions: [],
        healthFactor: 3.5,
        totalCollateralUSD: 50000,
        totalDebtUSD: 10000,
      },
    })

    const httpPayload: any = { input: new TextEncoder().encode(payloadInput) }

    // Never a fabricated SAFE score: this must reject.
    await expect(onHttpTrigger(runtime as any, httpPayload)).rejects.toThrow(/GRAPH_DATA_UNAVAILABLE/)
  })

  it('fails closed at the scorer when graph data is empty (never SAFE)', async () => {
    const secrets: Secrets = getDefaultSecretsForStyle('conservative')
    const params: QueryParams = {
      walletAddress: '0x1111111111111111111111111111111111111111',
      protocols: ['aave-v3', 'morpho'],
      policyProfileId: 'conservative',
      queryId: 'empty_data_01',
      timestamp: 1757000000,
      graphData: {
        positions: [],
        healthFactor: 3.5,
        totalCollateralUSD: 50000,
        totalDebtUSD: 10000,
      },
    }

    await expect(scoreCrossProtocolRisk(params, secrets)).rejects.toThrow(/GRAPH_DATA_UNAVAILABLE/)
  })

  it('applies requested policy profiles through the confidential scorer', async () => {
    const conservativeSecrets = getDefaultSecretsForStyle('conservative')
    const aggressiveSecrets = getDefaultSecretsForStyle('aggressive')

    const params: QueryParams = {
      walletAddress: '0x2222222222222222222222222222222222222222',
      protocols: ['aave-v3', 'morpho'],
      policyProfileId: 'conservative',
      queryId: 'policy_diff_01',
      timestamp: 1757000000,
      graphData: MOCK_HEALTHY_GRAPH_DATA,
    }

    // Short-form 'conservative' now normalizes to 'conservative-v1' and its
    // 1.15 multiplier actually applies, producing a distinct (higher) envelope
    // than requesting no profile under an aggressive multiplier.
    const conservative = await scoreCrossProtocolRisk(
      { ...params, policyProfileId: 'conservative' },
      conservativeSecrets,
    )
    const balanced = await scoreCrossProtocolRisk(
      { ...params, policyProfileId: 'balanced-v1' },
      getDefaultSecretsForStyle('balanced'),
    )
    const aggressive = await scoreCrossProtocolRisk(
      { ...params, policyProfileId: 'aggressive' },
      aggressiveSecrets,
    )

    expect(conservative.attestation.verified).toBe(false)
    expect(conservative.score).toBeGreaterThanOrEqual(balanced.score)
    expect(conservative.score).toBeGreaterThanOrEqual(aggressive.score)
  })
})
