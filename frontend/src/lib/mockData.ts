/**
 * PrivateSignal — Frontend Mock Data & Samples
 */

export interface ScoreResponse {
  score: number
  recommendation: 'safe' | 'caution' | 'high_risk'
  reasonCodes: string[]
  protocolsConsidered: string[]
  queryId: string
  timestamp: number
  attestation: {
    donId: string
    workflowId: string
    executionHash: string
    signature: string
    timestamp: number
    verified: boolean
  }
  attestationSummary: {
    valid: boolean
    donId: string
    timestamp: number
    workflowId: string
    executionHash: string
    signatureSnippet: string
    verified: boolean
    status: string
    formattedTimestamp: string
    shortHash: string
    donZone: string
  }
  featuresSummary: {
    combinedCollateralValue: number
    totalDebtUSD: number
    concentrationScore: number
    healthPressureIndex: number
  }
}

export const SAMPLE_QUERY_RESULTS: Record<string, ScoreResponse> = {
  sample: {
    score: 88,
    recommendation: 'safe',
    reasonCodes: [
      'HEALTHY_PORTFOLIO_ACROSS_PROTOCOLS',
      'LOW_AGGREGATE_LEVERAGE',
      'SUFFICIENT_COLLATERAL_BUFFER',
    ],
    protocolsConsidered: ['aave-v3', 'morpho'],
    queryId: 'ps_query_sample_safe',
    timestamp: Math.floor(Date.now() / 1000) - 180,
    attestation: {
      donId: 'LOCAL_PROTOTYPE_MODE',
      workflowId: 'privatesignal-local-harness',
      executionHash: '0x8f2d9c1e45a7b03681fe29d3c509a27e43bc91f8a20d4e56b82c31e9a04f7b2c',
      signature: 'UNVERIFIED_LOCAL_EXECUTION',
      timestamp: Math.floor(Date.now() / 1000) - 180,
      verified: false,
    },
    attestationSummary: {
      valid: true, // Treated as valid for local demo UI purposes
      donId: 'LOCAL_PROTOTYPE_MODE',
      timestamp: Math.floor(Date.now() / 1000) - 180,
      workflowId: 'privatesignal-local-harness',
      executionHash: '0x8f2d9c1e45a7b03681fe29d3c509a27e43bc91f8a20d4e56b82c31e9a04f7b2c',
      signatureSnippet: 'UNVERIFIED_LOCAL',
      verified: false,
      status: 'MISSING_ATTESTATION',
      formattedTimestamp: 'Sep 4, 2026, 7:12:00 PM EDT',
      shortHash: '0x8f2d9c1e...a04f7b2c',
      donZone: 'Local Prototype Env',
    },
    featuresSummary: {
      combinedCollateralValue: 142500,
      totalDebtUSD: 31200,
      concentrationScore: 84,
      healthPressureIndex: 92,
    },
  },
  caution: {
    score: 52,
    recommendation: 'caution',
    reasonCodes: [
      'MODERATE_LEVERAGE_ELEVATED',
      'SINGLE_PROTOCOL_DEPOSIT_CONCENTRATION',
      'CORRELATED_STAKING_DERIVATIVE_EXPOSURE',
    ],
    protocolsConsidered: ['aave-v3', 'morpho'],
    queryId: 'ps_query_sample_caution',
    timestamp: Math.floor(Date.now() / 1000) - 600,
    attestation: {
      donId: 'LOCAL_PROTOTYPE_MODE',
      workflowId: 'privatesignal-local-harness',
      executionHash: '0x3a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456789abcdef01',
      signature: 'UNVERIFIED_LOCAL_EXECUTION',
      timestamp: Math.floor(Date.now() / 1000) - 600,
      verified: false,
    },
    attestationSummary: {
      valid: true, // Valid for UI rendering
      donId: 'LOCAL_PROTOTYPE_MODE',
      timestamp: Math.floor(Date.now() / 1000) - 600,
      workflowId: 'privatesignal-local-harness',
      executionHash: '0x3a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456789abcdef01',
      signatureSnippet: 'UNVERIFIED_LOCAL',
      verified: false,
      status: 'MISSING_ATTESTATION',
      formattedTimestamp: 'Sep 4, 2026, 7:05:00 PM EDT',
      shortHash: '0x3a4b5c6d...cdef01',
      donZone: 'Local Prototype Env',
    },
    featuresSummary: {
      combinedCollateralValue: 85000,
      totalDebtUSD: 52000,
      concentrationScore: 48,
      healthPressureIndex: 58,
    },
  },
}

export const ARC_AGENT_MOCK = {
  network: 'Arc Testnet (Circle L1)',
  agentWalletAddress: '0xfb79f82a690b91ab86c2299de4e7ecc228f61269',
  balanceUSDC: '20.00',
  feePerQueryUSDC: '0.10',
  gasModel: 'Native USDC (Gas paid in USDC)',
  totalQueriesSponsored: 42,
  policyThreshold: 65,
  recentActions: [
    {
      id: 'act-1',
      txHash: '0x3c91a4fd1278ba92d8f99e31d9047bf1b2a9e102830f89d3615e45a08db612ef',
      action: 'SCORE_GATED_DELEVERAGE_TRIGGER',
      amountUSDC: '0.10',
      status: 'CONFIRMED',
      targetProtocol: 'Aave V3',
      result: 'REPAY_EXECUTED',
      timestamp: '2 mins ago',
    },
    {
      id: 'act-2',
      txHash: '0x7e81b2ca90234fe115ac90341829038201948102934810928340192834019283',
      action: 'RISK_SIGNAL_FEE_PAYMENT',
      amountUSDC: '0.10',
      status: 'CONFIRMED',
      targetProtocol: 'Morpho Blue',
      result: 'SIGNAL_ISSUED',
      timestamp: '14 mins ago',
    },
    {
      id: 'act-3',
      txHash: '0x1234a9fe90238471029384710293847102938471029384710293847102938471',
      action: 'INITIAL_USDC_AGENT_SEED',
      amountUSDC: '20.00',
      status: 'CONFIRMED',
      targetProtocol: 'Arc Circle Faucet',
      result: 'FUNDED',
      timestamp: '1 hour ago',
    },
  ],
}
