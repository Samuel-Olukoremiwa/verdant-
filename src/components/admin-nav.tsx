'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function AdminNav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const navigation: [string, string, string][] = [
    ['Overview', '/admin', '⌘'],
    ['Residents', '/admin/residents', '◉'],
    ['Registrations', '/admin/registrations', '✉'],
    ['Invoices', '/admin/invoices', '₦'],
    ['Reports', '/admin/reports', '▤'],
    ['Due types', '/admin/due-types', '☰'],
    ['Streets', '/admin/streets', '⌂'],
    ['Gate activity', '/admin/access-logs', '↗'],
    ...(isSuperAdmin ? ([['Team', '/admin/team', '☺']] as [string, string, string][]) : []),
  ]

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('registration_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0))
  }, [])

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
              {label === 'Registrations' && pendingCount > 0 && (
                <span
                  style={{
                    marginLeft: 'auto',
                    background: '#e8542a',
                    color: '#fff',
                    fontSize: '.7rem',
                    fontWeight: 800,
                    borderRadius: '999px',
                    padding: '.05rem .5rem',
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
