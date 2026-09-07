import { describe, it, expect } from 'bun:test'
import { rateLimitMiddleware } from '../src/api/server'
import { verifyAttestation } from '../src/utils/verifyAttestation'

describe('Security & Edge Case Tests', () => {
  describe('Rate Limiter', () => {
    it('blocks requests after exceeding rate limit window', () => {
      let statusCalled = 0
      let nextCalled = 0
      
      const mockReq = (ip: string) => ({
        headers: { 'x-forwarded-for': ip },
        socket: {}
      } as any)
      
      const mockRes = () => {
        const res: any = {}
        res.status = (code: number) => {
          statusCalled = code
          return res
        }
        res.json = (obj: any) => {}
        return res
      }
      
      const mockNext = () => { nextCalled++ }
      
      const ip = '192.168.1.100'
      const req = mockReq(ip)
      const res = mockRes()
      
      // Hit limit 10 times
      for (let i = 0; i < 10; i++) {
        rateLimitMiddleware(req, res, mockNext)
      }
      expect(nextCalled).toBe(10)
      
      // 11th request should be blocked (429)
      rateLimitMiddleware(req, res, mockNext)
      expect(statusCalled).toBe(429)
      expect(nextCalled).toBe(10)
    })
  })

  describe('Attestation Verification', () => {
    it('rejects tampered or forged execution hashes', () => {
      const validEnvelope = {
        executionHash: '0x1234567812345678123456781234567812345678123456781234567812345678',
        donId: 'LOCAL_PROTOTYPE_MODE',
        workflowId: 'privatesignal-local-harness',
        verified: false
      }
      
      // The local harness hardcodes verified: false, so it will always "pass" as a prototype.
      // But if we override it to true without a valid signature (we don't have ECDSA signatures in local mode),
      // the verifyAttestation should flag it, but verifyAttestation currently just respects verified flag
      // Wait, verifyAttestation checks for real signatures if not local prototype.
      const forgedEnvelope = { ...validEnvelope, donId: 'don-production', verified: true }
      const summary = verifyAttestation(forgedEnvelope, undefined, true)
      expect(summary.valid).toBe(false)
      expect(summary.status).toBe('INVALID_ATTESTATION')
    })
  })
})
