'use client'

import React, { useState } from 'react'
import { Lock, Eye, EyeOff, ShieldCheck, ArrowRight, Server, Cpu } from 'lucide-react'

export function PrivacyBoundaryDiagram() {
  const [selectedZone, setSelectedZone] = useState<'inside' | 'leaves' | 'public'>('inside')

  return (
    <div className="glass-panel" style={{ padding: '28px', borderRadius: '20px' }}>
      <div style={{ marginBottom: '24px', textAlign: 'center' }}>
        <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f3f6fc' }}>
          Chainlink Runtime Environment (CRE) Privacy Boundary
        </h3>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '6px' }}>
          Interactive architecture map comparing operator visibility vs confidential TEE enclave isolation
        </p>
      </div>

      {/* 3-Column Visual Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        {/* Zone 1: Public Layer */}
        <div
          onClick={() => setSelectedZone('public')}
          style={{
            background: selectedZone === 'public' ? 'rgba(55, 91, 210, 0.25)' : 'rgba(15, 23, 42, 0.6)',
            border: selectedZone === 'public' ? '2px solid #375bd2' : '1px solid rgba(55, 91, 210, 0.2)',
            borderRadius: '16px',
            padding: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Eye size={20} style={{ color: '#60a5fa' }} />
            <h4 style={{ color: '#60a5fa', fontWeight: 700, fontSize: '1rem' }}>1. Public Inputs & Signals</h4>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '16px' }}>
            Data observable on-chain and via decentralized Graph indexers.
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
            <li style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #60a5fa' }}>
              🌐 <strong>The Graph Subgraphs:</strong> Aave V3 & Morpho position queries
            </li>
            <li style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #60a5fa' }}>
              💳 <strong>Arc Testnet (Circle L1):</strong> USDC fee payments ($0.10)
            </li>
            <li style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #60a5fa' }}>
              ⚡ <strong>Query Existence:</strong> Target wallet address and protocol list
            </li>
          </ul>
        </div>

        {/* Zone 2: Inside TEE Enclave (Private) */}
        <div
          onClick={() => setSelectedZone('inside')}
          style={{
            background: selectedZone === 'inside' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(15, 23, 42, 0.8)',
            border: selectedZone === 'inside' ? '2px solid #10b981' : '2px dashed rgba(16, 185, 129, 0.5)',
            borderRadius: '16px',
            padding: '20px',
            cursor: 'pointer',
            boxShadow: selectedZone === 'inside' ? '0 0 25px rgba(16, 185, 129, 0.25)' : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={20} style={{ color: '#10b981' }} />
              <h4 style={{ color: '#10b981', fontWeight: 800, fontSize: '1rem' }}>2. Sealed Inside TEE</h4>
            </div>
            <span style={{ fontSize: '0.7rem', background: '#10b981', color: '#07090e', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
              ZERO LEAK
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '16px' }}>
            Encrypted in Vault DON; executed in WASM QuickJS with no outbound I/O.
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
            <li style={{ background: 'rgba(0, 0, 0, 0.4)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #10b981' }}>
              🔒 <strong>Proprietary Model Weights:</strong> Risk factor sensitivity matrices
            </li>
            <li style={{ background: 'rgba(0, 0, 0, 0.4)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #10b981' }}>
              🛡️ <strong>Policy Thresholds:</strong> Strategy thresholds (safe/caution/highRisk)
            </li>
            <li style={{ background: 'rgba(0, 0, 0, 0.4)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #10b981' }}>
              🧮 <strong>Intermediate Math:</strong> Multi-protocol pressure & concentration formulas
            </li>
          </ul>
        </div>

        {/* Zone 3: Leaves TEE (Attested Output) */}
        <div
          onClick={() => setSelectedZone('leaves')}
          style={{
            background: selectedZone === 'leaves' ? 'rgba(0, 210, 255, 0.2)' : 'rgba(15, 23, 42, 0.6)',
            border: selectedZone === 'leaves' ? '2px solid #00d2ff' : '1px solid rgba(0, 210, 255, 0.2)',
            borderRadius: '16px',
            padding: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <ShieldCheck size={20} style={{ color: '#00d2ff' }} />
            <h4 style={{ color: '#00d2ff', fontWeight: 700, fontSize: '1rem' }}>3. Emitted Output Contract</h4>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '16px' }}>
            Sanitized verdict and cryptographic proof delivered to agent and on-chain receivers.
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
            <li style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #00d2ff' }}>
              📊 <strong>Risk Score:</strong> Integer score (0–100)
            </li>
            <li style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #00d2ff' }}>
              🎯 <strong>Recommendation:</strong> safe | caution | high_risk
            </li>
            <li style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px 12px', borderRadius: '8px', borderLeft: '3px solid #00d2ff' }}>
              🔏 <strong>DON Attestation:</strong> Verifiable execution signature
            </li>
          </ul>
        </div>
      </div>

      {/* Details Box */}
      <div style={{ marginTop: '24px', background: 'rgba(7, 9, 14, 0.9)', border: '1px solid rgba(55, 91, 210, 0.2)', borderRadius: '12px', padding: '16px', fontSize: '0.85rem' }}>
        <h5 style={{ color: '#00d2ff', marginBottom: '6px', fontWeight: 700 }}>
          {selectedZone === 'inside' && 'Inside TEE: Enclave Isolation'}
          {selectedZone === 'leaves' && 'Leaves TEE: Output Guarantee'}
          {selectedZone === 'public' && 'Public Layer: Observable Data'}
        </h5>
        <p style={{ color: '#94a3b8', lineHeight: 1.5 }}>
          {selectedZone === 'inside' &&
            'Node operators running Chainlink CRE oracles cannot inspect the internal memory space or execution flow of the WASM scorer. Secrets are injected via hardware enclave keys.'}
          {selectedZone === 'leaves' &&
            'Only the final scalar score and discrete reason codes leave the enclave. The proprietary weights cannot be reverse-engineered from the attested output.'}
          {selectedZone === 'public' &&
            'Subgraphs and on-chain transactions are publicly indexable. The innovation of PrivateSignal is performing the confidential risk analysis off-chain without exposing secret alpha.'}
        </p>
      </div>
    </div>
  )
}
