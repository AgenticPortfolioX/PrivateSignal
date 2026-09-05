'use client'

import React from 'react'

interface Props {
  score: number
  recommendation?: string
  size?: number
}

export function ScoreGauge({ score, recommendation = 'safe', size = 260 }: Props) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)))
  
  // Circumference calculations for 240 degree gauge arc
  const radius = 95
  const stroke = 14
  const center = size / 2
  const startAngle = 150
  const endAngle = 390
  const totalAngle = endAngle - startAngle // 240 deg
  
  // Circumference = 2 * PI * r
  const arcLength = (totalAngle / 360) * (2 * Math.PI * radius)
  const progressRatio = clampedScore / 100
  const progressLength = progressRatio * arcLength
  const dashOffset = arcLength - progressLength

  // Color mapping based on score
  let strokeColor = '#10b981' // Green
  let glowColor = 'rgba(16, 185, 129, 0.4)'
  if (clampedScore < 40) {
    strokeColor = '#ef4444' // Red
    glowColor = 'rgba(239, 68, 68, 0.4)'
  } else if (clampedScore < 70) {
    strokeColor = '#f59e0b' // Amber
    glowColor = 'rgba(245, 158, 11, 0.4)'
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
          <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={glowColor} />
          </filter>
        </defs>

        {/* Track Arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={stroke}
          strokeDasharray={`${arcLength} 9999`}
          strokeLinecap="round"
          transform={`rotate(${startAngle} ${center} ${center})`}
        />

        {/* Active Progress Arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeDasharray={`${arcLength} 9999`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          filter="url(#gaugeGlow)"
          transform={`rotate(${startAngle} ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>

      {/* Center Readout */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontSize: '3.5rem',
            fontWeight: 800,
            lineHeight: 1,
            color: strokeColor,
            textShadow: `0 0 20px ${glowColor}`,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {clampedScore}
        </span>
        <span
          style={{
            fontSize: '0.85rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#94a3b8',
            marginTop: '4px',
            fontWeight: 600,
          }}
        >
          Risk Score
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            color: '#64748b',
            marginTop: '2px',
          }}
        >
          Scale: 0 (Critical) – 100 (Safe)
        </span>
      </div>
    </div>
  )
}
