'use client'

import React, { useState } from 'react'
import { CheckCircle2, Shield, Copy, Check, Lock, ExternalLink } from 'lucide-react'

interface Props {
  attestationSummary: {
    valid: boolean
    donId: string
    timestamp: number
    workflowId: string
    executionHash: string
    signatureSnippet: string
    verified: boolean
    status: string
    formattedTimestamp: string
    shortHash: string
    donZone: string
  }
}

export function AttestationCard({ attestationSummary }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(attestationSummary.executionHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid rgba(55, 91, 210, 0.15)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: 'rgba(55, 91, 210, 0.2)', padding: '8px', borderRadius: '10px', color: '#00d2ff' }}>
            <Shield size={22} />
          </div>
          <div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f3f6fc' }}>
              Chainlink CRE TEE Attestation
            </h4>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Cryptographic Confidential Execution Proof
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '4px 12px', borderRadius: '20px', color: '#10b981', fontSize: '0.8rem', fontWeight: 600 }}>
          <CheckCircle2 size={16} />
          <span>VERIFIED ENCLAVE</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', fontSize: '0.85rem' }}>
        <div>
          <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>DON Identifier</span>
          <p style={{ color: '#f3f6fc', fontWeight: 600, marginTop: '2px', fontFamily: 'monospace' }}>
            {attestationSummary.donId}
          </p>
        </div>

        <div>
          <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Workflow Target</span>
          <p style={{ color: '#00d2ff', fontWeight: 600, marginTop: '2px', fontFamily: 'monospace' }}>
            {attestationSummary.workflowId}
          </p>
        </div>

        <div>
          <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Execution Time</span>
          <p style={{ color: '#f3f6fc', fontWeight: 500, marginTop: '2px' }}>
            {attestationSummary.formattedTimestamp}
          </p>
        </div>

        <div>
          <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enclave Environment</span>
          <p style={{ color: '#10b981', fontWeight: 600, marginTop: '2px' }}>
            {attestationSummary.donZone}
          </p>
        </div>
      </div>

      {/* Execution Hash Block */}
      <div style={{ marginTop: '16px', background: 'rgba(7, 9, 14, 0.8)', border: '1px solid rgba(55, 91, 210, 0.2)', padding: '12px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <Lock size={16} style={{ color: '#00d2ff', flexShrink: 0 }} />
          <div style={{ overflow: 'hidden' }}>
            <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Execution Digest</span>
            <p style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {attestationSummary.executionHash}
            </p>
          </div>
        </div>

        <button
          onClick={handleCopy}
          style={{ background: 'rgba(55, 91, 210, 0.2)', border: 'none', color: '#00d2ff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '12px', lineHeight: 1.4 }}>
        ℹ️ <strong>Confidentiality Guarantee:</strong> Model weights and policy logic remained sealed inside the TEE enclave during scoring. Node operators only relay the verifiable cryptographic attestation.
      </p>
    </div>
  )
}
