import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { QueryParams, ScoreOutput } from '../types/scorer'
import { scoreCrossProtocolRisk } from './confidentialScorer'
import { getDefaultSecretsForStyle } from '../config/policyConfig'

export async function invokeCreWorkflow(params: QueryParams): Promise<ScoreOutput> {
  const isProduction = Boolean(
    process.env.CRE_API_ENDPOINT &&
    process.env.CRE_DON_ID === 'don-zone-a-production' &&
    process.env.NODE_ENV !== 'test'
  )

  if (isProduction) {
    const endpoint = process.env.CRE_API_ENDPOINT!

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // If the gateway requires an API key, we would pass it here
          // 'Authorization': `Bearer ${process.env.CRE_API_KEY}`
        },
        body: JSON.stringify(params)
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const text = await response.text()
      try {
        // Try parsing assuming the endpoint directly returns the stringified ScoreOutput
        const parsed = JSON.parse(text)
        if (typeof parsed === 'string') {
           return JSON.parse(parsed) as ScoreOutput
        }
        return parsed as ScoreOutput
      } catch (e) {
        throw new Error("Failed to parse ScoreOutput from live CRE endpoint: " + text)
      }
    } catch (e: any) {
      console.error("[CRE_INVOKER_ERROR] Live CRE invocation failed:", e.message || e)
      throw new Error("CRE_INVOCATION_FAILED: " + (e.message || "Unknown error"))
    }
  }

  // Local Prototype Fallback
  const style = params.policyProfileId === 'conservative' || params.policyProfileId === 'aggressive'
    ? params.policyProfileId
    : 'balanced'
  const secrets = getDefaultSecretsForStyle(style)
  return await scoreCrossProtocolRisk(params, secrets)
}
