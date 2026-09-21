'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type HouseResident = { id: string; full_name: string; relationship: string }

export function BillingResponsibilityCard({
  houseId,
  currentResponsibleId,
}: {
  houseId: string
  currentResponsibleId: string | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const [residents, setResidents] = useState<HouseResident[]>([])
  const [selected, setSelected] = useState(currentResponsibleId ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('residents')
      .select('id, full_name, relationship')
      .eq('house_id', houseId)
      .eq('is_active', true)
      .then(({ data, error }) => { if (error) setError('Could not load household members'); else setResidents(data ?? []) })
  }, [houseId, supabase])

  const owner = residents.find((r) => r.relationship === 'owner')

  async function handleSave() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/houses/${houseId}/billing-responsible`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resident_id: selected || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not update')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="panel">
      <div className="panel-head">
        <h2>Billing responsibility</h2>
      </div>
      <div style={{ padding: '1.25rem' }}>
        <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '.85rem' }}>
          By default, the Home Owner sees and pays this house&apos;s bills. If they&apos;re
          away and a tenant or family member is managing things, assign them here — the
          owner can still view and pay bills.
        </p>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          style={{ marginBottom: '.75rem' }}
        >
          <option value="">
            {owner ? `${owner.full_name} (Home Owner — default)` : 'Home Owner (default)'}
          </option>
          {residents
            .filter((r) => r.relationship !== 'owner')
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name} ({r.relationship === 'family_member' ? 'Family Member' : 'Tenant'})
              </option>
            ))}
        </select>
        <button onClick={handleSave} disabled={loading} className="action secondary">
          {loading ? 'Saving...' : 'Save'}
        </button>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    </article>
  )
}
