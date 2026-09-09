'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewResidentPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    house_address: '',
    house_type: '',
    full_name: '',
    phone: '',
    email: '',
    relationship: 'owner',
    vehicle_plate_numbers: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    move_in_date: '',
  })

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // 1. Create the house record
      const { data: house, error: houseError } = await supabase
        .from('houses')
        .insert({
          address: form.house_address,
          house_type: form.house_type || null,
        })
        .select()
        .single()

      if (houseError) throw houseError

      // 2. Generate a unique QR code value for this resident
      const qrValue = `RES-${crypto.randomUUID()}`

      // 3. Create the resident record
      const plates = form.vehicle_plate_numbers
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)

      const { error: residentError } = await supabase.from('residents').insert({
        house_id: house.id,
        full_name: form.full_name,
        phone: form.phone || null,
        email: form.email || null,
        relationship: form.relationship,
        vehicle_plate_numbers: plates.length > 0 ? plates : null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        move_in_date: form.move_in_date || null,
        qr_code_value: qrValue,
      })

      if (residentError) throw residentError

      router.push('/admin/residents')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrap max-w-3xl">
      <span className="eyebrow">Residents</span>
      <h1 className="page-title">Add a resident</h1>
      <p className="page-lead mb-8">Create their home record and a unique access identity in one step.</p>

      <form onSubmit={handleSubmit} className="form-card space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">House Address *</label>
            <input
              required
              className="w-full border rounded-lg px-3 py-2"
              placeholder="e.g. Block 4, House 12"
              value={form.house_address}
              onChange={(e) => update('house_address', e.target.value)}
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">House Type</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder="e.g. 3-bedroom duplex"
              value={form.house_type}
              onChange={(e) => update('house_type', e.target.value)}
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Full Name *</label>
            <input
              required
              className="w-full border rounded-lg px-3 py-2"
              value={form.full_name}
              onChange={(e) => update('full_name', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded-lg px-3 py-2"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Relationship</label>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={form.relationship}
              onChange={(e) => update('relationship', e.target.value)}
            >
              <option value="owner">Owner</option>
              <option value="tenant">Tenant</option>
              <option value="family_member">Family Member</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Move-in Date</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2"
              value={form.move_in_date}
              onChange={(e) => update('move_in_date', e.target.value)}
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">
              Vehicle Plate Number(s)
            </label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Separate multiple plates with commas"
              value={form.vehicle_plate_numbers}
              onChange={(e) => update('vehicle_plate_numbers', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Emergency Contact Name
            </label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.emergency_contact_name}
              onChange={(e) => update('emergency_contact_name', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Emergency Contact Phone
            </label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.emergency_contact_phone}
              onChange={(e) => update('emergency_contact_phone', e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="action disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Resident'}
          </button>
        </div>
      </form>
    </div>
  )
}
