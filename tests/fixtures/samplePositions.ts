/**
 * PrivateSignal — Test Fixtures for Unit & End-to-End Validation
 *
 * Provides standardized mock data structures conforming to the Messari Lending schema
 * and normalized Graph data models for fully offline, deterministic testing.
 */

import type { NormalizedGraphData } from '../../src/types/scorer'
import type { MessariSubgraphResponse } from '../../src/graph/queries'

export const SAMPLE_WALLETS = {
  healthy: '0x1111111111111111111111111111111111111111',
  risky: '0x2222222222222222222222222222222222222222',
  concentrated: '0x3333333333333333333333333333333333333333',
  empty: '0x0000000000000000000000000000000000000000',
}

// ----------------------------------------------------------------------------
// 1. Normalized Graph Data Fixtures
// ----------------------------------------------------------------------------

export const MOCK_HEALTHY_GRAPH_DATA: NormalizedGraphData = {
  positions: [
    {
      protocol: 'aave-v3',
      collateral: [
        { token: { symbol: 'WETH', decimals: 18 }, amount: '15.0', valueUSD: 45000 },
        { token: { symbol: 'USDC', decimals: 6 }, amount: '15000', valueUSD: 15000 },
      ],
      debt: [
        { token: { symbol: 'DAI', decimals: 18 }, amount: '12000', valueUSD: 12000 },
      ],
    },
    {
      protocol: 'morpho',
      collateral: [
        { token: { symbol: 'wstETH', decimals: 18 }, amount: '5.0', valueUSD: 17500 },
      ],
      debt: [
        { token: { symbol: 'USDC', decimals: 6 }, amount: '3500', valueUSD: 3500 },
      ],
    },
  ],
  totalCollateralUSD: 77500,
  totalDebtUSD: 15500, // Total LTV = 20%
  healthFactor: 3.4,
}

export const MOCK_RISKY_GRAPH_DATA: NormalizedGraphData = {
  positions: [
    {
      protocol: 'aave-v3',
      collateral: [
        { token: { symbol: 'WETH', decimals: 18 }, amount: '5.0', valueUSD: 15000 },
      ],
      debt: [
        { token: { symbol: 'USDC', decimals: 6 }, amount: '13800', valueUSD: 13800 }, // 92% LTV
      ],
    },
    {
      protocol: 'morpho',
      collateral: [
        { token: { symbol: 'wstETH', decimals: 18 }, amount: '3.0', valueUSD: 10500 },
      ],
      debt: [
        { token: { symbol: 'DAI', decimals: 18 }, amount: '9600', valueUSD: 9600 }, // 91.4% LTV
      ],
    },
  ],
  totalCollateralUSD: 25500,
  totalDebtUSD: 23400, // Total LTV = 91.76%
  healthFactor: 1.04,
}

export const MOCK_CONCENTRATED_GRAPH_DATA: NormalizedGraphData = {
  positions: [
    {
      protocol: 'aave-v3',
      collateral: [
        { token: { symbol: 'wstETH', decimals: 18 }, amount: '30.0', valueUSD: 105000 },
      ],
      debt: [
        { token: { symbol: 'USDC', decimals: 6 }, amount: '45000', valueUSD: 45000 },
      ],
    },
  ],
  totalCollateralUSD: 105000,
  totalDebtUSD: 45000,
  correlatedCollateralUSD: 105000, // 100% derivative concentration
  healthFactor: 1.8,
}

// ----------------------------------------------------------------------------
// 2. Mock Raw Subgraph Responses (Messari Lending Schema)
// ----------------------------------------------------------------------------

export const MOCK_RAW_MESSARI_AAVE_RESPONSE: MessariSubgraphResponse = {
  data: {
    account: {
      id: SAMPLE_WALLETS.healthy,
      positions: [
        {
          id: 'pos_aave_collateral_01',
          side: 'COLLATERAL',
          balance: '15000000000000000000',
          asset: {
            symbol: 'WETH',
            decimals: 18,
            lastPriceUSD: '3000.00',
          },
          market: {
            id: 'market_weth_01',
            name: 'Aave Ethereum WETH',
            inputToken: {
              symbol: 'WETH',
              decimals: 18,
              lastPriceUSD: '3000.00',
            },
            maximumLTV: '82.5',
            liquidationThreshold: '85.0',
            totalDepositBalanceUSD: '4500000000',
            totalBorrowBalanceUSD: '2200000000',
          },
        },
        {
          id: 'pos_aave_debt_01',
          side: 'BORROWER',
          balance: '12000000000000000000000',
          asset: {
            symbol: 'DAI',
            decimals: 18,
            lastPriceUSD: '1.00',
          },
          market: {
            id: 'market_dai_01',
            name: 'Aave Ethereum DAI',
            inputToken: {
              symbol: 'DAI',
              decimals: 18,
              lastPriceUSD: '1.00',
            },
            maximumLTV: '75.0',
            liquidationThreshold: '80.0',
            totalDepositBalanceUSD: '800000000',
            totalBorrowBalanceUSD: '400000000',
          },
        },
      ],
    },
  },
}
