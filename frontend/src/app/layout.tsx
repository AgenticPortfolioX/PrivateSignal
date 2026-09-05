import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '../components/Navbar'

export const metadata: Metadata = {
  title: 'PrivateSignal — Confidential Cross-Protocol Risk Scorer',
  description:
    'Chainlink Runtime Environment (CRE) confidential scoring system executing on Arc testnet with The Graph multi-protocol feeds.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px 64px' }}>
          {children}
        </main>
      </body>
    </html>
  )
}
