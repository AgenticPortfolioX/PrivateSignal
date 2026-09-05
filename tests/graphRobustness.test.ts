/**
 * PrivateSignal — Graph Robustness Test Suite
 *
 * Verifies:
 * 1. Standardized GraphQL query construction and schema mapping
 * 2. Natural language query routing into Graph MCP tool format
 * 3. Cross-protocol feature extraction and 30-second TTL caching
 * 4. End-to-end integration between Graph Aggregator and TEE Confidential Scorer
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import {
  buildProtocolQuery,
  isSupportedProtocol,
  getSubgraphEndpoint,
} from '../src/graph/queries'
import {
  mapMessariResponse,
  combineMultiProtocolAccounts,
} from '../src/graph/schemaMapper'
import {
  routeToGraphQueryPlan,
  isValidEthereumAddress,
} from '../src/graph/nlRouter'
import {
  extractCrossProtocolFeatures,
  clearAggregatorCache,
  aggregateLiveGraphData,
} from '../src/graph/aggregator'
import { scoreCrossProtocolRisk } from '../src/handlers/confidentialScorer'
import { getDefaultSecretsForStyle } from '../src/config/policyConfig'

describe('PrivateSignal: Graph Robustness & MCP Integration', () => {
  const sampleWallet = '0x1111111111111111111111111111111111111111'

  beforeEach(() => {
    clearAggregatorCache()
  })

  describe('Task 1: Standardized Multi-Protocol Queries & Schema Mapper', () => {
    it('validates supported protocols correctly', () => {
      expect(isSupportedProtocol('aave-v3')).toBe(true)
      expect(isSupportedProtocol('morpho')).toBe(true)
      expect(isSupportedProtocol('unsupported-dex')).toBe(false)
    })

    it('builds standard query payloads with valid endpoints', () => {
      const aaveQuery = buildProtocolQuery('aave-v3', sampleWallet)
      expect(aaveQuery.variables.walletAddress).toBe(sampleWallet.toLowerCase())
      expect(aaveQuery.query).toContain('account(id: $walletAddress)')
      expect(aaveQuery.endpoint).toContain('JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk')

      const morphoQuery = buildProtocolQuery('morpho', sampleWallet)
      expect(morphoQuery.endpoint).toContain('8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs')
    })

    it('maps Messari Lending schema responses accurately', () => {
      const mockRawResponse = {
        data: {
          account: {
            id: sampleWallet.toLowerCase(),
            openPositionCount: 2,
            positions: [
              {
                id: 'pos-1',
                side: 'COLLATERAL',
                isCollateral: true,
                balance: '10000000000000000000', // 10 WETH
                asset: {
                  symbol: 'WETH',
                  decimals: 18,
                  lastPriceUSD: '3000.00',
                },
                market: {
                  id: 'market-weth',
                  name: 'Aave WETH',
                  inputToken: { symbol: 'WETH', decimals: 18, lastPriceUSD: '3000.00' },
                  liquidationThreshold: '82.5',
                  maximumLTV: '80.0',
                },
              },
              {
                id: 'pos-2',
                side: 'BORROWER',
                isCollateral: false,
                balance: '10000000000', // 10,000 USDC (6 decimals)
                asset: {
                  symbol: 'USDC',
                  decimals: 6,
                  lastPriceUSD: '1.00',
                },
                market: {
                  id: 'market-usdc',
                  name: 'Aave USDC',
                  inputToken: { symbol: 'USDC', decimals: 6, lastPriceUSD: '1.00' },
                },
              },
            ],
          },
        },
      }

      const mapped = mapMessariResponse('aave-v3', mockRawResponse, sampleWallet)

      expect(mapped.account.id).toBe(sampleWallet.toLowerCase())
      expect(mapped.totalCollateralUSD).toBe(30000)
      expect(mapped.totalDebtUSD).toBe(10000)
      expect(mapped.positions[0].collateral.length).toBe(1)
      expect(mapped.positions[0].debt.length).toBe(1)
      // Health factor: (30000 * 0.825) / 10000 = 2.475
      expect(mapped.healthFactor).toBeCloseTo(2.475, 2)
    })

    it('handles empty account responses gracefully with safe fallbacks', () => {
      const emptyResponse = { data: { account: null } }
      const mapped = mapMessariResponse('morpho', emptyResponse, sampleWallet)

      expect(mapped.totalCollateralUSD).toBe(0)
      expect(mapped.totalDebtUSD).toBe(0)
      expect(mapped.healthFactor).toBe(999.0)
      expect(mapped.positions[0].collateral).toHaveLength(0)
    })
  })

  describe('Task 2: Graph MCP Natural Language Router', () => {
    it('validates Ethereum addresses strictly', () => {
      expect(isValidEthereumAddress('0x1111111111111111111111111111111111111111')).toBe(true)
      expect(isValidEthereumAddress('0xinvalid')).toBe(false)
      expect(isValidEthereumAddress('not-an-address')).toBe(false)
    })

    it('parses multi-protocol risk scoring prompt into MCP tool call', () => {
      const prompt =
        'Score cross-protocol risk for wallet 0x1111111111111111111111111111111111111111 across Aave and Morpho under conservative policy'

      const plan = routeToGraphQueryPlan(prompt)

      expect(plan.walletAddress).toBe(sampleWallet.toLowerCase())
      expect(plan.protocols).toContain('aave-v3')
      expect(plan.protocols).toContain('morpho')
      expect(plan.policyProfileId).toBe('conservative')
      expect(plan.questionType).toBe('risk_score')

      expect(plan.mcpToolCall.tool).toBe('execute_graph_query')
      expect(plan.mcpToolCall.arguments.query).toContain('account(id: $walletAddress)')
      expect(plan.mcpToolCall.arguments.variables.walletAddress).toBe(sampleWallet.toLowerCase())
    })

    it('parses concentration check prompt with ETH derivatives recognition', () => {
      const prompt =
        'Is concentration in ETH-correlated collateral too high for cautious agent 0x2222222222222222222222222222222222222222?'

      const plan = routeToGraphQueryPlan(prompt)

      expect(plan.walletAddress).toBe('0x2222222222222222222222222222222222222222')
      expect(plan.policyProfileId).toBe('conservative')
      expect(plan.questionType).toBe('concentration_check')
    })

    it('supports structured JSON inputs', () => {
      const plan = routeToGraphQueryPlan({
        walletAddress: sampleWallet,
        protocols: ['aave-v3'],
        policyProfileId: 'aggressive',
        questionType: 'health_factor',
      })

      expect(plan.protocols).toEqual(['aave-v3'])
      expect(plan.policyProfileId).toBe('aggressive')
      expect(plan.questionType).toBe('health_factor')
    })

    it('throws descriptive error on missing wallet address', () => {
      expect(() => routeToGraphQueryPlan('What is the risk of this random text?')).toThrow(
        /INVALID_ROUTER_INPUT/,
      )
    })
  })

  describe('Task 3: Cross-Protocol Feature Extraction & Aggregation', () => {
    it('calculates cross-protocol risk features and flags staking derivative concentration', () => {
      const unifiedMock = {
        account: { id: sampleWallet.toLowerCase() },
        positions: [],
        totalCollateralUSD: 100000,
        totalDebtUSD: 40000,
        healthFactor: 2.0,
      }

      const positions = [
        {
          protocol: 'aave-v3',
          collateral: [
            { token: { symbol: 'WSTETH', decimals: 18 }, amount: '20.0', valueUSD: 60000 },
          ],
          debt: [
            { token: { symbol: 'USDC', decimals: 6 }, amount: '25000', valueUSD: 25000 },
          ],
        },
        {
          protocol: 'morpho',
          collateral: [
            { token: { symbol: 'USDC', decimals: 6 }, amount: '40000', valueUSD: 40000 },
          ],
          debt: [
            { token: { symbol: 'USDT', decimals: 6 }, amount: '15000', valueUSD: 15000 },
          ],
        },
      ]

      const features = extractCrossProtocolFeatures(unifiedMock, positions)

      expect(features.combinedCollateralValue).toBe(100000)
      expect(features.totalDebtUSD).toBe(40000)
      expect(features.concentrationScore).toBeGreaterThanOrEqual(0)
      expect(features.concentrationScore).toBeLessThanOrEqual(100)
      expect(features.healthPressureIndex).toBeGreaterThan(0)

      // 60,000 / 100,000 = 60% in wstETH -> should flag as concentrated
      expect(features.correlatedAssetFlags?.isEthDerivativeConcentrated).toBe(true)
      expect(features.correlatedAssetFlags?.correlatedAssetRatio).toBeCloseTo(0.6, 2)
    })

    it('feeds aggregated Graph features seamlessly into TEE confidential scorer', async () => {
      const liveData = await aggregateLiveGraphData(sampleWallet, ['aave-v3', 'morpho'])

      expect(liveData.walletAddress).toBe(sampleWallet.toLowerCase())
      expect(liveData.protocols).toHaveLength(2)
      expect(liveData.metrics.totalDurationMs).toBeGreaterThanOrEqual(0)

      // Verify 30-second TTL cache hit
      const cachedData = await aggregateLiveGraphData(sampleWallet, ['aave-v3', 'morpho'])
      expect(cachedData.metrics.cacheHit).toBe(true)

      // Feed into TEE Confidential Scorer (Phase 1)
      const secrets = getDefaultSecretsForStyle('conservative')
      const scoreOutput = await scoreCrossProtocolRisk(
        {
          walletAddress: sampleWallet,
          protocols: ['aave-v3', 'morpho'],
          policyProfileId: 'conservative-v1',
          queryId: 'graph-e2e-query-001',
          timestamp: Math.floor(Date.now() / 1000),
          graphData: liveData.normalizedGraphData,
        },
        secrets,
      )

      expect(scoreOutput.score).toBeGreaterThanOrEqual(0)
      expect(scoreOutput.score).toBeLessThanOrEqual(100)
      expect(['safe', 'caution', 'high_risk']).toContain(scoreOutput.recommendation)
      expect(scoreOutput.attestation.workflowId).toBe('privatesignal-local-harness')
      expect(scoreOutput.attestation.verified).toBe(false)
    })
  })
})
