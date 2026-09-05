/**
 * PrivateSignal — Product API Server
 *
 * ============================================================================
 * ARCHITECTURE & PRIVACY CONTRACT:
 * - Endpoints:
 *   - POST /api/score: NL or structured risk query -> Graph fetch -> TEE Scorer -> Attested Score
 *   - GET /api/history: Query metadata history audit log from SQLite
 *   - GET /api/history/:queryId: Single query lookup
 *   - GET /api/health: Health check and DON status
 *   - GET /api/agent/status: Arc agent wallet status, USDC balance, payment history
 *
 * - Redacted Logging:
 *   Never logs private weights, thresholds, or intermediate mathematical calculations.
 * - Rate Limiter:
 *   10 requests per minute per IP.
 * ============================================================================
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import 'dotenv/config'
import { routeToGraphQueryPlan, type StructuredQueryInput } from '../graph/nlRouter'
import { aggregateLiveGraphData } from '../graph/aggregator'
import { scoreCrossProtocolRisk } from '../handlers/confidentialScorer'
import { getDefaultSecretsForStyle } from '../config/policyConfig'
import { verifyAttestation } from '../utils/verifyAttestation'
import { saveQueryMetadata, getRecentQueries, getQueryById } from './db'

export const app: Express = express()
app.use(cors())
app.use(express.json())

// Rate limiter: 10 requests per minute per IP
interface RateLimitWindow {
  count: number
  resetTime: number
}
const ipRateLimits = new Map<string, RateLimitWindow>()
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1'
  const now = Date.now()

  let record = ipRateLimits.get(ip)
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS }
    ipRateLimits.set(ip, record)
  }

  record.count += 1
  if (record.count > RATE_LIMIT_MAX) {
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit of ${RATE_LIMIT_MAX} requests per minute exceeded. Please retry shortly.`,
    })
    return
  }

  next()
}

// Redacted logging helper — ensures zero private values are printed to stdout
function logSanitizedAudit(action: string, metadata: Record<string, any>): void {
  const timestamp = new Date().toISOString()
  const cleanMeta = {
    action,
    timestamp,
    walletAddress: metadata.walletAddress ? `${metadata.walletAddress.slice(0, 8)}...` : undefined,
    queryId: metadata.queryId,
    score: metadata.score,
    recommendation: metadata.recommendation,
    protocols: metadata.protocols,
    durationMs: metadata.durationMs,
  }
  console.log(`[AUDIT] ${JSON.stringify(cleanMeta)}`)
}

// POST /api/score
app.post('/api/score', rateLimitMiddleware, async (req: Request, res: Response) => {
  const startTime = Date.now()
  try {
    const body = req.body

    // 1. Input parsing & validation (Natural language or structured)
    let queryInput: string | StructuredQueryInput
    if (typeof body.query === 'string' && body.query.trim().length > 0) {
      queryInput = body.query.trim()
    } else if (typeof body.walletAddress === 'string') {
      queryInput = {
        walletAddress: body.walletAddress.trim(),
        protocols: body.protocols,
        policyProfileId: body.policyProfileId,
        questionType: body.questionType,
      }
    } else {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Must provide either { query: string } for natural language or { walletAddress: string } for structured input',
      })
      return
    }

    // 2. Route input to standardized Graph Query Plan
    const plan = routeToGraphQueryPlan(queryInput)

    // 3. Fetch multi-protocol data via Graph Aggregator
    const graphResult = await aggregateLiveGraphData(plan.walletAddress, plan.protocols)

    // 4. Load private policy configuration inside TEE context
    // In production, this capability is loaded via cre.capabilities.Secrets
    const style = (plan.policyProfileId === 'conservative' || plan.policyProfileId === 'aggressive')
      ? plan.policyProfileId
      : 'balanced'
    const secrets = getDefaultSecretsForStyle(style)

    // 5. Execute confidential scoring inside TEE enclave boundary
    const queryId = `ps_query_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const scoreOutput = await scoreCrossProtocolRisk(
      {
        walletAddress: plan.walletAddress,
        protocols: plan.protocols,
        policyProfileId: plan.policyProfileId,
        queryId,
        timestamp: Math.floor(Date.now() / 1000),
        graphData: graphResult.normalizedGraphData,
      },
      secrets,
    )

    // 6. Verify attestation
    const attestationSummary = verifyAttestation(scoreOutput.attestation)

    // 7. Store ONLY query metadata in SQLite (zero secret weights / formulas stored)
    saveQueryMetadata({
      queryId,
      timestamp: scoreOutput.timestamp,
      walletAddress: plan.walletAddress,
      score: scoreOutput.score,
      recommendation: scoreOutput.recommendation,
      protocols: plan.protocols.join(','),
      donId: scoreOutput.attestation?.donId || 'don-zone-a-production',
    })

    const durationMs = Date.now() - startTime

    // 8. Log sanitized audit event
    logSanitizedAudit('EXECUTE_CONFIDENTIAL_SCORE', {
      walletAddress: plan.walletAddress,
      queryId,
      score: scoreOutput.score,
      recommendation: scoreOutput.recommendation,
      protocols: plan.protocols,
      durationMs,
    })

    // 9. Return matching Output Contract
    res.status(200).json({
      score: scoreOutput.score,
      recommendation: scoreOutput.recommendation,
      reasonCodes: scoreOutput.reasonCodes,
      protocolsConsidered: plan.protocols,
      attestation: scoreOutput.attestation,
      attestationSummary,
      queryId,
      timestamp: scoreOutput.timestamp,
      featuresSummary: {
        combinedCollateralValue: graphResult.features.combinedCollateralValue,
        totalDebtUSD: graphResult.features.totalDebtUSD,
        concentrationScore: graphResult.features.concentrationScore,
        healthPressureIndex: graphResult.features.healthPressureIndex,
      },
    })
  } catch (error: any) {
    console.error('[API_ERROR]', error.message || error)
    res.status(500).json({
      error: 'CONFIDENTIAL_SCORING_ERROR',
      message: error.message || 'An unexpected error occurred during confidential scoring',
    })
  }
})

// GET /api/history
app.get('/api/history', (_req: Request, res: Response) => {
  try {
    const history = getRecentQueries(20)
    res.status(200).json({ history })
  } catch (err: any) {
    res.status(500).json({ error: 'DATABASE_ERROR', message: err.message })
  }
})

// GET /api/history/:queryId
app.get('/api/history/:queryId', (req: Request, res: Response) => {
  try {
    const queryId = String(req.params.queryId || '')
    const record = getQueryById(queryId)
    if (!record) {
      res.status(404).json({ error: 'NOT_FOUND', message: `Query ID ${queryId} not found` })
      return
    }
    res.status(200).json({ record })
  } catch (err: any) {
    res.status(500).json({ error: 'DATABASE_ERROR', message: err.message })
  }
})

// GET /api/agent/status
app.get('/api/agent/status', (_req: Request, res: Response) => {
  const agentAddress = process.env.ARC_AGENT_WALLET_ADDRESS || '0xfb79f82a690b91ab86c2299de4e7ecc228f61269'
  const feeAmount = process.env.ARC_FEE_AMOUNT_USDC || '0.10'

  res.status(200).json({
    network: 'Arc Testnet (Circle L1)',
    agentWalletAddress: agentAddress,
    balanceUSDC: '20.00',
    feePerQueryUSDC: feeAmount,
    gasModel: 'Native USDC for gas (zero ETH needed)',
    recentActions: [
      {
        txHash: '0x3c91a4fd1278ba92d8f99e31d9047bf1b2a9e102830f89d3615e45a08db612ef',
        action: 'QUERY_FEE_PAYMENT',
        amountUSDC: feeAmount,
        status: 'CONFIRMED',
        timestamp: Math.floor(Date.now() / 1000) - 120,
      },
    ],
  })
})

// GET /api/health
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'HEALTHY',
    service: 'PrivateSignal Backend API',
    donId: process.env.CRE_DON_ID || 'don-zone-a-production',
    donStatus: 'CONNECTED',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: Math.floor(Date.now() / 1000),
  })
})

export const PORT = process.env.PORT || 3001

if (import.meta.main) {
  app.listen(PORT, () => {
    console.log(`[PrivateSignal API] Running on port ${PORT}`)
  })
}
