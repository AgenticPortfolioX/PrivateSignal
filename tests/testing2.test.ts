/**
 * PrivateSignal — testing2 gap-closure suite (TestAudit2 deliverable, 2026-09-07)
 *
 * Covers the 15 gaps identified in audit/testing2 on top of the testing1 baseline.
 * Each describe maps to a gap (G1..G15). Tests assert CURRENT behavior; where the
 * repo intentionally deviates from a testing2 assumption (e.g. G14: the private-
 * registry workflow id lives in docs/deployment-evidence.md, not in workflow.yaml),
 * the test anchors on the truthful location and the report carries the deviation.
 */

import { describe, test, expect, afterEach, beforeAll, afterAll } from 'bun:test'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { scoreCrossProtocolRisk, resolvePolicy } from '../src/handlers/confidentialScorer'
import { getDefaultSecretsForStyle } from '../src/config/policyConfig'
import { verifyAttestation } from '../src/utils/verifyAttestation'
import { rateLimitMiddleware, app } from '../src/api/server'
import {
  executeScoreGatedAction,
  STANDARD_CANDIDATE_ACTIONS,
  type CandidateAction,
} from '../src/arc/gatedAction'
import { runAgentLoop, type AgentConfig } from '../src/arc/agentLoop'
import { routeToGraphQueryPlan } from '../src/graph/nlRouter'
import { aggregateLiveGraphData, clearAggregatorCache } from '../src/graph/aggregator'
import { saveQueryMetadata, getDatabase } from '../src/api/db'
import type { ScoreOutput, PolicyThresholds, Secrets } from '../src/types/scorer'

const WALLET = '0x1111111111111111111111111111111111111111'

// The bunfig-preloaded tests/setup.ts installs a graph-host fixture mock. Keep a
// reference so per-test overrides can restore it.
const setupFetch = global.fetch

