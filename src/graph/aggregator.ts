/**
 * PrivateSignal — Live Graph Data Aggregator
 *
 * ============================================================================
 * AGGREGATOR RUNTIME SPECIFICATION:
 * Runs in the off-DON client / agent environment (where HTTP I/O is permitted).
 * Connects to live Graph Protocol endpoints, queries multi-protocol lending state,
 * normalizes disparate schemas via `schemaMapper.ts`, calculates cross-protocol
 * risk features, and packages the exact `NormalizedGraphData` payload to be fed
 * into the TEE confidential scorer.
 * ============================================================================
 */

import 'dotenv/config'
import {
  type SupportedProtocol,
  buildProtocolQuery,
  type MessariSubgraphResponse,
} from './queries'
import {
  mapMessariResponse,
  combineMultiProtocolAccounts,
  type UnifiedAccountData,
} from './schemaMapper'
import type { NormalizedGraphData, CrossProtocolFeatures, ProtocolPosition } from '../types/scorer'
import {
  calculateConcentrationScore,
  calculateHealthPressureIndex,
  calculateAssetCorrelation,
} from '../utils/pureMath'

export interface QueryMetrics {
  totalDurationMs: number
  protocolLatencies: Record<string, number>
  cacheHit: boolean
  timestamp: number
}

export interface AggregatorResult {
  walletAddress: string
  protocols: SupportedProtocol[]
  normalizedGraphData: NormalizedGraphData
  unifiedAccountData: UnifiedAccountData
  features: CrossProtocolFeatures
  metrics: QueryMetrics
}

interface CacheEntry {
  data: AggregatorResult
  expiresAt: number
}

// In-memory 30-second TTL cache
const QUERY_CACHE = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30_000

// ETH-staking derivative symbols
const ETH_DERIVATIVE_SYMBOLS = new Set([
  'WSTETH',
  'STETH',
  'RETH',
  'CBETH',
  'EETH',
  'WEETH',
  'SFRXETH',
  'AETHWSTETH',
  'AETHSTETH',
])

function getCacheKey(walletAddress: string, protocols: SupportedProtocol[]): string {
  return `${walletAddress.toLowerCase()}:${[...protocols].sort().join(',')}`
}

/**
 * Executes a live GraphQL query against a subgraph endpoint with timeout handling
 */
