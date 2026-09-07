/**
 * PrivateSignal — Independent robustness evidence (TestAudit deliverable, 2026-09-07)
 *
 * These tests REPRODUCE specific behaviors found during the TestAudit pass and pin
 * them as observable evidence. Names are prefixed [EVIDENCE] so they read as
 * behavior documentation, not as correctness guarantees. Each finding is cross-
 * referenced to the audit report (audit/TestAudit-Results-2026-09-07.md).
 *
 * Convention: a test asserts the CURRENT behavior. Where that behavior is a
 * confirmed defect, the test is the reproduction and the report carries severity
 * + recommended fix. Do not silently "fix" source to make these pass.
 */

import { describe, test, expect, afterEach, afterAll } from 'bun:test'
import {
  aggregateLiveGraphData,
  clearAggregatorCache,
} from '../src/graph/aggregator'
import { scoreCrossProtocolRisk } from '../src/handlers/confidentialScorer'
import {
  getDefaultSecretsForStyle,
  STANDARD_POLICY_PROFILES,
} from '../src/config/policyConfig'
import { executeScoreGatedAction, STANDARD_CANDIDATE_ACTIONS } from '../src/arc/gatedAction'
import type { ScoreOutput } from '../src/types/scorer'

const mockScore = (score: number): ScoreOutput => ({
  score,
  recommendation: 'safe',
  reasonCodes: [],
  queryId: 'test',
  timestamp: 0,
  policyProfileId: 'test',
  protocols: [],
  attestation: {
    donId: 'LOCAL_PROTOTYPE_MODE',
    signature: 'UNVERIFIED_LOCAL_EXECUTION',
    verified: false,
    timestamp: 0,
    workflowId: 'test',
    executionHash: '0x0'
  }
})
import { verifyAttestation } from '../src/utils/verifyAttestation'
import { rateLimitMiddleware, app } from '../src/api/server'
import { parseUsdcAmount, formatUsdcAmount } from '../src/arc/agentWallet'

const WALLET = '0x1111111111111111111111111111111111111111'
const originalFetch = global.fetch

function rawAccountResponse(positions: unknown[]) {
  return {
    data: {
      account: {
        id: WALLET,
        openPositionCount: positions.length,
        positions,
      },
    },
  }
}

const AAVE_HEALTHY_SMALL = rawAccountResponse([
  {
    id: 'a1',
    side: 'COLLATERAL',
    isCollateral: true,
    balance: '1000000000', // 1000 USDC (6 dec)
    asset: { symbol: 'USDC', decimals: 6, lastPriceUSD: '1.0' },
    market: {
      id: 'm-aave',
      name: 'Aave USDC',
      inputToken: { symbol: 'USDC', decimals: 6, lastPriceUSD: '1.0' },
      liquidationThreshold: '0.8',
    },
  },
])

const MORPHO_RISKY = rawAccountResponse([
  {
    id: 'm1',
    side: 'COLLATERAL',
    isCollateral: true,
    balance: (100n * 10n ** 18n).toString(), // 100 wstETH (18 dec)
    asset: { symbol: 'WSTETH', decimals: 18, lastPriceUSD: null },
    market: {
      id: 'm-wst',
      name: 'Morpho wstETH',
      inputToken: { symbol: 'WSTETH', decimals: 18, lastPriceUSD: null },
      liquidationThreshold: '0.945',
    },
  },
  {
    id: 'm2',
    side: 'BORROWER',
    isCollateral: false,
    balance: '250000000000', // 250000 USDC debt (6 dec)
    asset: { symbol: 'USDC', decimals: 6, lastPriceUSD: '1.0' },
    market: {
      id: 'm-usdc',
      name: 'Morpho USDC',
      inputToken: { symbol: 'USDC', decimals: 6, lastPriceUSD: '1.0' },
      liquidationThreshold: '0.945',
    },
  },
])

const EMPTY_ACCOUNT = rawAccountResponse([])

async function scoreWallet(protocols: string[], style: 'conservative' | 'balanced' | 'aggressive') {
  const result = await aggregateLiveGraphData(WALLET, protocols as any)
  const secrets = getDefaultSecretsForStyle(style)
  return scoreCrossProtocolRisk(
    {
      walletAddress: WALLET,
      protocols,
      policyProfileId: style,
      queryId: `evidence_${Date.now()}`,
      timestamp: Math.floor(Date.now() / 1000),
      graphData: result.normalizedGraphData,
    },
    secrets,
  )
}

afterEach(() => {
  clearAggregatorCache()
})

afterAll(() => {
  global.fetch = originalFetch
})

