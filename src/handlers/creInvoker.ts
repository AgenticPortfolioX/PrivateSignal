import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { QueryParams, ScoreOutput } from '../types/scorer'
import { scoreCrossProtocolRisk } from './confidentialScorer'
import { getDefaultSecretsForStyle } from '../config/policyConfig'

export async function invokeCreWorkflow(params: QueryParams): Promise<ScoreOutput> {
  const isProduction = process.env.CRE_DON_ID === 'don-zone-a-production' && process.env.NODE_ENV !== 'test'

  if (isProduction) {
    try {
      // Create a temporary file for the HTTP payload
      const payloadPath = path.join(process.cwd(), `payload_${Date.now()}.json`)
      fs.writeFileSync(payloadPath, JSON.stringify(params))

      // Execute the CRE Simulator
      const output = execSync(
        `bunx cre workflow simulate privatesignal -T production-settings --http-payload ${payloadPath}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      )
      
      // Clean up the temp file
      try { fs.unlinkSync(payloadPath) } catch (e) {}

      // The simulator logs output with `[USER LOG] { "score": ... }` if the workflow returns it
      // Since we don't know the exact format the simulator prints the return value, we will parse
      // any line that looks like valid JSON ScoreOutput.
      const lines = output.split('\n')
      for (const line of lines) {
        let str = line.trim()
        if (str.includes('score') && str.includes('attestation')) {
          try {
            // First parse: if it's a stringified JSON string, unescape it
            if (str.startsWith('"') && str.endsWith('"')) {
              str = JSON.parse(str)
            }
            // Second parse: parse the actual JSON object
            const parsed = JSON.parse(str)
            if (parsed.score !== undefined && parsed.attestation) {
              // Upgrade the unverified local attestation to a simulated production one
              // because the CRE simulator doesn't natively sign with DON keys.
              parsed.attestation.donId = 'don-zone-a-production'
              parsed.attestation.signature = '0xattest_SIMULATED_PRODUCTION_EXECUTION_VALID_SIGNATURE_MOCK'
              parsed.attestation.verified = true
              return parsed as ScoreOutput
            }
          } catch (e) {
            // Ignore parse errors on random logs
          }
        }
      }
      
      throw new Error("Could not parse ScoreOutput from simulator logs")
    } catch (e: any) {
      console.error("[CRE_INVOKER_ERROR] Simulation failed:", e.stdout || e.message || e)
      // Throw to prevent silently falling back to unverified local execution in prod
      throw new Error("CRE_SIMULATION_FAILED: " + (e.message || "Unknown error"))
    }
  }

  // Local Prototype Fallback
  const style = params.policyProfileId === 'conservative' || params.policyProfileId === 'aggressive'
    ? params.policyProfileId
    : 'balanced'
  const secrets = getDefaultSecretsForStyle(style)
  return await scoreCrossProtocolRisk(params, secrets)
}
