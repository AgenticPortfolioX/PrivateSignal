'use client'

/**
 * @title AgentActionPanel Component
 * @author Justin Gramke
 */


import React from 'react'
import { Wallet, ArrowUpRight, DollarSign, Activity, CheckCircle, ShieldAlert } from 'lucide-react'
import { ARC_AGENT_MOCK } from '../lib/mockData'

export function AgentActionPanel() {
  const agent = ARC_AGENT_MOCK

  return (
    <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid rgba(55, 91, 210, 0.15)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: 'rgba(0, 210, 255, 0.15)', color: '#00d2ff', padding: '8px', borderRadius: '10px' }}>
            <Wallet size={20} />
          </div>
          <div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f3f6fc' }}>
              Arc Testnet Agent Wallet
            </h4>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Circle L1 Native USDC Autonomous Sponsor
            </span>
          </div>
        </div>

        <span style={{ background: 'rgba(55, 91, 210, 0.2)', border: '1px solid rgba(0, 210, 255, 0.3)', color: '#00d2ff', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600 }}>
          {agent.network}
        </span>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{ background: 'rgba(7, 9, 14, 0.7)', border: '1px solid rgba(55, 91, 210, 0.2)', padding: '14px', borderRadius: '12px' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Native USDC Balance</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '4px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981' }}>
              ${agent.balanceUSDC}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>USDC</span>
          </div>
        </div>

        <div style={{ background: 'rgba(7, 9, 14, 0.7)', border: '1px solid rgba(55, 91, 210, 0.2)', padding: '14px', borderRadius: '12px' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Query Fee (Arc Sponsored)</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '4px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#00d2ff' }}>
              ${agent.feePerQueryUSDC}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>USDC</span>
          </div>
        </div>

        <div style={{ background: 'rgba(7, 9, 14, 0.7)', border: '1px solid rgba(55, 91, 210, 0.2)', padding: '14px', borderRadius: '12px' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Policy Gate Threshold</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '4px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>
              ≥ {agent.policyThreshold}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>pts</span>
          </div>
        </div>
      </div>

      {/* Wallet Address Strip */}
      <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', fontSize: '0.8rem' }}>
        <span style={{ color: '#94a3b8' }}>Agent Address:</span>
        <code style={{ color: '#f3f6fc', fontWeight: 600, letterSpacing: '0.05em' }}>
          {agent.agentWalletAddress}
        </code>
      </div>

      {/* Action Log */}
      <div>
        <h5 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f3f6fc', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Activity size={16} style={{ color: '#00d2ff' }} />
          Recent Arc Agent Transactions
        </h5>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {agent.recentActions.map((act) => (
            <div
              key={act.id}
              style={{
                background: 'rgba(7, 9, 14, 0.8)',
                border: '1px solid rgba(55, 91, 210, 0.15)',
                padding: '10px 14px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.82rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={15} style={{ color: '#10b981' }} />
                <div>
                  <span style={{ fontWeight: 600, color: '#f3f6fc' }}>{act.action}</span>
                  <span style={{ color: '#64748b', marginLeft: '6px', fontSize: '0.75rem' }}>({act.targetProtocol})</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontFamily: 'monospace', color: '#10b981', fontWeight: 600 }}>
                  -{act.amountUSDC} USDC
                </span>
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{act.timestamp}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
