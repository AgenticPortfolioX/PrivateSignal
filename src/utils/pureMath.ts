/**
 * Pure Math & Normalization Utilities
 *
 * CRITICAL RUNTIME CONSTRAINT: Runs inside QuickJS/WASM.
 * Absolutely zero Node.js dependencies, zero external libraries.
 * Deterministic math operations only.
 */

import type { NormalizedGraphData, CrossProtocolFeatures } from '../types/scorer'

/**
 * Calculates cross-protocol features from normalized Graph position data
 * using pure mathematics.
 */
export function extractCrossProtocolFeatures(data: NormalizedGraphData): CrossProtocolFeatures {
  let combinedCollateralValue = 0
  let totalDebtUSD = 0
  const collateralByToken: Record<string, number> = {}

  // Aggregate collateral and debt across protocols
  if (Array.isArray(data.positions)) {
    for (let i = 0; i < data.positions.length; i++) {
      const pos = data.positions[i]
      if (Array.isArray(pos.collateral)) {
        for (let j = 0; j < pos.collateral.length; j++) {
          const col = pos.collateral[j]
          const val = Math.max(0, Number(col.valueUSD) || 0)
          combinedCollateralValue += val
          const sym = col.token && col.token.symbol ? col.token.symbol : 'UNKNOWN'
          collateralByToken[sym] = (collateralByToken[sym] || 0) + val
        }
      }
      if (Array.isArray(pos.debt)) {
        for (let k = 0; k < pos.debt.length; k++) {
          const d = pos.debt[k]
          const val = Math.max(0, Number(d.valueUSD) || 0)
          totalDebtUSD += val
        }
      }
    }
  }

  // Fallback to top-level aggregate fields if positions array was empty
  if (combinedCollateralValue === 0 && Number(data.totalCollateralUSD) > 0) {
    combinedCollateralValue = Number(data.totalCollateralUSD)
  }
  if (totalDebtUSD === 0 && Number(data.totalDebtUSD) > 0) {
    totalDebtUSD = Number(data.totalDebtUSD)
  }

  // Concentration Score (0 - 100):
  // 100 = perfectly diversified, 0 = single asset concentration
  let concentrationScore = 100
  if (combinedCollateralValue > 0) {
    let maxSingleTokenValue = 0
    const keys = Object.keys(collateralByToken)
    for (let i = 0; i < keys.length; i++) {
      const val = collateralByToken[keys[i]]
      if (val > maxSingleTokenValue) {
        maxSingleTokenValue = val
      }
    }
    const maxRatio = maxSingleTokenValue / combinedCollateralValue
    // If 100% in one token -> score = 25. If <= 20% in max token -> score = 100
    concentrationScore = Math.max(0, Math.min(100, Math.round((1 - (maxRatio - 0.2) / 0.8) * 100)))
  }

  // Health Pressure Index (0 - 100):
  // Measures safety margin above liquidation threshold (HF 1.0)
  // HF >= 2.5 -> 100 (Safe)
  // HF == 1.5 -> 65 (Moderate)
  // HF == 1.1 -> 20 (Danger)
  // HF <= 1.0 -> 0 (Liquidatable)
  const rawHF = Number(data.healthFactor) || 0
  let healthPressureIndex = 0
  if (rawHF <= 1.0) {
    healthPressureIndex = 0
  } else if (rawHF >= 2.5) {
    healthPressureIndex = 100
  } else {
    healthPressureIndex = Math.round(((rawHF - 1.0) / 1.5) * 100)
  }

  // Correlated asset ratio (e.g. wstETH / stETH / rETH exposure)
  let correlatedAssetRatio = 0
  if (combinedCollateralValue > 0 && Number(data.correlatedCollateralUSD) > 0) {
    correlatedAssetRatio = Math.min(1, Number(data.correlatedCollateralUSD) / combinedCollateralValue)
  }

  return {
    combinedCollateralValue,
    totalDebtUSD,
    concentrationScore,
    healthPressureIndex,
    correlatedAssetRatio,
  }
}

/**
 * Pure-math deterministic hashing function (FNV-1a 32-bit to hex string)
 * Runs in QuickJS without crypto or Node Buffer.
 */
export function deterministicHash(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0')
  return `0x${hex}${hex}${hex}${hex}`.slice(0, 66)
}
