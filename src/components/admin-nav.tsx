'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const navigation: [string, string, string][] = [
  ['Overview', '/admin', '⌘'],
  ['Residents', '/admin/residents', '◉'],
  ['Invoices', '/admin/invoices', '₦'],
  ['Due types', '/admin/due-types', '☰'],
  ['Gate activity', '/admin/access-logs', '↗'],
]

export function AdminNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="mobile-nav-toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '✕' : '☰'}
      </button>
      <nav className={`nav-links${open ? ' open' : ''}`}>
        {navigation.map(([label, href, icon]) => {
          const isActive =
            href === '/admin' ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`side-link${isActive ? ' active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="side-icon" aria-hidden="true">
                {icon}
              </span>
              {label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