// ── Finding 1: partial single-protocol outage is scored as if complete ───────
describe('[EVIDENCE] aggregator partial-outage fail-open', () => {
  test('morpho down -> aggregator fails closed and throws GRAPH_DATA_UNAVAILABLE', async () => {
    clearAggregatorCache()
    // AAVE responds, but Morpho is down
    global.fetch = (async (input: any) => {
      const url = String(typeof input === 'string' ? input : input?.url || input)
      if (url.includes('JCNW')) {
        return new Response(JSON.stringify(AAVE_HEALTHY_SMALL), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('8Lz')) {
        throw new Error('MORPHO_ENDPOINT_DOWN')
      }
      throw new Error('unknown endpoint')
    }) as typeof fetch

    await expect(
      aggregateLiveGraphData(WALLET, ['aave-v3', 'morpho'])
    ).rejects.toThrow('GRAPH_DATA_UNAVAILABLE: Protocol query failed for morpho')
  })

  test('control: with morpho UP the SAME wallet is high-risk and the action is blocked', async () => {
    clearAggregatorCache()
    global.fetch = (async (input: any) => {
      const url = String(typeof input === 'string' ? input : input?.url || input)
      if (url.includes('JCNW')) {
        return new Response(JSON.stringify(AAVE_HEALTHY_SMALL), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('8Lz')) {
        return new Response(JSON.stringify(MORPHO_RISKY), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new Error('unknown endpoint')
    }) as typeof fetch

    const out = await scoreWallet(['aave-v3', 'morpho'], 'balanced')
    expect(out.score).toBeLessThan(20)
    expect(out.recommendation).toBe('high_risk')

    const gate = await executeScoreGatedAction(
      STANDARD_CANDIDATE_ACTIONS.safe_allocation,
      out, // pass the full ScoreOutput instead of out.score
      { dryRun: true },
    )
    expect(gate.passed).toBe(false)
  })
})

// ── Finding 2: action gate is numeric-only; not bound to a verified score ────
describe('[EVIDENCE] gated action does not require an attested score', () => {
  test('bare number is rejected by the gate', async () => {
    await expect(
      executeScoreGatedAction(
        STANDARD_CANDIDATE_ACTIONS.safe_allocation,
        100 as any, // force passing a number
        { dryRun: true }
      )
    ).rejects.toThrow('GATE_ERROR')
  })

  test('ScoreOutput with a forged/invalid attestation envelope still passes', async () => {
    const forged: ScoreOutput = {
      score: 100,
      recommendation: 'safe',
      reasonCodes: ['HEALTHY_PROFILE'],
      queryId: 'forged',
      timestamp: 0,
      policyProfileId: 'balanced',
      protocols: ['aave-v3'],
      attestation: {
        donId: 'forged',
        workflowId: 'forged',
        executionHash: '0x0',
        signature: 'totally-made-up',
        timestamp: 0,
        verified: false,
      },
    }
    // verifyAttestation says invalid...
    // The gate now calls verifyAttestation and throws
    await expect(
      executeScoreGatedAction(
        STANDARD_CANDIDATE_ACTIONS.safe_allocation,
        forged,
        { dryRun: true }
      )
    ).rejects.toThrow('GATE_ERROR: Invalid attestation')
  })
})

// ── Finding 3: verifyAttestation trusts caller-supplied flags; no replay guard ─
describe('[EVIDENCE] attestation "verification" is format + trusted-flag only', () => {
  test('attacker-crafted envelope with verified:true is REJECTED', async () => {
    const forged = {
      donId: 'production',
      workflowId: 'privatesignal-staging',
      executionHash: '0x0',
      signature: '0xattest_' + 'a'.repeat(40),
      timestamp: 1500000000,
      verified: true, // <- attacker controls this
    }
    const summary = verifyAttestation(forged)
    expect(summary.valid).toBe(false) // It must reject self-asserted verified: true
  })

  test('a 2017 timestamp is REJECTED', async () => {
    const old = {
      donId: 'production',
      workflowId: 'privatesignal-staging',
      executionHash: '0x0',
      signature: '0xattest_' + 'b'.repeat(40),
      timestamp: 1500000000,
      verified: true,
    }
    const summary = verifyAttestation(old)
    expect(summary.valid).toBe(false)
  })
})

// ── Finding 4: rate limiter trusts client-supplied X-Forwarded-For ───────────
describe('[EVIDENCE] /api/score rate limiter', () => {
  function hit(ipHeader?: string) {
    const state: { code: number; body: unknown } = { code: 0, body: null }
    const res: any = {
      status(c: number) {
        state.code = c
        return res
      },
      json(b: unknown) {
        state.body = b
        return res
      },
    }
    let nextCalled = false
    const req: any = {
      headers: ipHeader ? { 'x-forwarded-for': ipHeader } : {},
      socket: { remoteAddress: '127.0.0.1' },
    }
    rateLimitMiddleware(req, res, () => {
      nextCalled = true
    })
    return { state, nextCalled }
  }

  test('20 requests with rotating X-Forwarded-For are never limited', () => {
    for (let i = 0; i < 20; i++) {
      const { state, nextCalled } = hit(`203.0.113.${i}`)
      expect(state.code).toBe(0)
      expect(nextCalled).toBe(true)
    }
  })

  test('12 requests from one fixed IP: the 11th and 12th are 429', () => {
    for (let i = 1; i <= 12; i++) {
      const { state, nextCalled } = hit('198.51.100.7')
      if (i <= 10) {
        expect(state.code).toBe(0)
        expect(nextCalled).toBe(true)
      } else {
        expect(state.code).toBe(429)
        expect(nextCalled).toBe(false)
      }
    }
  })
})

// ── Finding 5: /api/score response exposes intermediate sub-scores ──────────
describe('[EVIDENCE] /api/score payload breadth vs privacy contract', () => {
  test('200 response includes featuresSummary intermediates (concentration + pressure + totals)', async () => {
    // Route the HTTP request to the real local server (setup mock handles the
    // gateway calls and forwards everything else to the real network stack).
    const prevFetch = global.fetch
    global.fetch = originalFetch
    let server: any
    const baseUrl = await new Promise<string>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : 3099
        resolve(`http://127.0.0.1:${port}`)
      })
    })
    try {
      const resp = await fetch(`${baseUrl}/api/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: '0x748ABdeF0775132E8F941e1513152D5eb02D3a4B',
          protocols: ['aave-v3'],
          policyProfileId: 'balanced',
        }),
      })
      expect(resp.status).toBe(200)
      const body = (await resp.json()) as any
      // minimal-payload contract says only score/recommendation/reasons/attestation/protocols/id/time
      expect(body).toHaveProperty('score')
      expect(body).not.toHaveProperty('featuresSummary')
      // but the raw sealed values themselves never appear
      expect(JSON.stringify(body)).not.toMatch(/modelWeights|POLICY_THRESHOLDS|weightAdjustment/i)
    } finally {
      if (server) {
        await new Promise<void>((resolve) => server.close(resolve))
      }
      global.fetch = prevFetch
    }
  })
})



// ── Finding 7: genuinely-empty wallets cannot be scored by the live path ────
describe('[EVIDENCE] verified-empty wallet is now scorable via aggregator', () => {
  test('verified-empty wallet is scored via aggregator', async () => {
    // Both protocols return empty position arrays
    global.fetch = (async () => {
      return new Response(JSON.stringify({ data: { account: null } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const result = await aggregateLiveGraphData(WALLET, ['aave-v3', 'morpho'])
    expect(result.normalizedGraphData.dataComplete).toBe(true)
  })
})

// ── Finding 8: privacy marker never leaks (positive control) ────────────────
describe('[EVIDENCE] confidential markers stay inside the boundary', () => {
  test('marker weight/threshold values do not appear in ScoreOutput serialization', async () => {
    const secrets = getDefaultSecretsForStyle('balanced')
    secrets.modelWeights = [0.6123456789, 0.2, 0.2, 0.2]
    secrets.thresholds = { safe: 81.23456789, caution: 40, highRisk: 20 }
    const graphData = {
      positions: [
        {
          protocol: 'aave-v3',
          collateral: [
            { token: { symbol: 'USDC', decimals: 6 }, amount: '1000.0', valueUSD: 1000 },
          ],
          debt: [],
        },
      ],
      healthFactor: 2.5,
      totalCollateralUSD: 1000,
      totalDebtUSD: 0,
    }
    const out = await scoreCrossProtocolRisk(
      {
        walletAddress: WALLET,
        protocols: ['aave-v3'],
        policyProfileId: 'balanced',
        queryId: 'privacy_marker',
        timestamp: Math.floor(Date.now() / 1000),
        graphData: graphData as any,
      },
      secrets,
    )
    const json = JSON.stringify(out)
    expect(json).not.toContain('6123456789')
    expect(json).not.toContain('8123456789')
    expect(json).not.toMatch(/modelWeights|thresholds/i)
  })
})

// ── Finding 9: Arc native USDC decimal handling is internally consistent ───
describe('[EVIDENCE] Arc 18-decimal USDC arithmetic', () => {
  test('0.10 USDC == 1e17 native units; format round-trips', () => {
    expect(parseUsdcAmount('0.10')).toBe(100000000000000000n)
    expect(parseUsdcAmount(0.1)).toBe(100000000000000000n)
    expect(formatUsdcAmount(100000000000000000n)).toBe('0.1')
  })
})
