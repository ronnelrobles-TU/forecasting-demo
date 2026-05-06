'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav className="site-nav">
      <div className="site-nav-inner">
        <span className="site-nav-brand">WFM Forecasting</span>
        <div className="site-nav-links">
          <Link href="/" className={`site-nav-link${pathname === '/' ? ' active' : ''}`}>
            Demo
          </Link>
          <Link href="/learn" className={`site-nav-link${pathname === '/learn' ? ' active' : ''}`}>
            Learn
          </Link>
        </div>
      </div>
    </nav>
  )
}