async function fetchSubgraphData(
  endpoint: string,
  query: string,
  variables: Record<string, any>,
  timeoutMs = 6000,
): Promise<MessariSubgraphResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status} from subgraph endpoint: ${errText.slice(0, 150)}`)
    }

    return (await response.json()) as MessariSubgraphResponse
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Builds cross-protocol features from normalized protocol positions
 */
export function extractCrossProtocolFeatures(
  unified: UnifiedAccountData,
  positions: ProtocolPosition[],
): CrossProtocolFeatures {
  const combinedCollateralValue = unified.totalCollateralUSD
  const totalDebtUSD = unified.totalDebtUSD

  // 1. Build token collateral map & calculate ETH derivative totals
  const collateralByToken: Record<string, number> = {}
  let ethDerivativeCollateralUSD = 0
  for (const p of positions) {
    for (const c of p.collateral) {
      const sym = (c.token.symbol || 'UNKNOWN').toUpperCase()
      const val = Math.max(0, c.valueUSD || 0)
      collateralByToken[sym] = (collateralByToken[sym] || 0) + val
      if (ETH_DERIVATIVE_SYMBOLS.has(sym)) {
        ethDerivativeCollateralUSD += val
      }
    }
  }

  // 2. Calculate Concentration Score (0–100)
  const concentrationScore = calculateConcentrationScore(collateralByToken, combinedCollateralValue)

  // 3. Calculate Effective LTV & Health Pressure Index (0–100)
  const ltv = combinedCollateralValue > 0 ? (totalDebtUSD / combinedCollateralValue) * 100 : 0
  const healthPressureIndex = calculateHealthPressureIndex(unified.healthFactor, ltv)

  // 4. Calculate Correlated Asset Flags (ETH-staking derivatives)
  const correlatedAssetRatio = calculateAssetCorrelation(ethDerivativeCollateralUSD, combinedCollateralValue)
  const isEthDerivativeConcentrated = correlatedAssetRatio >= 0.35

  return {
    combinedCollateralValue: Number(combinedCollateralValue.toFixed(2)),
    totalDebtUSD: Number(totalDebtUSD.toFixed(2)),
    concentrationScore,
    healthPressureIndex,
    correlatedAssetRatio,
    correlatedAssetFlags: {
      isEthDerivativeConcentrated,
      correlatedAssetRatio,
    },
  }
}

/**
 * Fetches, normalizes, and aggregates live multi-protocol Graph data for a wallet.
 */
export async function aggregateLiveGraphData(
  walletAddress: string,
  protocols: SupportedProtocol[] = ['aave-v3', 'morpho'],
): Promise<AggregatorResult> {
  const startTime = Date.now()
  const normalizedWallet = walletAddress.toLowerCase()
  const cacheKey = getCacheKey(normalizedWallet, protocols)

  // Check 30s cache
  const cached = QUERY_CACHE.get(cacheKey)
  if (cached && cached.expiresAt > startTime) {
    return {
      ...cached.data,
      metrics: {
        ...cached.data.metrics,
        cacheHit: true,
      },
    }
  }

  const protocolLatencies: Record<string, number> = {}
  const protocolResults: UnifiedAccountData[] = []

  // Fetch from each protocol in parallel
  await Promise.all(
    protocols.map(async (protocol) => {
      const pStart = Date.now()
      const queryInfo = buildProtocolQuery(protocol, normalizedWallet)

      try {
        const rawResponse = await fetchSubgraphData(queryInfo.endpoint, queryInfo.query, queryInfo.variables)
        const mapped = mapMessariResponse(protocol, rawResponse, normalizedWallet)
        protocolResults.push(mapped)
      } catch (err: any) {
        // Log telemetry error and return empty position fallback for this protocol
        // to maintain fault tolerance across oracles
        protocolResults.push({
          account: { id: normalizedWallet },
          positions: [{ protocol, collateral: [], debt: [] }],
          totalCollateralUSD: 0,
          totalDebtUSD: 0,
          healthFactor: 999.0,
        })
      } finally {
        protocolLatencies[protocol] = Date.now() - pStart
      }
    }),
  )

  // Combine unified accounts
  const unifiedAccountData = combineMultiProtocolAccounts(normalizedWallet, protocolResults)

  // Convert to NormalizedGraphData format required by confidential TEE scorer
  const positions: ProtocolPosition[] = unifiedAccountData.positions.map((p) => ({
    protocol: p.protocol,
    collateral: p.collateral.map((c) => ({
      token: c.token,
      amount: c.amount,
      valueUSD: c.valueUSD,
    })),
    debt: p.debt.map((d) => ({
      token: d.token,
      amount: d.amount,
      valueUSD: d.valueUSD,
    })),
  }))

  const features = extractCrossProtocolFeatures(unifiedAccountData, positions)

  if (unifiedAccountData.totalCollateralUSD === 0 && unifiedAccountData.totalDebtUSD === 0) {
    throw new Error('GRAPH_DATA_UNAVAILABLE: No active positions found across any evaluated protocols. Failing closed to prevent default-safe scoring.')
  }

  const normalizedGraphData: NormalizedGraphData = {
    positions,
    healthFactor: unifiedAccountData.healthFactor,
    totalCollateralUSD: unifiedAccountData.totalCollateralUSD,
    totalDebtUSD: unifiedAccountData.totalDebtUSD,
    correlatedCollateralUSD: Number((features.correlatedAssetRatio * unifiedAccountData.totalCollateralUSD).toFixed(2)),
    crossProtocolFeatures: features,
  }

  const result: AggregatorResult = {
    walletAddress: normalizedWallet,
    protocols,
    normalizedGraphData,
    unifiedAccountData,
    features,
    metrics: {
      totalDurationMs: Date.now() - startTime,
      protocolLatencies,
      cacheHit: false,
      timestamp: Math.floor(Date.now() / 1000),
    },
  }

  // Store in cache with 30s TTL
  QUERY_CACHE.set(cacheKey, {
    data: result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  return result
}

/**
 * Clears the query cache (useful in tests)
 */
export function clearAggregatorCache(): void {
  QUERY_CACHE.clear()
}
