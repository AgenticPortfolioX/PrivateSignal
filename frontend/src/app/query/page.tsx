'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Sliders, ArrowRight, ShieldAlert, Cpu, Sparkles, Loader2, CheckCircle2 } from 'lucide-react'
import { submitRiskQuery } from '../../lib/api'
import { ScoreGauge } from '../../components/ScoreGauge'
import { RecommendationBadge } from '../../components/RecommendationBadge'
import { AttestationCard } from '../../components/AttestationCard'

export default function QueryPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'natural' | 'structured'>('natural')
  const [naturalQuery, setNaturalQuery] = useState(
    'Score cross-protocol risk for wallet 0x748ABdeF0775132E8F941e1513152D5eb02D3a4B across Aave and Morpho under conservative policy',
  )
  const [walletAddress, setWalletAddress] = useState('0x748ABdeF0775132E8F941e1513152D5eb02D3a4B')
  const [protocols, setProtocols] = useState<string[]>(['aave-v3', 'morpho'])
  const [policyStyle, setPolicyStyle] = useState<'conservative' | 'balanced' | 'aggressive'>('conservative')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleProtocolToggle = (p: string) => {
    if (protocols.includes(p)) {
      if (protocols.length > 1) setProtocols(protocols.filter((x) => x !== p))
    } else {
      setProtocols([...protocols, p])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const payload =
        tab === 'natural'
          ? { query: naturalQuery }
          : { walletAddress, protocols, policyProfileId: policyStyle }

      const response = await submitRiskQuery(payload)
      setResult(response)
    } catch (err: any) {
      setError(err.message || 'Failed to submit risk query')
    } finally {
      setLoading(false)
    }
  }

  const samplePrompts = [
    'Score cross-protocol risk for wallet 0x748ABdeF0775132E8F941e1513152D5eb02D3a4B across Aave and Morpho under conservative policy',
    'Is concentration in ETH-correlated collateral too high for cautious agent 0x000000000000000000000000000000000000dead?',
    'Check health factor and liquidation safety for 0x00000000000004f93b0c4bbaadff9e5742574b59 on Aave V3',
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header Banner */}
      <div style={{ textAlign: 'center', maxWidth: '750px', margin: '0 auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(55, 91, 210, 0.15)', border: '1px solid rgba(0, 210, 255, 0.3)', padding: '6px 16px', borderRadius: '30px', fontSize: '0.82rem', color: '#00d2ff', fontWeight: 600, marginBottom: '16px' }}>
          <Sparkles size={16} />
          <span>Chainlink CRE TEE Confidential Execution</span>
        </div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          Confidential Cross-Protocol <span style={{ color: '#00d2ff' }}>Risk Intelligence</span>
        </h1>
        <p style={{ color: '#94a3b8', marginTop: '12px', fontSize: '1.05rem', lineHeight: 1.5 }}>
          Analyze on-chain lending exposures across Aave V3 and Morpho. Private scoring weights and policy multipliers execute strictly inside hardware-isolated enclaves.
        </p>
      </div>

      {/* Query Card */}
      <div className="glass-panel" style={{ padding: '32px', borderRadius: '20px' }}>
        {/* Tab Toggle */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid rgba(55, 91, 210, 0.15)', paddingBottom: '16px' }}>
          <button
            onClick={() => setTab('natural')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              background: tab === 'natural' ? 'linear-gradient(135deg, #375bd2 0%, #1e3a8a 100%)' : 'transparent',
              color: tab === 'natural' ? '#ffffff' : '#94a3b8',
              boxShadow: tab === 'natural' ? '0 4px 15px rgba(55, 91, 210, 0.3)' : 'none',
            }}
          >
            <Search size={16} />
            <span>Natural Language Query</span>
          </button>

          <button
            onClick={() => setTab('structured')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              background: tab === 'structured' ? 'linear-gradient(135deg, #375bd2 0%, #1e3a8a 100%)' : 'transparent',
              color: tab === 'structured' ? '#ffffff' : '#94a3b8',
              boxShadow: tab === 'structured' ? '0 4px 15px rgba(55, 91, 210, 0.3)' : 'none',
            }}
          >
            <Sliders size={16} />
            <span>Structured Input</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {tab === 'natural' ? (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>
                Natural Language Risk Request:
              </label>
              <textarea
                value={naturalQuery}
                onChange={(e) => setNaturalQuery(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  background: 'rgba(7, 9, 14, 0.8)',
                  border: '1px solid rgba(55, 91, 210, 0.3)',
                  borderRadius: '12px',
                  padding: '14px',
                  color: '#f3f6fc',
                  fontSize: '0.95rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'vertical',
                }}
                placeholder="Ask to evaluate a wallet's cross-protocol leverage, concentration, or liquidation distance..."
                required
              />

              {/* Sample Chips */}
              <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Try sample:</span>
                {samplePrompts.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setNaturalQuery(p)}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(55, 91, 210, 0.2)',
                      color: '#94a3b8',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Sample {i + 1}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>
                  Wallet Address (0x...):
                </label>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(7, 9, 14, 0.8)',
                    border: '1px solid rgba(55, 91, 210, 0.3)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    color: '#f3f6fc',
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                  required
                />
              </div>

              {/* Protocol Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>
                  Target Subgraphs:
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {['aave-v3', 'morpho'].map((p) => {
                    const isChecked = protocols.includes(p)
                    return (
                      <button
                        type="button"
                        key={p}
                        onClick={() => handleProtocolToggle(p)}
                        style={{
                          background: isChecked ? 'rgba(55, 91, 210, 0.25)' : 'rgba(7, 9, 14, 0.6)',
                          border: isChecked ? '1px solid #00d2ff' : '1px solid rgba(55, 91, 210, 0.2)',
                          color: isChecked ? '#00d2ff' : '#94a3b8',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '0.85rem',
                        }}
                      >
                        {p === 'aave-v3' ? 'Aave V3 Subgraph' : 'Morpho Blue Subgraph'}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Policy Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>
                  Enclave Policy Profile:
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {(['conservative', 'balanced', 'aggressive'] as const).map((style) => (
                    <button
                      type="button"
                      key={style}
                      onClick={() => setPolicyStyle(style)}
                      style={{
                        background: policyStyle === style ? 'rgba(0, 210, 255, 0.2)' : 'rgba(7, 9, 14, 0.6)',
                        border: policyStyle === style ? '1px solid #00d2ff' : '1px solid rgba(55, 91, 210, 0.2)',
                        color: policyStyle === style ? '#00d2ff' : '#94a3b8',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        textTransform: 'capitalize',
                      }}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#ef4444', padding: '12px', borderRadius: '10px', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" disabled={loading} className="glow-button" style={{ minWidth: '200px' }}>
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Enclave Executing...</span>
                </>
              ) : (
                <>
                  <span>Evaluate Risk Score</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Result Section (when available) */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>
              Confidential Evaluation <span style={{ color: '#00d2ff' }}>Verdict</span>
            </h2>
            <button
              onClick={() => router.push(`/result/${result.queryId}`)}
              style={{
                background: 'rgba(55, 91, 210, 0.2)',
                border: '1px solid rgba(0, 210, 255, 0.3)',
                color: '#00d2ff',
                padding: '6px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              Open Permanent Audit URL →
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
            {/* Score Card */}
            <div className="glass-panel" style={{ padding: '28px', borderRadius: '18px', textAlign: 'center' }}>
              <RecommendationBadge recommendation={result.recommendation} size="md" />
              <div style={{ margin: '20px 0' }}>
                <ScoreGauge score={result.score} recommendation={result.recommendation} size={240} />
              </div>

              {/* Reasons */}
              <div style={{ textAlign: 'left', marginTop: '16px', background: 'rgba(7, 9, 14, 0.6)', padding: '14px', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                  Reason Codes:
                </span>
                <ul style={{ listStyle: 'none', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {result.reasonCodes.map((code: string, i: number) => (
                    <li key={i} style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                      <span>{code}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Metrics & Features */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Aggregated Features */}
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '18px' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', color: '#f3f6fc' }}>
                  Public Normalized Features
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div style={{ background: 'rgba(7, 9, 14, 0.7)', padding: '12px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>Collateral</span>
                    <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f3f6fc', marginTop: '2px' }}>
                      ${result.featuresSummary?.combinedCollateralValue?.toLocaleString() || '0'}
                    </p>
                  </div>
                  <div style={{ background: 'rgba(7, 9, 14, 0.7)', padding: '12px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>Debt</span>
                    <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f3f6fc', marginTop: '2px' }}>
                      ${result.featuresSummary?.totalDebtUSD?.toLocaleString() || '0'}
                    </p>
                  </div>
                  <div style={{ background: 'rgba(7, 9, 14, 0.7)', padding: '12px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>Diversification</span>
                    <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#00d2ff', marginTop: '2px' }}>
                      {result.featuresSummary?.concentrationScore || 0} / 100
                    </p>
                  </div>
                  <div style={{ background: 'rgba(7, 9, 14, 0.7)', padding: '12px', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>Health Pressure</span>
                    <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                      {result.featuresSummary?.healthPressureIndex || 0} / 100
                    </p>
                  </div>
                </div>
              </div>

              {/* Attestation Card */}
              {result.attestationSummary && (
                <AttestationCard attestationSummary={result.attestationSummary} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
