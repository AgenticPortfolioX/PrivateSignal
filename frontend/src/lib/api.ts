/**
 * PrivateSignal — Frontend API Client
 */

import { SAMPLE_QUERY_RESULTS, type ScoreResponse } from './mockData'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export async function submitRiskQuery(
  payload: { query?: string; walletAddress?: string; protocols?: string[]; policyProfileId?: string },
): Promise<ScoreResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      return (await res.json()) as ScoreResponse
    }
  } catch (err) {
    console.warn('[API_CLIENT] Backend offline, falling back to deterministic demo response:', err)
  }

  // Graceful deterministic mock fallback for offline demoing
  const isCaution = payload.query?.toLowerCase().includes('high') || payload.policyProfileId === 'aggressive'
  return isCaution ? SAMPLE_QUERY_RESULTS.caution : SAMPLE_QUERY_RESULTS.sample
}

export async function fetchQueryById(queryId: string): Promise<ScoreResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/history/${queryId}`)
    if (res.ok) {
      const data = await res.json()
      if (data.record) {
        // Hydrate from sample if stored
        return SAMPLE_QUERY_RESULTS[queryId] || {
          ...SAMPLE_QUERY_RESULTS.sample,
          queryId: data.record.queryId,
          score: data.record.score,
          recommendation: data.record.recommendation as any,
          timestamp: data.record.timestamp,
        }
      }
    }
  } catch (err) {
    console.warn('[API_CLIENT] Using cached mock for queryId:', queryId)
  }

  return SAMPLE_QUERY_RESULTS[queryId] || SAMPLE_QUERY_RESULTS.sample
}
