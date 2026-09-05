/**
 * PrivateSignal — API Server & Attestation Verification Tests
 *
 * Tests:
 * 1. Attestation Verification Helper (src/utils/verifyAttestation.ts)
 * 2. SQLite Metadata Storage (src/api/db.ts)
 * 3. Product API Endpoints (src/api/server.ts)
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'bun:test'
import { verifyAttestation, formatAttestationForDisplay } from '../src/utils/verifyAttestation'
import { saveQueryMetadata, getQueryById, getRecentQueries, getDatabase } from '../src/api/db'
import { app } from '../src/api/server'

describe('PrivateSignal: API Server & Attestation Verification', () => {
  const sampleWallet = '0x1111111111111111111111111111111111111111'

  describe('Task 2: Attestation Verification Helper', () => {
    it('verifies valid Chainlink CRE attestation envelope', () => {
      const validAttestation = {
        donId: 'don-zone-a-production',
        workflowId: 'privatesignal-confidential-v1',
        executionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        signature: '0xattest_1234567890abcdef1234567890abcdef',
        timestamp: 1757000000,
        verified: true,
      }

      const summary = verifyAttestation(validAttestation)
      expect(summary.valid).toBe(true)
      expect(summary.verified).toBe(true)
      expect(summary.status).toBe('VERIFIED_ENCLAVE_EXECUTION')
      expect(summary.donId).toBe('don-zone-a-production')
      expect(summary.workflowId).toBe('privatesignal-confidential-v1')
      expect(summary.shortHash).toContain('0x1234')
      expect(summary.formattedTimestamp).toContain('2025')
    })

    it('rejects tampered execution hashes', () => {
      const tamperedAttestation = {
        donId: 'don-zone-a-production',
        workflowId: 'privatesignal-confidential-v1',
        executionHash: '0xTAMPERED_HASH',
        signature: '0xattest_1234567890abcdef',
        timestamp: 1757000000,
        verified: true,
      }

      const summary = verifyAttestation(tamperedAttestation, '0xEXPECTED_AUTHENTIC_HASH')
      expect(summary.valid).toBe(false)
      expect(summary.verified).toBe(false)
      expect(summary.status).toBe('INVALID_ATTESTATION')
    })

    it('gracefully handles missing or null attestation payload', () => {
      const summary = verifyAttestation(null)
      expect(summary.valid).toBe(false)
      expect(summary.status).toBe('MISSING_ATTESTATION')
    })

    it('formats attestation key-value pairs for frontend display', () => {
      const validAttestation = {
        donId: 'don-zone-a-production',
        workflowId: 'privatesignal-confidential-v1',
        executionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        signature: '0xattest_1234567890abcdef1234567890abcdef',
        timestamp: 1757000000,
        verified: true,
      }

      const summary = verifyAttestation(validAttestation)
      const display = formatAttestationForDisplay(summary)

      expect(display['Enclave Status']).toContain('VERIFIED')
      expect(display['DON Identifier']).toBe('don-zone-a-production')
      expect(display['Workflow ID']).toBe('privatesignal-confidential-v1')
    })
  })

  describe('Task 1: Query Metadata SQLite Storage', () => {
    it('persists and retrieves query metadata without leaking private values', () => {
      const queryId = `test_query_${Date.now()}`
      saveQueryMetadata({
        queryId,
        timestamp: Math.floor(Date.now() / 1000),
        walletAddress: sampleWallet,
        score: 84.5,
        recommendation: 'safe',
        protocols: 'aave-v3,morpho',
        donId: 'don-zone-a-production',
      })

      const record = getQueryById(queryId)
      expect(record).not.toBeNull()
      expect(record?.queryId).toBe(queryId)
      expect(record?.walletAddress).toBe(sampleWallet.toLowerCase())
      expect(record?.score).toBe(84.5)
      expect(record?.recommendation).toBe('safe')

      const recent = getRecentQueries(5)
      expect(recent.length).toBeGreaterThan(0)
      expect(recent.some((r) => r.queryId === queryId)).toBe(true)
    })
  })

  describe('Task 1: Product API Server Endpoints', () => {
    let server: any
    let baseUrl: string

    beforeAll(async () => {
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
          const addr = server.address()
          const port = typeof addr === 'object' && addr ? addr.port : 3099
          baseUrl = `http://127.0.0.1:${port}`
          resolve()
        })
      })
    })

    afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(resolve))
      }
    })

    it('GET /api/health returns healthy DON connection status', async () => {
      const res = await fetch(`${baseUrl}/api/health`)
      expect(res.status).toBe(200)

      const json = (await res.json()) as any
      expect(json.status).toBe('HEALTHY')
      expect(json.service).toContain('PrivateSignal')
      expect(json.donStatus).toBe('CONNECTED')
    })

    it('GET /api/agent/status returns Arc native USDC details', async () => {
      const res = await fetch(`${baseUrl}/api/agent/status`)
      expect(res.status).toBe(200)

      const json = (await res.json()) as any
      expect(json.network).toContain('Arc Testnet')
      expect(json.balanceUSDC).toBe('20.00')
      expect(json.gasModel).toContain('Native USDC')
    })

    it('POST /api/score evaluates risk from natural language query and stores metadata', async () => {
      const payload = {
        query: `Score cross-protocol risk for wallet ${sampleWallet} across Aave and Morpho under conservative policy`,
      }

      const res = await fetch(`${baseUrl}/api/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      expect(res.status).toBe(200)

      const json = (await res.json()) as any
      expect(json.score).toBeGreaterThanOrEqual(0)
      expect(json.score).toBeLessThanOrEqual(100)
      expect(['safe', 'caution', 'high_risk']).toContain(json.recommendation)
      expect(json.protocolsConsidered).toContain('aave-v3')
      expect(json.attestation.workflowId).toBe('privatesignal-confidential-v1')
      expect(json.attestationSummary.valid).toBe(true)
      expect(json.queryId).toBeDefined()

      // Confirm stored in SQLite
      const stored = getQueryById(json.queryId)
      expect(stored).not.toBeNull()
      expect(stored?.score).toBe(json.score)
    })

    it('POST /api/score supports structured JSON queries', async () => {
      const payload = {
        walletAddress: sampleWallet,
        protocols: ['aave-v3'],
        policyProfileId: 'aggressive',
      }

      const res = await fetch(`${baseUrl}/api/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      expect(res.status).toBe(200)

      const json = (await res.json()) as any
      expect(json.protocolsConsidered).toEqual(['aave-v3'])
      expect(json.score).toBeGreaterThanOrEqual(0)
    })

    it('POST /api/score rejects invalid empty requests', async () => {
      const res = await fetch(`${baseUrl}/api/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
      const json = (await res.json()) as any
      expect(json.error).toBe('INVALID_REQUEST')
    })
  })
})
