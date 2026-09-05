'use client'

import React, { useState } from 'react'
import { Wallet, ShieldCheck, Play, ArrowRight, Zap, RefreshCw, CheckCircle2 } from 'lucide-react'
import { AgentActionPanel } from '../../components/AgentActionPanel'

export default function AgentPage() {
  const [triggerScore, setTriggerScore] = useState('88')
  const [targetProtocol, setTargetProtocol] = useState('Aave V3')
  const [simulatedAction, setSimulatedAction] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSimulateAction = () => {
    setLoading(true)
    setSimulatedAction(null)
    setTimeout(() => {
      const numScore = parseFloat(triggerScore)
      if (numScore >= 65) {
        setSimulatedAction('ACTION_PERMITTED: Score 88 exceeds gate threshold (65). Agent executed rebalancing and fee payment of 0.10 native USDC on Arc testnet.')
      } else {
        setSimulatedAction('ACTION_GATED: Score below policy threshold. Agent initiated automated risk mitigation de-leverage on Morpho Blue.')
      }
      setLoading(false)
    }, 1200)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(0, 210, 255, 0.15)', border: '1px solid rgba(0, 210, 255, 0.3)', padding: '6px 14px', borderRadius: '30px', fontSize: '0.8rem', color: '#00d2ff', fontWeight: 600, marginBottom: '12px' }}>
          <Zap size={14} />
          <span>Circle Agent Wallet on Arc Testnet (Circle L1)</span>
        </div>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
          Autonomous Arc <span style={{ color: '#00d2ff' }}>Agent Panel</span>
        </h1>
        <p style={{ color: '#94a3b8', marginTop: '8px', maxWidth: '700px', fontSize: '1rem', lineHeight: 1.5 }}>
          PrivateSignal sponsors and executes score-gated risk management actions on Arc testnet. Circle L1 uses native USDC for gas fees with zero need for ETH.
        </p>
      </div>

      {/* Main Agent Panel */}
      <AgentActionPanel />

      {/* Simulator Section */}
      <div className="glass-panel" style={{ padding: '28px', borderRadius: '20px' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f3f6fc', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Play size={18} style={{ color: '#00d2ff' }} />
          Simulate Score-Gated Agent Action
        </h3>
        <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '20px' }}>
          Test how the autonomous agent uses attested PrivateSignal scores to trigger DeFi actions on Arc testnet.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>
              Attested Risk Score:
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={triggerScore}
              onChange={(e) => setTriggerScore(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(7, 9, 14, 0.8)',
                border: '1px solid rgba(55, 91, 210, 0.3)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#f3f6fc',
                fontFamily: 'monospace',
                fontSize: '1rem',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 600 }}>
              Target Protocol:
            </label>
            <select
              value={targetProtocol}
              onChange={(e) => setTargetProtocol(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(7, 9, 14, 0.8)',
                border: '1px solid rgba(55, 91, 210, 0.3)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#f3f6fc',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            >
              <option value="Aave V3">Aave V3 (Mainnet)</option>
              <option value="Morpho Blue">Morpho Blue (Mainnet)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={handleSimulateAction}
              disabled={loading}
              className="glow-button"
              style={{ width: '100%', height: '42px' }}
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Evaluating Policy Gate...</span>
                </>
              ) : (
                <>
                  <span>Trigger Agent Loop</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>

        {simulatedAction && (
          <div
            style={{
              background: simulatedAction.includes('PERMITTED') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              border: simulatedAction.includes('PERMITTED') ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)',
              color: simulatedAction.includes('PERMITTED') ? '#10b981' : '#f59e0b',
              padding: '16px',
              borderRadius: '12px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ display: 'block', marginBottom: '4px' }}>Simulator Receipt</strong>
              <p style={{ color: '#f3f6fc', lineHeight: 1.4 }}>{simulatedAction}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