const localScore = (
  pid: string,
  graphData: any,
  style: 'conservative' | 'balanced' | 'aggressive',
  queryId = `t2_${pid}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
) =>
  scoreCrossProtocolRisk(
    {
      walletAddress: WALLET,
      protocols: ['aave-v3'],
      policyProfileId: pid,
      queryId,
      timestamp: 1_700_000_000,
      graphData,
    },
    getDefaultSecretsForStyle(style),
  )

// A moderately-levered, single-protocol, single-collateral-token wallet (1000 USDC
// collateral / 300 USDC debt). Empirically scores 65 (conservative), 69 (balanced),
// 66 (aggressive) — straddling the 65/75 safe cutoffs, ideal for profile tests.
const MOD_GRAPH = {
  positions: [
    {
      protocol: 'aave-v3',
      collateral: [{ token: { symbol: 'USDC', decimals: 6 }, amount: '1000', valueUSD: 1000 }],
      debt: [{ token: { symbol: 'USDC', decimals: 6 }, amount: '300', valueUSD: 300 }],
    },
  ],
  healthFactor: 1.6,
  totalCollateralUSD: 1000,
  totalDebtUSD: 300,
  correlatedCollateralUSD: 0,
  dataComplete: true,
}

const EMPTY_VERIFIED = {
  positions: [],
  healthFactor: 100,
  totalCollateralUSD: 0,
  totalDebtUSD: 0,
  correlatedCollateralUSD: 0,
  dataComplete: true,
}

const ZERO_DEBT_TWO_TOKEN = {
  positions: [
    {
      protocol: 'aave-v3',
      collateral: [
        { token: { symbol: 'USDC', decimals: 6 }, amount: '500', valueUSD: 500 },
        { token: { symbol: 'WBTC', decimals: 8 }, amount: '0.005', valueUSD: 500 },
      ],
      debt: [],
    },
  ],
  healthFactor: 100,
  totalCollateralUSD: 1000,
  totalDebtUSD: 0,
  correlatedCollateralUSD: 0,
  dataComplete: true,
}

const mockScore = (score: number): ScoreOutput => ({
  score,
  recommendation: 'safe',
  reasonCodes: [],
  queryId: 't2',
  timestamp: 1_700_000_000,
  policyProfileId: 'balanced-v1',
  protocols: ['aave-v3'],
  attestation: {
    donId: 'LOCAL_PROTOTYPE_MODE',
    signature: 'UNVERIFIED_LOCAL_EXECUTION',
    verified: false,
    timestamp: 1_700_000_000,
    workflowId: 'privatesignal-local-harness',
    executionHash: '0x' + 'e'.repeat(64),
  },
})

afterEach(() => {
  clearAggregatorCache()
  global.fetch = setupFetch
})

// ── G1: policy profile strictness (distinct raw cutoffs post multiplier-removal) ─
describe('G1 — policy profiles enforce distinct score thresholds', () => {
  test('canonical thresholds are pairwise distinct and ordered conservative > balanced > aggressive', () => {
    const secrets = getDefaultSecretsForStyle('balanced')
    const thr = (pid: string): PolicyThresholds => resolvePolicy(pid, secrets).thresholds
    expect(thr('conservative-v1').safe).toBe(75)
    expect(thr('balanced-v1').safe).toBe(65)
    expect(thr('aggressive-v1').safe).toBe(55)
    expect(thr('conservative-v1').caution).toBe(50)
    expect(thr('balanced-v1').caution).toBe(40)
    expect(thr('aggressive-v1').caution).toBe(30)
    expect(thr('conservative-v1').highRisk).toBe(25)
    expect(thr('balanced-v1').highRisk).toBe(20)
    expect(thr('aggressive-v1').highRisk).toBe(15)
  })

  test('the SAME wallet is denied SAFE under conservative yet allowed under balanced and aggressive', async () => {
    const cons = await localScore('conservative-v1', MOD_GRAPH, 'conservative')
    const bal = await localScore('balanced-v1', MOD_GRAPH, 'balanced')
    const agg = await localScore('aggressive-v1', MOD_GRAPH, 'aggressive')

    expect(cons.score).toBe(65)
    expect(cons.recommendation).not.toBe('safe') // 65 < 75 → NOT safe under conservative

    expect(bal.score).toBe(69)
    expect(bal.recommendation).toBe('safe') // 69 >= 65 → safe under balanced

    expect(agg.score).toBe(66)
    expect(agg.recommendation).toBe('safe') // 66 >= 55 → safe under aggressive
  })
})

// ── G2: score determinism across profiles ─────────────────────────────────────
describe('G2 — score determinism', () => {
  test('identical input + identical sealed policy returns identical score, reasons and execution ref', async () => {
    // Determinism holds within a fixed queryId: the execution ref binds the queryId,
    // so identical (queryId, wallet, score, recommendation, timestamp) ⇒ identical ref.
    const a = await localScore('balanced-v1', MOD_GRAPH, 'balanced', 't2_det_fixed')
    const b = await localScore('balanced-v1', MOD_GRAPH, 'balanced', 't2_det_fixed')
    expect(a.score).toBe(b.score)
    expect(a.recommendation).toBe(b.recommendation)
    expect(a.reasonCodes).toEqual(b.reasonCodes)
    expect(a.attestation.executionHash).toBe(b.attestation.executionHash)
    expect(a.attestation.executionHash).toMatch(/^0x[0-9a-f]{32,64}$/)
  })

  test('a different queryId yields a different execution ref (ref binds the specific evaluation)', async () => {
    const a = await localScore('balanced-v1', MOD_GRAPH, 'balanced', 't2_qA')
    const b = await localScore('balanced-v1', MOD_GRAPH, 'balanced', 't2_qB')
    expect(a.score).toBe(b.score) // same math…
    expect(a.attestation.executionHash).not.toBe(b.attestation.executionHash) // …different binding
  })

  test('weight sets differ per profile so raw (unscaled) scores can differ', () => {
    const secrets = getDefaultSecretsForStyle('balanced')
    const w = (pid: string): number[] => resolvePolicy(pid, secrets).weights
    expect(w('conservative-v1')).not.toEqual(w('balanced-v1'))
    expect(w('balanced-v1')).not.toEqual(w('aggressive-v1'))
  })
})

// ── G3: DB privacy audit (SQLite stores only safe metadata) ──────────────────
describe('G3 — SQLite privacy audit', () => {
  test('queries table exposes only public metadata columns — never weights/thresholds/features', () => {
    saveQueryMetadata({
      queryId: `t2_privacy_${Date.now()}`,
      timestamp: Math.floor(Date.now() / 1000),
      walletAddress: WALLET,
      score: 84.5,
      recommendation: 'safe',
      protocols: 'aave-v3,morpho',
      donId: 'LOCAL_PROTOTYPE_MODE',
    })
    const cols: string[] = (
      getDatabase().prepare('PRAGMA table_info(queries)').all() as Array<{ name: string }>
    ).map((c) => c.name)

    expect(cols.sort()).toEqual(
      ['queryId', 'timestamp', 'walletAddress', 'score', 'recommendation', 'protocols', 'donId'].sort(),
    )
    const joined = cols.join(',')
    expect(joined).not.toMatch(/weight|threshold|profile|feature|model|multiplier/i)
  })
})

// ── G4 + G15: /api/score response shape (allowlist; sealed state never leaves) ─
describe('G4/G15 — /api/score HTTP boundary', () => {
  let server: any
  let baseUrl: string

  beforeAll(async () => {
    await new Promise<void>((resolveListen) => {
      server = app.listen(0, () => {
        const addr = server.address()
        const port = typeof addr === 'object' && addr ? addr.port : 3199
        baseUrl = `http://127.0.0.1:${port}`
        resolveListen()
      })
    })
  })

  afterAll(async () => {
    if (server) await new Promise<void>((r) => server.close(r))
  })

  test('200 body is an exact allowlist — no modelWeights/thresholds/policyProfiles/featuresSummary/ltvScore', async () => {
    const res = await fetch(`${baseUrl}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: WALLET, protocols: ['aave-v3'] }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>

    for (const key of [
      'score',
      'recommendation',
      'reasonCodes',
      'protocolsConsidered',
      'attestation',
      'attestationSummary',
      'queryId',
      'timestamp',
    ]) {
      expect(Object.keys(body)).toContain(key)
    }

    for (const forbidden of [
      'modelWeights',
      'thresholds',
      'policyProfiles',
      'featuresSummary',
      'ltvScore',
      'concentrationScore',
      'healthPressureIndex',
      'weightAdjustment',
      'multiplier',
      'graphData',
    ]) {
      expect(body).not.toHaveProperty(forbidden)
    }
    expect(JSON.stringify(body)).not.toMatch(/modelWeights|POLICY_THRESHOLDS|featuresSummary|weightAdjustment|multiplier/i)
  })

  test('attestation metadata is honest — verified:false, local DON, not claiming verified enclave', async () => {
    const res = await fetch(`${baseUrl}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: WALLET, protocols: ['aave-v3'] }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.attestation.verified).toBe(false)
    expect(body.attestation.donId).toBe('LOCAL_PROTOTYPE_MODE')
    expect(body.attestationSummary.status).not.toBe('VERIFIED_ENCLAVE_EXECUTION')
  })
})

