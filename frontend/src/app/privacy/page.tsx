'use client'

import React from 'react'
import { Lock, Shield, Eye, FileCode, CheckCircle, Server, AlertCircle } from 'lucide-react'
import { PrivacyBoundaryDiagram } from '../../components/PrivacyBoundaryDiagram'

export default function PrivacyPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '6px 14px', borderRadius: '30px', fontSize: '0.8rem', color: '#10b981', fontWeight: 600, marginBottom: '12px' }}>
          <Lock size={14} />
          <span>Zero-Knowledge / TEE Confidentiality Architecture</span>
        </div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
          Privacy Architecture & <span style={{ color: '#00d2ff' }}>TEE Security Boundary</span>
        </h1>
        <p style={{ color: '#94a3b8', marginTop: '8px', maxWidth: '750px', fontSize: '1.05rem', lineHeight: 1.5 }}>
          PrivateSignal decouples on-chain verification from proprietary risk modeling. Explore what node operators can observe versus what remains strictly confidential inside the enclave.
        </p>
      </div>

      {/* Interactive Diagram */}
      <PrivacyBoundaryDiagram />

      {/* Deep Dive Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        {/* Enclave View */}
        <div className="glass-panel" style={{ padding: '28px', borderRadius: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '8px', borderRadius: '10px' }}>
              <Lock size={20} />
            </div>
            <div>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f3f6fc' }}>Enclave View (Inside TEE)</h4>
              <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>Decentralized Hardware Isolation</span>
            </div>
          </div>

          <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '16px' }}>
            Inside the Chainlink TEE (Intel SGX / AMD SEV), the WASM handler compiles to QuickJS with absolutely no outbound network capabilities. It fetches private weights directly from Chainlink Vault DON secrets:
          </p>

          <div style={{ background: 'rgba(7, 9, 14, 0.8)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '10px', padding: '14px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#10b981' }}>
            // Unobservable by DON Node Operators<br />
            const secrets = cre.capabilities.Secrets.get()<br />
            const weights = [0.30, 0.20, 0.20, 0.30]<br />
            const ltvThreshold = 75.0<br />
            const intermediateHealthScore = calculatePureMath(...)
          </div>
        </div>

        {/* Operator View */}
        <div className="glass-panel" style={{ padding: '28px', borderRadius: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(55, 91, 210, 0.15)', color: '#00d2ff', padding: '8px', borderRadius: '10px' }}>
              <Eye size={20} />
            </div>
            <div>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f3f6fc' }}>Operator View (Outside TEE)</h4>
              <span style={{ fontSize: '0.75rem', color: '#00d2ff', fontWeight: 600 }}>Public Cryptographic Relayer</span>
            </div>
          </div>

          <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: '16px' }}>
            Oracle nodes relay the input parameters and receive only the attested public envelope. The proprietary algorithm cannot be inferred from the output:
          </p>

          <div style={{ background: 'rgba(7, 9, 14, 0.8)', border: '1px solid rgba(55, 91, 210, 0.25)', borderRadius: '10px', padding: '14px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#00d2ff' }}>
            &#123;<br />
            &nbsp;&nbsp;"score": 88,<br />
            &nbsp;&nbsp;"recommendation": "safe",<br />
            &nbsp;&nbsp;"reasonCodes": ["HEALTHY_PORTFOLIO"],<br />
            &nbsp;&nbsp;"attestation": &#123; "verified": true &#125;<br />
            &#125;
          </div>
        </div>
      </div>

      {/* Summary Table for Judges */}
      <div className="glass-panel" style={{ padding: '28px', borderRadius: '18px' }}>
        <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f3f6fc', marginBottom: '16px' }}>
          Data Classification Matrix
        </h4>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(55, 91, 210, 0.2)', textAlign: 'left', color: '#64748b' }}>
                <th style={{ padding: '10px 14px' }}>Data Artifact</th>
                <th style={{ padding: '10px 14px' }}>Storage / Transport</th>
                <th style={{ padding: '10px 14px' }}>Visibility</th>
                <th style={{ padding: '10px 14px' }}>Protection Mechanism</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(55, 91, 210, 0.1)' }}>
                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#f3f6fc' }}>Model Weights & Matrices</td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>Vault DON Key Slot</td>
                <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 700 }}>Inside TEE Only</td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>Hardware Enclave Isolation</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(55, 91, 210, 0.1)' }}>
                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#f3f6fc' }}>Intermediate Features</td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>TEE Volatile RAM</td>
                <td style={{ padding: '12px 14px', color: '#10b981', fontWeight: 700 }}>Inside TEE Only</td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>Zero-leak pure math</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(55, 91, 210, 0.1)' }}>
                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#f3f6fc' }}>Risk Score (0–100)</td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>Output Contract Payload</td>
                <td style={{ padding: '12px 14px', color: '#00d2ff', fontWeight: 700 }}>Leaves TEE</td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>Attested Digital Signature</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(55, 91, 210, 0.1)' }}>
                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#f3f6fc' }}>Subgraphs Positions</td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>The Graph Gateway</td>
                <td style={{ padding: '12px 14px', color: '#60a5fa', fontWeight: 700 }}>Public</td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>Decentralized Indexing</td>
              </tr>
              <tr>
                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#f3f6fc' }}>Arc Agent Transactions</td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>Arc Testnet (Circle L1)</td>
                <td style={{ padding: '12px 14px', color: '#60a5fa', fontWeight: 700 }}>Public</td>
                <td style={{ padding: '12px 14px', color: '#94a3b8' }}>On-Chain Native USDC Gas</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
