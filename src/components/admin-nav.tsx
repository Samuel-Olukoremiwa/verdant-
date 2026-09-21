'use client'

import {SquaresFourIcon, UsersIcon, EnvelopeIcon, ReceiptIcon, WalletIcon, ChartBarIcon, ListChecksIcon, MapPinIcon, DoorIcon, UserGearIcon, ListIcon, XIcon, type Icon} from '@phosphor-icons/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function AdminNav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [alertCount,setAlertCount]=useState(0)
  const [pendingCount, setPendingCount] = useState(0)

  const navigation: [string, string, Icon][] = [
    ['Overview', '/admin', SquaresFourIcon],
    ['Residents', '/admin/residents', UsersIcon],
    ['Registrations', '/admin/registrations', EnvelopeIcon],
    ['Invoices', '/admin/invoices', ReceiptIcon],
    ['Expenses', '/admin/expenses', WalletIcon],
    ['Reports', '/admin/reports', ChartBarIcon],
    ['Due types', '/admin/due-types', ListChecksIcon],
    ['Streets', '/admin/streets', MapPinIcon],
    ['Gate activity', '/admin/access-logs', DoorIcon],
    ...(isSuperAdmin ? ([['Team', '/admin/team', UserGearIcon]] as [string, string, Icon][]) : []),
  ]

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('registration_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0))
  }, [])

  useEffect(()=>{
    let alive=true
    const db=createClient()
    const refresh=()=>{db.from('gate_due_alerts').select('id',{count:'exact',head:true}).gte('created_at',new Date(Date.now()-86400000).toISOString()).then(({count})=>{if(alive)setAlertCount(count??0)})}
    refresh();const timer=setInterval(refresh,30000)
    return ()=>{alive=false;clearInterval(timer)}
  },[])

  return (
    <>
      <button
        type="button"
        className="mobile-nav-toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="workspace-navigation"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <XIcon size={20}/> : <ListIcon size={20}/>}
      </button>
      <nav id="workspace-navigation" aria-label="Workspace" className={`nav-links${open ? ' open' : ''}`}>
        {navigation.map(([label, href, IconComponent]) => {
          const isActive =
            href === '/admin' ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`side-link${isActive ? ' active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="side-icon" aria-hidden="true">
                <IconComponent size={20}/>
              </span>
              {label}
              {href === '/admin/access-logs' && alertCount>0 && <span className="pill" title="Unpaid-dues entries in the last 24 hours">{alertCount}</span>}
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
