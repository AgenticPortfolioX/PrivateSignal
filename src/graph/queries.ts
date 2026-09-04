/**
 * PrivateSignal — Standardized Multi-Protocol Graph Queries
 *
 * ============================================================================
 * LIVE SUBGRAPH ENDPOINT DOCUMENTATION:
 * The Graph Decentralized Network Endpoints (Messari Lending Schema Standard):
 * - Aave V3 Ethereum:
 *   ID: JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk
 *   URL: https://gateway.thegraph.com/api/{API_KEY}/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk
 *
 * - Morpho Blue Ethereum:
 *   ID: 8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs
 *   URL: https://gateway.thegraph.com/api/{API_KEY}/subgraphs/id/8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs
 *
 * Official Morpho Blue Direct API Fallback:
 * - URL: https://blue-api.morpho.org/graphql
 * ============================================================================
 */

export const SUPPORTED_PROTOCOLS = ['aave-v3', 'morpho', 'morpho-blue'] as const
export type SupportedProtocol = typeof SUPPORTED_PROTOCOLS[number]

export interface SubgraphEndpoints {
  'aave-v3': string
  'morpho': string
  'morpho-blue': string
}

export const DEFAULT_SUBGRAPH_IDS = {
  'aave-v3': 'JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk',
  'morpho': '8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs',
  'morpho-blue': '8Lz789DP5VKLXumTMTgygjU2xtuzx8AhbaacgN5PYCAs',
} as const

export function getSubgraphEndpoint(protocol: SupportedProtocol, apiKey?: string): string {
  const key = apiKey || process.env.graph_api_key || process.env.GRAPH_API_KEY || ''
  const subgraphId = DEFAULT_SUBGRAPH_IDS[protocol]
  if (key) {
    return `https://gateway.thegraph.com/api/${key}/subgraphs/id/${subgraphId}`
  }
  return `https://gateway.thegraph.com/api/subgraphs/id/${subgraphId}`
}

/**
 * Unified GraphQL query template targeting the Messari Lending Protocol schema
 * implemented across both Aave V3 and Morpho subgraphs on The Graph.
 */
export const UNIFIED_MESSARI_POSITIONS_QUERY = `
  query GetAccountPositions($walletAddress: ID!) {
    account(id: $walletAddress) {
      id
      openPositionCount
      positions(first: 50, where: { balance_gt: "0" }) {
        id
        side
        isCollateral
        balance
        asset {
          symbol
          decimals
          lastPriceUSD
        }
        market {
          id
          name
          inputToken {
            symbol
            decimals
            lastPriceUSD
          }
          maximumLTV
          liquidationThreshold
          totalDepositBalanceUSD
          totalBorrowBalanceUSD
        }
      }
    }
  }
`

/**
 * Direct fallback query for Morpho Blue official GraphQL API
 */
export const MORPHO_BLUE_NATIVE_QUERY = `
  query GetMorphoUser($address: String!) {
    userByAddress(address: $address) {
      address
      positions {
        market {
          uniqueKey
          lltv
          collateralAsset {
            symbol
            decimals
            priceUsd
          }
          loanAsset {
            symbol
            decimals
            priceUsd
          }
        }
        supplyShares
        borrowShares
        collateral
      }
    }
  }
`

/**
 * Raw Subgraph Schema Response Types
 */
export interface RawToken {
  symbol: string
  decimals: number
  lastPriceUSD?: string | null
}

export interface RawMarket {
  id: string
  name: string
  inputToken: RawToken
  maximumLTV?: string | number | null
  liquidationThreshold?: string | number | null
  totalDepositBalanceUSD?: string | null
  totalBorrowBalanceUSD?: string | null
}

export interface RawPosition {
  id: string
  side: 'COLLATERAL' | 'BORROWER' | string
  isCollateral?: boolean | null
  balance: string
  asset: RawToken
  market: RawMarket
}

export interface RawAccount {
  id: string
  openPositionCount?: number | null
  positions: RawPosition[]
}

export interface MessariSubgraphResponse {
  data?: {
    account?: RawAccount | null
    accounts?: RawAccount[] | null
  }
  errors?: Array<{ message: string; locations?: any[] }>
}

/**
 * Validates whether a protocol name is supported
 */
export function isSupportedProtocol(protocol: string): protocol is SupportedProtocol {
  return (SUPPORTED_PROTOCOLS as readonly string[]).includes(protocol.toLowerCase())
}

/**
 * Builds standard Graph query payload for a given protocol and wallet
 */
export function buildProtocolQuery(protocol: SupportedProtocol, walletAddress: string) {
  const normalizedWallet = walletAddress.toLowerCase()
  return {
    query: UNIFIED_MESSARI_POSITIONS_QUERY,
    variables: {
      walletAddress: normalizedWallet,
    },
    endpoint: getSubgraphEndpoint(protocol),
  }
}
