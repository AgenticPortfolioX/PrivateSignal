/**
 * PrivateSignal CRE Workflow Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  configSchema,
  initWorkflow,
  safeBase64Encode,
  safeBase64Decode,
  receiverAbi,
} from '../privatesignal/workflow'
import { encodeFunctionData, pad, stringToHex, type Hex } from 'viem'
import stagingConfig from '../privatesignal/config.staging.json'
import prodConfig from '../privatesignal/config.production.json'
import localConfig from '../privatesignal/config.local.json'

describe('PrivateSignal CRE Workflow', () => {
  it('validates configuration schemas', () => {
    expect(() => configSchema.parse(stagingConfig)).not.toThrow()
    expect(() => configSchema.parse(prodConfig)).not.toThrow()
    expect(() => configSchema.parse(localConfig)).not.toThrow()

    const parsed = configSchema.parse(stagingConfig)
    expect(parsed.signalId).toBe('SIG-ALPHA-01')
    expect(parsed.confidenceThresholdBps).toBe(7500)
  })

  it('rejects invalid confidence thresholds outside 0-10000 bps', () => {
    const invalid = {
      ...stagingConfig,
      confidenceThresholdBps: 15000,
    }
    expect(() => configSchema.parse(invalid)).toThrow()
  })

  it('verifies QuickJS-compatible Base64 encoder/decoder roundtrip', () => {
    const samplePayload = JSON.stringify({
      signalId: 'TEST-SIG-99',
      value: 123.456,
      meta: 'confidential-signal-bytes',
    })

    const encoded = safeBase64Encode(samplePayload)
    expect(encoded.length).toBeGreaterThan(0)

    const decoded = safeBase64Decode(encoded)
    expect(decoded).toBe(samplePayload)
  })

  it('initializes workflow with cron capability trigger', () => {
    const handlers = initWorkflow(stagingConfig)
    expect(Array.isArray(handlers)).toBe(true)
    expect(handlers.length).toBe(1)
  })

  it('encodes receiver contract calldata correctly with viem', () => {
    const signalIdHex = pad(stringToHex('SIG-ALPHA-01'), { size: 32, dir: 'right' }) as Hex
    const timestamp = 1757000000n
    const signalValue = 10000000000n
    const confidenceBps = 7500n
    const metadataHex = '0x1234' as Hex

    const callData = encodeFunctionData({
      abi: receiverAbi,
      functionName: 'onSignalUpdate',
      args: [signalIdHex, timestamp, signalValue, confidenceBps, metadataHex],
    })

    expect(callData.startsWith('0x')).toBe(true)
    expect(callData.length).toBeGreaterThan(10)
  })
})
