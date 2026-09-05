'use client'

import React from 'react'
import { ShieldCheck, AlertTriangle, AlertOctagon } from 'lucide-react'

interface Props {
  recommendation: 'safe' | 'caution' | 'high_risk' | string
  size?: 'sm' | 'md' | 'lg'
}

export function RecommendationBadge({ recommendation, size = 'md' }: Props) {
  const norm = recommendation.toLowerCase()

  const config = {
    safe: {
      label: 'Safe Execution',
      icon: ShieldCheck,
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.15)',
      border: 'rgba(16, 185, 129, 0.4)',
      glow: '0 0 16px rgba(16, 185, 129, 0.25)',
    },
    caution: {
      label: 'Caution Advised',
      icon: AlertTriangle,
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.15)',
      border: 'rgba(245, 158, 11, 0.4)',
      glow: '0 0 16px rgba(245, 158, 11, 0.25)',
    },
    high_risk: {
      label: 'High Risk Alert',
      icon: AlertOctagon,
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.15)',
      border: 'rgba(239, 68, 68, 0.4)',
      glow: '0 0 16px rgba(239, 68, 68, 0.25)',
    },
  }[norm] || {
    label: norm.toUpperCase(),
    icon: ShieldCheck,
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.15)',
    border: 'rgba(148, 163, 184, 0.3)',
    glow: 'none',
  }

  const Icon = config.icon
  const sizeStyles = {
    sm: { padding: '4px 10px', fontSize: '0.75rem', iconSize: 14 },
    md: { padding: '6px 14px', fontSize: '0.875rem', iconSize: 18 },
    lg: { padding: '8px 20px', fontSize: '1rem', iconSize: 22 },
  }[size]

  return (
    <span
      className="badge-tag"
      style={{
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
        color: config.color,
        boxShadow: config.glow,
        padding: sizeStyles.padding,
        fontSize: sizeStyles.fontSize,
      }}
    >
      <Icon size={sizeStyles.iconSize} strokeWidth={2.5} />
      <span>{config.label}</span>
    </span>
  )
}
