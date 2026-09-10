'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function EditResidentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [houseId, setHouseId] = useState<string | null>(null)

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

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('residents')
        .select(
          'full_name, phone, email, relationship, vehicle_plate_numbers, emergency_contact_name, emergency_contact_phone, move_in_date, house_id, houses ( address, house_type )'
        )
        .eq('id', id)
        .single()

      if (error || !data) {
        setError('Could not load resident')
        setLoading(false)
        return
      }

      const house = data.houses as unknown as { address: string; house_type: string | null } | null
      setHouseId(data.house_id)
      setForm({
        house_address: house?.address ?? '',
        house_type: house?.house_type ?? '',
        full_name: data.full_name ?? '',
        phone: data.phone ?? '',
        email: data.email ?? '',
        relationship: data.relationship ?? 'owner',
        vehicle_plate_numbers: (data.vehicle_plate_numbers ?? []).join(', '),
        emergency_contact_name: data.emergency_contact_name ?? '',
        emergency_contact_phone: data.emergency_contact_phone ?? '',
        move_in_date: data.move_in_date ?? '',
      })
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      if (houseId) {
        const { error: houseError } = await supabase
          .from('houses')
          .update({ address: form.house_address, house_type: form.house_type || null })
          .eq('id', houseId)
        if (houseError) throw houseError
      }

      const plates = form.vehicle_plate_numbers
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)

      const { error: residentError } = await supabase
        .from('residents')
        .update({
          full_name: form.full_name,
          phone: form.phone || null,
          email: form.email || null,
          relationship: form.relationship,
          vehicle_plate_numbers: plates.length > 0 ? plates : null,
          emergency_contact_name: form.emergency_contact_name || null,
          emergency_contact_phone: form.emergency_contact_phone || null,
          move_in_date: form.move_in_date || null,
        })
        .eq('id', id)

      if (residentError) throw residentError

      router.push(`/admin/residents/${id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto p-6">Loading...</div>
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Edit Resident</h1>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow border space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">House Address *</label>
            <input
              required
              className="w-full border rounded-lg px-3 py-2"
              value={form.house_address}
              onChange={(e) => update('house_address', e.target.value)}
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">House Type</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
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
            <label className="block text-sm font-medium mb-1">Vehicle Plate Number(s)</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Separate multiple plates with commas"
              value={form.vehicle_plate_numbers}
              onChange={(e) => update('vehicle_plate_numbers', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Emergency Contact Name</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.emergency_contact_name}
              onChange={(e) => update('emergency_contact_name', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Emergency Contact Phone</label>
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
            disabled={saving}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
