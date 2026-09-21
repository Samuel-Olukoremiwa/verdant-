'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { friendlyDbError } from '@/lib/friendly-error'

const HOUSE_TYPES = [
  'Studio',
  '1-bedroom flat',
  '2-bedroom flat',
  '3-bedroom flat',
  '2-bedroom bungalow',
  '3-bedroom bungalow',
  '3-bedroom duplex',
  '4-bedroom duplex',
  '5-bedroom detached',
  'Commercial',
  'Other',
]

// Best-effort split of an existing single full_name into parts, for residents
// created before the name fields were split out. Admin can adjust afterward.
function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first_name: '', other_names: '', surname: '' }
  if (parts.length === 1) return { first_name: parts[0], other_names: '', surname: '' }
  if (parts.length === 2) return { first_name: parts[0], other_names: '', surname: parts[1] }
  return {
    first_name: parts[0],
    other_names: parts.slice(1, -1).join(' '),
    surname: parts[parts.length - 1],
  }
}

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
  const [streets, setStreets] = useState<{ id: string; name: string }[]>([])

  const [form, setForm] = useState({
    street_id: '',
    house_number: '',
    house_type: '',
    house_type_other: '',
    surname: '',
    first_name: '',
    other_names: '',
    phone: '',
    email: '',
    relationship: 'owner',
    vehicle_plate_numbers: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    move_in_date: '',
    property_allocation_date: '',
  })

  useEffect(() => {
    supabase
      .from('streets')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data }) => setStreets(data ?? []))
  }, [supabase])

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('residents')
        .select(
          'full_name, phone, email, relationship, vehicle_plate_numbers, emergency_contact_name, emergency_contact_phone, move_in_date, property_allocation_date, house_id, houses:houses!residents_house_id_fkey ( house_type, street_id, house_number )'
        )
        .eq('id', id)
        .single()

      if (error || !data) {
        setError('Could not load resident')
        setLoading(false)
        return
      }

      const house = data.houses as unknown as {
        house_type: string | null
        street_id: string | null
        house_number: string | null
      } | null
      setHouseId(data.house_id)

      const knownType = house?.house_type && HOUSE_TYPES.includes(house.house_type)
      const { first_name, other_names, surname } = splitFullName(data.full_name ?? '')

      setForm({
        street_id: house?.street_id ?? '',
        house_number: house?.house_number ?? '',
        house_type: knownType ? house!.house_type! : house?.house_type ? 'Other' : '',
        house_type_other: knownType ? '' : house?.house_type ?? '',
        first_name,
        other_names,
        surname,
        phone: data.phone ?? '',
        email: data.email ?? '',
        relationship: data.relationship ?? 'owner',
        vehicle_plate_numbers: (data.vehicle_plate_numbers ?? []).join(', '),
        emergency_contact_name: data.emergency_contact_name ?? '',
        emergency_contact_phone: data.emergency_contact_phone ?? '',
        move_in_date: data.move_in_date ?? '',
        property_allocation_date: data.property_allocation_date ?? '',
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
      if(!form.move_in_date || !form.property_allocation_date) throw new Error('Move-in date and property allocation date are required')
      const street = streets.find((s) => s.id === form.street_id)
      if (!street) throw new Error('Select a street')

      const houseType =
        form.house_type === 'Other' ? form.house_type_other.trim() : form.house_type
      const address = `${form.house_number.trim()}, ${street.name}`

      if (houseId) {
        const { error: houseError } = await supabase
          .from('houses')
          .update({
            address,
            house_type: houseType || null,
            street_id: form.street_id,
            house_number: form.house_number.trim(),
          })
          .eq('id', houseId)
        if (houseError) throw houseError
      }

      const fullName = [form.first_name, form.other_names, form.surname]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' ')

      const plates = form.vehicle_plate_numbers
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)

      const { error: residentError } = await supabase
        .from('residents')
        .update({
          full_name: fullName,
          phone: form.phone || null,
          email: form.email || null,
          relationship: form.relationship,
          vehicle_plate_numbers: plates.length > 0 ? plates : null,
          emergency_contact_name: form.emergency_contact_name || null,
          emergency_contact_phone: form.emergency_contact_phone || null,
          move_in_date: form.move_in_date || null,
          property_allocation_date: form.property_allocation_date || null,
        })
        .eq('id', id)

      if (residentError) throw residentError

      router.push(`/admin/residents/${id}`)
      router.refresh()
    } catch (err) {
      setError(friendlyDbError(err))
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
          <div>
            <label className="block text-sm font-medium mb-1">Street *</label>
            <select
              required
              className="w-full border rounded-lg px-3 py-2"
              value={form.street_id}
              onChange={(e) => update('street_id', e.target.value)}
            >
              <option value="">Select a street</option>
              {streets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {streets.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">
                No streets set up yet.{' '}
                <Link href="/admin/streets/new" className="text-blue-600 hover:underline">
                  Add one first
                </Link>
                .
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">House / Block Number *</label>
            <input
              required
              className="w-full border rounded-lg px-3 py-2"
              value={form.house_number}
              onChange={(e) => update('house_number', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">House Type</label>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={form.house_type}
              onChange={(e) => update('house_type', e.target.value)}
            >
              <option value="">Select a house type</option>
              {HOUSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {form.house_type === 'Other' && (
            <div>
              <label className="block text-sm font-medium mb-1">Specify House Type</label>
              <input
                className="w-full border rounded-lg px-3 py-2"
                value={form.house_type_other}
                onChange={(e) => update('house_type_other', e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Surname *</label>
            <input
              required
              className="w-full border rounded-lg px-3 py-2"
              value={form.surname}
              onChange={(e) => update('surname', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">First Name *</label>
            <input
              required
              className="w-full border rounded-lg px-3 py-2"
              value={form.first_name}
              onChange={(e) => update('first_name', e.target.value)}
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Other Names</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.other_names}
              onChange={(e) => update('other_names', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Phone *</label>
            <input
              required
              type="tel"
              pattern="[0-9+\-\s]{7,15}"
              title="Enter a valid phone number (7-15 digits, may include +, -, spaces)"
              className="w-full border rounded-lg px-3 py-2"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input
              required
              type="email"
              className="w-full border rounded-lg px-3 py-2"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={form.relationship}
              onChange={(e) => update('relationship', e.target.value)}
            >
              <option value="owner">Home Owner</option>
              <option value="tenant">Tenant</option>
              <option value="family_member">Family Member</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Move-in Date *</label>
            <input
              type="date"
              required
              className="w-full border rounded-lg px-3 py-2"
              value={form.move_in_date}
              onChange={(e) => update('move_in_date', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Property Allocation Date *</label>
            <input
              type="date"
              required
              className="w-full border rounded-lg px-3 py-2"
              value={form.property_allocation_date}
              onChange={(e) => update('property_allocation_date', e.target.value)}
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
