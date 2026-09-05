'use client'

/**
 * @title Navbar Component
 * @author Justin Gramke
 */


import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Shield, Cpu, Activity, Lock, Search } from 'lucide-react'

export function Navbar() {
  const pathname = usePathname()

  const navLinks = [
    { href: '/query', label: 'Query Risk', icon: Search },
    { href: '/result/sample', label: 'Score Verdict', icon: Shield },
    { href: '/agent', label: 'Arc Agent', icon: Activity },
    { href: '/privacy', label: 'Privacy Boundary', icon: Lock },
  ]

  return (
    <nav
      style={{
        borderBottom: '1px solid rgba(55, 91, 210, 0.2)',
        background: 'rgba(7, 9, 14, 0.85)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '0 24px',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          height: '70px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Brand Logo */}
        <Link href="/query" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #375bd2 0%, #00d2ff 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(0, 210, 255, 0.4)',
            }}
          >
            <Shield size={22} color="#ffffff" strokeWidth={2.5} />
          </div>
          <div>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff' }}>
              Private<span style={{ color: '#00d2ff' }}>Signal</span>
            </span>
            <span style={{ display: 'block', fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '-2px' }}>
              Chainlink CRE TEE Scorer
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {navLinks.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== '/query' && pathname?.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  color: isActive ? '#00d2ff' : '#94a3b8',
                  background: isActive ? 'rgba(55, 91, 210, 0.2)' : 'transparent',
                  border: isActive ? '1px solid rgba(0, 210, 255, 0.3)' : '1px solid transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>

        {/* Network Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '20px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981',
            }}
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
            <span>Arc Circle L1</span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '20px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: 'rgba(55, 91, 210, 0.15)',
              border: '1px solid rgba(55, 91, 210, 0.4)',
              color: '#00d2ff',
            }}
          >
            <Cpu size={13} />
            <span>CRE DON Active</span>
          </div>
        </div>
      </div>
    </nav>
  )
}
