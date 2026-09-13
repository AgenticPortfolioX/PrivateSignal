/**
 * @title PrivateSignal Product API
 * @author Justin Gramke
 * @notice Provides HTTP endpoints for routing score evaluations and retrieving audit history.
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import 'dotenv/config'
import { routeToGraphQueryPlan, type StructuredQueryInput } from '../graph/nlRouter'
import { aggregateLiveGraphData } from '../graph/aggregator'
import { invokeCreWorkflow } from '../handlers/creInvoker'
import { getDefaultSecretsForStyle } from '../config/policyConfig'
import { verifyAttestation } from '../utils/verifyAttestation'
import { saveQueryMetadata, getRecentQueries, getQueryById } from './db'
import { getArcBalance, getAgentAccount } from '../arc/agentWallet'
import { runAgentLoop, type AgentConfig } from '../arc/agentLoop'
import { STANDARD_CANDIDATE_ACTIONS } from '../arc/gatedAction'

export const app: Express = express()
app.use(cors())
app.use(express.json())
app.set('json replacer', (_key: string, value: any) =>
  typeof value === 'bigint' ? value.toString() : value
)


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


app.post('/api/score', rateLimitMiddleware, async (req: Request, res: Response) => {
  const startTime = Date.now()
  try {
    const body = req.body

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

    const plan = routeToGraphQueryPlan(queryInput)

    const graphResult = await aggregateLiveGraphData(plan.walletAddress, plan.protocols)


    const style = (plan.policyProfileId === 'conservative' || plan.policyProfileId === 'aggressive')
      ? plan.policyProfileId
      : 'balanced'
    const secrets = getDefaultSecretsForStyle(style)

    const queryId = `ps_query_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const scoreOutput = await invokeCreWorkflow({
      walletAddress: plan.walletAddress,
      protocols: plan.protocols,
      policyProfileId: plan.policyProfileId,
      queryId,
      timestamp: Math.floor(Date.now() / 1000),
      graphData: graphResult.normalizedGraphData,
    })

    const attestationSummary = verifyAttestation(scoreOutput.attestation, undefined, true)

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

    logSanitizedAudit('EXECUTE_CONFIDENTIAL_SCORE', {
      walletAddress: plan.walletAddress,
      queryId,
      score: scoreOutput.score,
      recommendation: scoreOutput.recommendation,
      protocols: plan.protocols,
      durationMs,
    })

    res.status(200).json({
      score: scoreOutput.score,
      recommendation: scoreOutput.recommendation,
      reasonCodes: scoreOutput.reasonCodes,
      protocolsConsidered: plan.protocols,
      attestation: scoreOutput.attestation,
      attestationSummary,
      queryId,
      timestamp: scoreOutput.timestamp,
    })
  } catch (error: any) {
    console.error('[API_ERROR]', error.message || error)
    res.status(500).json({
      error: 'CONFIDENTIAL_SCORING_ERROR',
      message: error.message || 'An unexpected error occurred during confidential scoring',
    })
  }
})


app.get('/api/history', (_req: Request, res: Response) => {
  try {
    const history = getRecentQueries(20)
    res.status(200).json({ history })
  } catch (err: any) {
    res.status(500).json({ error: 'DATABASE_ERROR', message: err.message })
  }
})


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


app.get('/api/agent/status', async (_req: Request, res: Response) => {
  try {
    let agentAddress = process.env.ARC_AGENT_WALLET_ADDRESS || '0xfb79f82a690b91ab86c2299de4e7ecc228f61269'
    try {
      const account = getAgentAccount()
      if (!process.env.ARC_AGENT_WALLET_ADDRESS) {
        agentAddress = account.address
      }
    } catch {
      // Fallback to configured address
    }
    let balanceFormatted = '20.00'
    let balanceRaw = '20000000000000000000'
    let isLive = false

    try {
      const balanceInfo = await getArcBalance(agentAddress)
      balanceFormatted = balanceInfo.balanceFormatted
      balanceRaw = balanceInfo.balanceWei.toString()
      isLive = true
    } catch {
      // Graceful fallback if offline
    }

    const availableActions = Object.values(STANDARD_CANDIDATE_ACTIONS).map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      type: a.type,
      threshold: a.threshold,
      requiredScore: a.requiredScore,
      amountUSDC: a.amountUSDC,
      policyProfileId: a.policyProfileId,
    }))

    const c = {
      reset: '\x1b[0m',
      green: '\x1b[32m',
      cyan: '\x1b[36m'
    }
    
    console.log(`\n[AGENT_STATUS] ${c.green}[SUCCESS]${c.reset} Queried Arc Testnet Treasury Address: ${c.cyan}${agentAddress}${c.reset}`)
    console.log(`[AGENT_STATUS] ${c.green}[SUCCESS]${c.reset} Native USDC Balance: ${c.cyan}$${balanceFormatted} USDC${c.reset}`)
    console.log(`[AGENT_STATUS] ${c.green}[SUCCESS]${c.reset} Registered Policies: ${c.cyan}${availableActions.length} candidate actions active${c.reset}\n`)

    res.status(200).json({
      network: 'Arc Testnet (Circle L1)',
      chainId: 5042002,
      agentWalletAddress: agentAddress,
      balanceUSDC: balanceFormatted,
      balanceRaw,

      gasModel: 'Native USDC for gas (zero ETH needed)',
      paymasterSupport: 'Arc native gas model natively uses USDC without separate paymaster contract',
      liveRpcConnected: isLive,
      availableActions,
      recentActions: [],
    })
  } catch (err: any) {
    res.status(500).json({ error: 'AGENT_STATUS_ERROR', message: err.message })
  }
})


app.post('/api/agent/run', rateLimitMiddleware, async (req: Request, res: Response) => {
  try {
    if (process.env.AGENT_RUN_TOKEN) {
      const auth = req.headers.authorization
      if (!auth || auth !== `Bearer ${process.env.AGENT_RUN_TOKEN}`) {
        res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or missing AGENT_RUN_TOKEN' })
        return
      }
    }
    const body = req.body || {}
    const walletAddress = typeof body.walletAddress === 'string' && body.walletAddress.trim().length > 0
      ? body.walletAddress.trim()
      : '0x1111111111111111111111111111111111111111'

    const policyThreshold = typeof body.policyThreshold === 'number'
      ? Math.max(0, Math.min(100, body.policyThreshold)) // Bound 0-100
      : 70

    const validActions = ['treasury_release', 'credit_draw', 'settlement_release', 'allocate', 'transfer', 'none']
    const candidateAction = validActions.includes(body.candidateAction)
      ? body.candidateAction
      : 'treasury_release'

    const actionAmountUSDC = typeof body.actionAmountUSDC === 'number'
      ? Math.min(10, Math.max(0, body.actionAmountUSDC)) // Hard cap amount to 10 USDC for safety
      : undefined

    const config: AgentConfig = {
      walletAddress,
      policyThreshold,
      candidateAction,
      actionType: body.actionType,
      queryString: body.queryString,
      protocols: Array.isArray(body.protocols) ? body.protocols : undefined,
      policyProfileId: body.policyProfileId,
      actionAmountUSDC,
      actionDestination: body.actionDestination || body.toRecipient,
      recipientAddress: body.toRecipient || body.actionDestination,
      dryRun: Boolean(body.dryRun),
    }

    const result = await runAgentLoop(config)
    res.status(200).json(result)
  } catch (err: any) {
    console.error('[AGENT_RUN_ERROR]', err)
    res.status(500).json({
      error: 'AGENT_RUN_ERROR',
      message: err.message || 'An error occurred during agent loop execution',
    })
  }
})


app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'HEALTHY',
    service: 'PrivateSignal Backend API',
    donId: process.env.CRE_DON_ID || 'LOCAL_PROTOTYPE_MODE',
    donStatus: process.env.CRE_DON_ID ? 'CONNECTED' : 'LOCAL_PROTOTYPE_MODE',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: Math.floor(Date.now() / 1000),
  })
})

app.post('/api/test-results', (req: Request, res: Response) => {
  if (req.body.message) {
    console.log(`\n\x1b[32m${req.body.message}\x1b[0m\n`);
  }
  res.status(200).send('OK')
})

export const PORT = process.env.PORT || 3001

if (import.meta.main) {
  app.listen(PORT, () => {
    console.log(`[PrivateSignal API] Running on port ${PORT}`)
  })
}
