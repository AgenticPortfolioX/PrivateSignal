/**
 * @title PrivateSignal Graph Schema Mapper
 * @author Justin Gramke
 * @notice Normalizes disparate protocol GraphQL responses into a unified canonical structure.
 */

import type { MessariSubgraphResponse, RawPosition, SupportedProtocol } from './queries'
import { isSupportedProtocol } from './queries'

export interface UnifiedToken {
  symbol: string
  decimals: number
}

export interface UnifiedPositionAsset {
  token: UnifiedToken
  amount: string
  valueUSD: number
}

export interface NormalizedProtocolPosition {
  protocol: string
  collateral: UnifiedPositionAsset[]
  debt: UnifiedPositionAsset[]
  liquidationThresholdBps?: number
}

export interface UnifiedAccountData {
  account: {
    id: string
  }
  positions: NormalizedProtocolPosition[]
  totalCollateralUSD: number
  totalDebtUSD: number
  healthFactor: number
}

// Fallback pricing map for common tokens when subgraph price is omitted or zero
const FALLBACK_PRICES_USD: Record<string, number> = {
  USDC: 1.0,
  USDT: 1.0,
  DAI: 1.0,
  PYUSD: 1.0,
  WETH: 2500.0,
  ETH: 2500.0,
  WBTC: 60000.0,
  BTC: 60000.0,
  WSTETH: 3000.0,
  STETH: 2500.0,
  RETH: 2800.0,
  CBETH: 2600.0,
}

function resolveTokenPrice(symbol: string, rawPrice?: string | null, marketInputPrice?: string | null): number {
  if (rawPrice && !isNaN(parseFloat(rawPrice)) && parseFloat(rawPrice) > 0) {
    return parseFloat(rawPrice)
  }
  if (marketInputPrice && !isNaN(parseFloat(marketInputPrice)) && parseFloat(marketInputPrice) > 0) {
    return parseFloat(marketInputPrice)
  }
  const upper = (symbol || '').toUpperCase()
  return FALLBACK_PRICES_USD[upper] ?? 1.0
}

function parseTokenBalance(rawBalance: string, decimals: number): { amountStr: string; amountNum: number } {
  try {
    const rawBig = BigInt(rawBalance || '0')
    if (rawBig === 0n) return { amountStr: '0.0', amountNum: 0 }
    const divisor = 10 ** decimals
    const amountNum = Number(rawBig) / divisor
    return { amountStr: amountNum.toFixed(6), amountNum }
  } catch {
    const num = parseFloat(rawBalance) || 0
    return { amountStr: num.toString(), amountNum: num }
  }
}

/**
 * Normalizes a raw Messari Lending Protocol subgraph response (Aave V3 / Morpho)
 * into the unified account structure.
 */
export function mapMessariResponse(
  protocol: SupportedProtocol,
  rawResponse: MessariSubgraphResponse,
  expectedWallet: string,
): UnifiedAccountData {
  if (!isSupportedProtocol(protocol)) {
    throw new Error(`UNSUPPORTED_PROTOCOL: Protocol '${protocol}' is not supported by schema mapper`)
  }

  if (rawResponse.errors && rawResponse.errors.length > 0) {
    const errMsg = rawResponse.errors.map((e) => e.message).join(', ')
    throw new Error(`GRAPHQL_QUERY_ERROR on ${protocol}: ${errMsg}`)
  }

  const account = rawResponse.data?.account || rawResponse.data?.accounts?.[0]
  const normalizedWallet = expectedWallet.toLowerCase()

  if (!account || !account.positions || account.positions.length === 0) {
    return {
      account: { id: normalizedWallet },
      positions: [
        {
          protocol,
          collateral: [],
          debt: [],
        },
      ],
      totalCollateralUSD: 0,
      totalDebtUSD: 0,
      healthFactor: 999.0,
    }
  }

  const collaterals: UnifiedPositionAsset[] = []
  const debts: UnifiedPositionAsset[] = []
  let totalCollateralUSD = 0
  let totalDebtUSD = 0
  let weightedThresholdSum = 0

  for (const pos of account.positions) {
    const symbol = pos.asset?.symbol || pos.market?.inputToken?.symbol || 'UNKNOWN'
    const decimals = pos.asset?.decimals ?? pos.market?.inputToken?.decimals ?? 18
    const priceUSD = resolveTokenPrice(symbol, pos.asset?.lastPriceUSD, pos.market?.inputToken?.lastPriceUSD)
    const { amountStr, amountNum } = parseTokenBalance(pos.balance, decimals)

    if (amountNum <= 0) continue

    const valueUSD = amountNum * priceUSD
    const token: UnifiedToken = { symbol, decimals }

    const isCollateralSide =
      pos.side === 'COLLATERAL' ||
      pos.isCollateral === true ||
      pos.side?.toUpperCase().includes('SUPPLIER') ||
      pos.side?.toUpperCase().includes('LENDER')

    if (isCollateralSide) {
      collaterals.push({
        token,
        amount: amountStr,
        valueUSD,
      })
      totalCollateralUSD += valueUSD

      // Extract liquidation threshold (default 80% if missing)
      const rawLt = pos.market?.liquidationThreshold
      const ltPercent = rawLt ? parseFloat(rawLt.toString()) : 80.0
      weightedThresholdSum += valueUSD * (ltPercent / 100)
    } else {
      debts.push({
        token,
        amount: amountStr,
        valueUSD,
      })
      totalDebtUSD += valueUSD
    }
  }

  // Calculate Health Factor
  // HF = (Total Collateral in USD * Liquidation Threshold) / Total Debt in USD
  let healthFactor = 999.0
  if (totalDebtUSD > 0) {
    const effectiveThresholdValue = weightedThresholdSum > 0 ? weightedThresholdSum : totalCollateralUSD * 0.8
    healthFactor = Number((effectiveThresholdValue / totalDebtUSD).toFixed(4))
  }

  return {
    account: { id: normalizedWallet },
    positions: [
      {
        protocol,
        collateral: collaterals,
        debt: debts,
      },
    ],
    totalCollateralUSD: Number(totalCollateralUSD.toFixed(2)),
    totalDebtUSD: Number(totalDebtUSD.toFixed(2)),
    healthFactor,
  }
}

/**
 * Combines multiple protocol account data objects into a single multi-protocol result.
 */
export function combineMultiProtocolAccounts(
  walletAddress: string,
  protocolResults: UnifiedAccountData[],
): UnifiedAccountData {
  let combinedCollateralUSD = 0
  let combinedDebtUSD = 0
  const allPositions: NormalizedProtocolPosition[] = []

  for (const res of protocolResults) {
    combinedCollateralUSD += res.totalCollateralUSD
    combinedDebtUSD += res.totalDebtUSD
    allPositions.push(...res.positions)
  }

  let combinedHealthFactor = 999.0
  if (combinedDebtUSD > 0) {
    combinedHealthFactor = Number(((combinedCollateralUSD * 0.8) / combinedDebtUSD).toFixed(4))
  }

  return {
    account: { id: walletAddress.toLowerCase() },
    positions: allPositions,
    totalCollateralUSD: Number(combinedCollateralUSD.toFixed(2)),
    totalDebtUSD: Number(combinedDebtUSD.toFixed(2)),
    healthFactor: combinedHealthFactor,
  }
}
