'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Shield, CheckCircle2, Activity, ExternalLink, Loader2 } from 'lucide-react'
import { fetchQueryById } from '../../../lib/api'
import { ScoreGauge } from '../../../components/ScoreGauge'
import { RecommendationBadge } from '../../../components/RecommendationBadge'
import { AttestationCard } from '../../../components/AttestationCard'
import type { ScoreResponse } from '../../../lib/mockData'

export default function ResultPage() {
  const params = useParams()
  const router = useRouter()
  const queryId = (params?.queryId as string) || 'sample'

  const [data, setData] = useState<ScoreResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetchQueryById(queryId)
      setData(res)
      setLoading(false)
    }
    load()
  }, [queryId])

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '16px' }}>
        <Loader2 size={36} className="animate-spin" style={{ color: '#00d2ff' }} />
        <span style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Retrieving attested enclave verdict...</span>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>Query Record Not Found</h2>
        <p style={{ color: '#94a3b8', marginTop: '8px' }}>The requested query identifier could not be resolved.</p>
        <Link href="/query" style={{ marginTop: '20px', display: 'inline-block' }} className="glow-button">
          Run New Query
        </Link>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Top Bar Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={() => router.push('/query')}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '0.88rem',
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Query Console</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Query ID:</span>
          <code style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', color: '#00d2ff', border: '1px solid rgba(55, 91, 210, 0.2)' }}>
            {data.queryId}
          </code>
        </div>
      </div>

      {/* Main Verdict Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        {/* Left Column: Gauge & Verdict */}
        <div className="glass-panel" style={{ padding: '32px', borderRadius: '20px', textAlign: 'center' }}>
          <RecommendationBadge recommendation={data.recommendation} size="lg" />

          <div style={{ margin: '24px 0' }}>
            <ScoreGauge score={data.score} recommendation={data.recommendation} size={260} />
          </div>

          <div style={{ textAlign: 'left', background: 'rgba(7, 9, 14, 0.7)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(55, 91, 210, 0.15)' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
              Verdict Justification & Reason Codes:
            </span>
            <ul style={{ listStyle: 'none', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.reasonCodes.map((code, idx) => (
                <li key={idx} style={{ fontSize: '0.82rem', color: '#f3f6fc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                  <span>{code}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action Trigger */}
          <Link
            href="/agent"
            style={{
              marginTop: '20px',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: 'rgba(55, 91, 210, 0.2)',
              border: '1px solid rgba(0, 210, 255, 0.4)',
              color: '#00d2ff',
              padding: '12px',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            <Activity size={18} />
            <span>Forward to Arc Agent for Execution</span>
          </Link>
        </div>

        {/* Right Column: Features & Attestation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Portfolio Breakdown */}
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '20px' }}>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f3f6fc', marginBottom: '16px' }}>
              Cross-Protocol Exposure Summary
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ background: 'rgba(7, 9, 14, 0.7)', padding: '14px', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Combined Collateral</span>
                <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f3f6fc', marginTop: '2px' }}>
                  ${data.featuresSummary?.combinedCollateralValue?.toLocaleString() || '0'}
                </p>
                <span style={{ fontSize: '0.75rem', color: '#10b981' }}>Across Aave & Morpho</span>
              </div>

              <div style={{ background: 'rgba(7, 9, 14, 0.7)', padding: '14px', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Total Debt</span>
                <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f3f6fc', marginTop: '2px' }}>
                  ${data.featuresSummary?.totalDebtUSD?.toLocaleString() || '0'}
                </p>
                <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>Aggregate borrows</span>
              </div>

              <div style={{ background: 'rgba(7, 9, 14, 0.7)', padding: '14px', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Diversification Score</span>
                <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#00d2ff', marginTop: '2px' }}>
                  {data.featuresSummary?.concentrationScore || 0} / 100
                </p>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Multi-token spread</span>
              </div>

              <div style={{ background: 'rgba(7, 9, 14, 0.7)', padding: '14px', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Health Pressure</span>
                <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                  {data.featuresSummary?.healthPressureIndex || 0} / 100
                </p>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Liquidation distance</span>
              </div>
            </div>
          </div>

          {/* Attestation Card */}
          <AttestationCard attestationSummary={data.attestationSummary} />
        </div>
      </div>
    </div>
  )
}