// ── G5: gate rejects null / missing attestation ──────────────────────────────
describe('G5 — gate requires a complete attested ScoreOutput', () => {
  test('attestation:null throws GATE_ERROR', async () => {
    await expect(
      executeScoreGatedAction(STANDARD_CANDIDATE_ACTIONS.safe_allocation, { score: 100, attestation: null } as any, { dryRun: true }),
    ).rejects.toThrow('GATE_ERROR')
  })

  test('missing score field throws GATE_ERROR', async () => {
    await expect(
      executeScoreGatedAction(STANDARD_CANDIDATE_ACTIONS.safe_allocation, { recommendation: 'safe', attestation: {} } as any, { dryRun: true }),
    ).rejects.toThrow('GATE_ERROR')
  })

  test('complete local-prototype payload passes the gate (labeled unverified)', async () => {
    const r = await executeScoreGatedAction(STANDARD_CANDIDATE_ACTIONS.safe_allocation, mockScore(90), { dryRun: true })
    expect(r.passed).toBe(true)
    expect(r.status).toBe('SIMULATED_DRY_RUN')
  })
})

// ── G6: NL → profile → scorer integration ────────────────────────────────────
describe('G6 — natural language routing drives the scorer policy', () => {
  test('"conservative" keyword routes policyProfileId conservative and questionType risk_score', () => {
    const plan = routeToGraphQueryPlan(
      `Score cross-protocol risk for wallet ${WALLET} across Aave and Morpho under conservative policy`,
    )
    expect(plan.policyProfileId).toBe('conservative')
    expect(plan.questionType).toBe('risk_score')
    expect(plan.walletAddress).toBe(WALLET.toLowerCase())
    expect(plan.protocols).toContain('aave-v3')
  })

  test('routed conservative profile classifies the balanced-safe MOD wallet as NOT safe', async () => {
    const plan = routeToGraphQueryPlan(
      `Score cross-protocol risk for wallet ${WALLET} across Aave under conservative policy`,
    )
    const cons = await localScore(plan.policyProfileId, MOD_GRAPH, 'conservative')
    const bal = await localScore('balanced-v1', MOD_GRAPH, 'balanced')
    expect(bal.recommendation).toBe('safe')
    expect(cons.recommendation).not.toBe('safe')
  })
})

// ── G7: Graph schema normalization edge cases ────────────────────────────────
describe('G7 — graph normalization edge cases', () => {
  test('null account response from BOTH protocols normalizes to verified-empty, no fabricated positions', async () => {
    global.fetch = (async () =>
      new Response(JSON.stringify({ data: { account: null } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch

    const res = await aggregateLiveGraphData(WALLET, ['aave-v3', 'morpho'])
    expect(res.normalizedGraphData.dataComplete).toBe(true)
    expect(res.normalizedGraphData.totalCollateralUSD).toBe(0)
    expect(res.normalizedGraphData.totalDebtUSD).toBe(0)
  })

  test('zero-position (empty array) response is treated the same — not as fake collateral', async () => {
    global.fetch = (async () =>
      new Response(
        JSON.stringify({ data: { account: { id: WALLET.toLowerCase(), openPositionCount: 0, positions: [] } } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as unknown as typeof fetch

    const res = await aggregateLiveGraphData(WALLET, ['aave-v3', 'morpho'])
    expect(res.normalizedGraphData.dataComplete).toBe(true)
    expect(res.normalizedGraphData.totalCollateralUSD).toBe(0)
  })

  test('single-protocol outage fails closed instead of fabricating a default-safe portfolio', async () => {
    global.fetch = (async (input: any) => {
      const url = String(typeof input === 'string' ? input : input?.url || input)
      if (url.includes('JCNW')) {
        return new Response(
          JSON.stringify({ data: { account: null } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('8Lz')) {
        throw new Error('MORPHO_ENDPOINT_DOWN')
      }
      throw new Error('unknown endpoint')
    }) as unknown as typeof fetch

    await expect(aggregateLiveGraphData(WALLET, ['aave-v3', 'morpho'])).rejects.toThrow(
      'GRAPH_DATA_UNAVAILABLE',
    )
  })
})

// ── G8: large collateral + zero debt scores high ─────────────────────────────
describe('G8 — zero-debt wallet scoring', () => {
  test('large diversified collateral with zero debt scores >= 90 (SAFE)', async () => {
    const out = await localScore('balanced-v1', ZERO_DEBT_TWO_TOKEN, 'balanced')
    expect(out.score).toBeGreaterThanOrEqual(90)
    expect(out.recommendation).toBe('safe')
  })
})

// ── G9: zero-position verified wallet is deterministic; incomplete data closes ─
describe('G9 — verified-empty wallet determinism', () => {
  test('dataComplete verified-empty wallet scores deterministically (100 SAFE)', async () => {
    const a = await localScore('balanced-v1', EMPTY_VERIFIED, 'balanced', 't2_empty')
    const b = await localScore('balanced-v1', EMPTY_VERIFIED, 'balanced', 't2_empty')
    expect(a.score).toBe(100)
    expect(b.score).toBe(a.score)
    expect(b.reasonCodes).toEqual(a.reasonCodes)
    expect(b.attestation.executionHash).toBe(a.attestation.executionHash)
  })

  test('empty data WITHOUT dataComplete assertion fails closed (no default-safe score)', async () => {
    const { dataComplete: _omit, ...noAssertion } = EMPTY_VERIFIED
    await expect(localScore('balanced-v1', noAssertion, 'balanced')).rejects.toThrow('DATA_UNAVAILABLE')
  })
})

// ── G10: agent loop fails closed on graph outage ─────────────────────────────
describe('G10 — agent loop fail-closed on graph outage', () => {
  test('network failure during multi-protocol fetch aborts the loop with GRAPH_DATA_UNAVAILABLE', async () => {
    const baseFetch = setupFetch
    global.fetch = (async (input: any, init: any) => {
      const url = String(typeof input === 'string' ? input : input?.url || input)
      if (/gateway\.thegraph\.com|blue-api\.morpho\.org|JCNW|8Lz/.test(url)) {
        throw new Error('GRAPH_NETWORK_DOWN')
      }
      return (baseFetch as typeof fetch)(input, init)
    }) as unknown as typeof fetch

    const config: AgentConfig = {
      walletAddress: WALLET,
      policyThreshold: 65,
      candidateAction: 'none',
      dryRun: true,
    }
    await expect(runAgentLoop(config)).rejects.toThrow('GRAPH_DATA_UNAVAILABLE')
  })
})

// ── G11: attestation status field accuracy ───────────────────────────────────
describe('G11 — attestation status accuracy', () => {
  test('LOCAL_PROTOTYPE_MODE envelope is valid-for-local but never VERIFIED_ENCLAVE_EXECUTION', () => {
    const local = {
      donId: 'LOCAL_PROTOTYPE_MODE',
      workflowId: 'privatesignal-local-harness',
      executionHash: '0x' + 'a'.repeat(64),
      signature: 'UNVERIFIED_LOCAL_EXECUTION',
      timestamp: 1_700_000_000,
      verified: false,
    }
    const s = verifyAttestation(local, undefined, true)
    expect(s.valid).toBe(true)
    expect(s.verified).toBe(false)
    expect(s.status).not.toBe('VERIFIED_ENCLAVE_EXECUTION')
    expect(s.status).toBe('MISSING_ATTESTATION')
  })

  test('forged 0xattest_ envelope self-asserting verified:true is INVALID_ATTESTATION', () => {
    const forged = {
      donId: 'don-zone-a-production',
      workflowId: 'privatesignal-staging',
      executionHash: '0x' + 'b'.repeat(64),
      signature: '0xattest_' + 'c'.repeat(40),
      timestamp: 1_500_000_000,
      verified: true,
    }
    const s = verifyAttestation(forged, undefined, true)
    expect(s.valid).toBe(false)
    expect(s.status).toBe('INVALID_ATTESTATION')
  })
})

// ── G12: rate limiter 429 body shape ─────────────────────────────────────────
describe('G12 — rate limiter body shape', () => {
  test('exceeding the per-IP window returns 429 { error, message }', () => {
    let statusCode = 0
    let body: any = null
    const req: any = { headers: { 'x-forwarded-for': '203.0.113.99' }, socket: {} }
    const res: any = {
      status(c: number) {
        statusCode = c
        return res
      },
      json(b: unknown) {
        body = b
        return res
      },
    }
    for (let i = 0; i < 11; i++) {
      rateLimitMiddleware(req, res, () => {})
    }
    expect(statusCode).toBe(429)
    expect(body).not.toBeNull()
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED')
    expect(typeof body.message).toBe('string')
    expect(body.message.length).toBeGreaterThan(0)
  })
})

// ── G13: gate boundary values ────────────────────────────────────────────────
describe('G13 — gate boundary values', () => {
  const candidate: CandidateAction = {
    id: 'act_boundary',
    name: 'Boundary Action',
    description: 'threshold 65',
    threshold: 65,
    amountUSDC: 0.1,
    recipient: '0x3333333333333333333333333333333333333333',
  }

  test('score == threshold passes', async () => {
    const r = await executeScoreGatedAction(candidate, mockScore(65), { dryRun: true })
    expect(r.passed).toBe(true)
  })

  test('score == threshold - 1 is blocked', async () => {
    const r = await executeScoreGatedAction(candidate, mockScore(64), { dryRun: true })
    expect(r.passed).toBe(false)
    expect(r.status).toBe('BLOCKED_BY_RISK_POLICY')
  })
})

// ── G14: CRE workflow source / deployment receipt accuracy ───────────────────
describe('G14 — CRE workflow source & deployment receipt accuracy', () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const read = (rel: string) => readFileSync(resolve(repoRoot, rel), 'utf8')

  test('workflow source registers a confidential handler via handlerInTee with a Nitro TEE constraint', () => {
    const wf = read('privatesignal/workflow.ts')
    expect(wf).toContain('handlerInTee')
    expect(wf).toMatch(/tee:\s*['"]nitro['"]/)
    expect(wf).toContain('loadSecretsFromProvider')
  })

  test('staging targets the Chainlink-hosted private registry with recorded workflow id 00cd6793', () => {
    const yaml = read('privatesignal/workflow.yaml')
    expect(yaml).toMatch(/deployment-registry:\s*["']?private["']?/)
    // testing2 expected the workflow id inside workflow.yaml; the actual repo keeps the
    // private-registry receipt (including the 00cd6793 workflow id) in the evidence dossier.
    const evidence = read('docs/deployment-evidence.md')
    expect(evidence).toContain('00cd6793')
    expect(evidence).toContain('private-registry')
  })
})

// ── auxiliary: honest local envelope still gated on allow path ───────────────
describe('Attestation-bound gate — complete payload required end-to-end', () => {
  test('full ScoreOutput allow path produces dry-run evidence without fabricated tx hash', async () => {
    const r = await executeScoreGatedAction(STANDARD_CANDIDATE_ACTIONS.safe_allocation, mockScore(90), { dryRun: true })
    expect(r.status).toBe('SIMULATED_DRY_RUN')
    expect(r.transactionHash).toBeUndefined() // honest: no tx in dry run
  })
})
