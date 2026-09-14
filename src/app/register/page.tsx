'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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

export default function RegisterPage() {
  const supabase = createClient()
  const [streets, setStreets] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

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
  })

  useEffect(() => {
    supabase
      .from('streets')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data }) => setStreets(data ?? []))
  }, [supabase])

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const houseType =
        form.house_type === 'Other' ? form.house_type_other.trim() : form.house_type

      const { error } = await supabase.from('registration_requests').insert({
        surname: form.surname.trim(),
        first_name: form.first_name.trim(),
        other_names: form.other_names.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim(),
        street_id: form.street_id || null,
        house_number: form.house_number.trim(),
        house_type: houseType || null,
        relationship: form.relationship,
      })
      if (error) throw error
      setSubmitted(true)
    } catch (err) {
      setError(friendlyDbError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <Link href="/" className="brand login-brand">
          <span className="brand-mark">V</span>
          <span>
            Verdant
            <small>Estate operations</small>
          </span>
        </Link>
        <span className="eyebrow">Resident registration</span>
        <h1>Join Evergreen Estate.</h1>

        {submitted ? (
          <>
            <p>
              Thanks — your registration has been submitted for review. An estate
              administrator will approve or follow up on it, and you&apos;ll receive
              your portal login details by email once approved.
            </p>
            <p className="login-help">
              <Link href="/login">← Back to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <p>
              Fill in your details below. An estate administrator will review your
              request before your account is activated.
            </p>
            <form onSubmit={submit} className="login-form" style={{ maxWidth: 480 }}>
              <label>
                Street *
                <select
                  required
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
              </label>

              <label>
                House / Block Number *
                <input
                  required
                  value={form.house_number}
                  onChange={(e) => update('house_number', e.target.value)}
                  placeholder="e.g. Block 4, House 12"
                />
              </label>

              <label>
                House Type
                <select
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
              </label>

              {form.house_type === 'Other' && (
                <label>
                  Specify House Type
                  <input
                    value={form.house_type_other}
                    onChange={(e) => update('house_type_other', e.target.value)}
                  />
                </label>
              )}

              <label>
                Surname *
                <input
                  required
                  value={form.surname}
                  onChange={(e) => update('surname', e.target.value)}
                />
              </label>

              <label>
                First Name *
                <input
                  required
                  value={form.first_name}
                  onChange={(e) => update('first_name', e.target.value)}
                />
              </label>

              <label>
                Other Names
                <input
                  value={form.other_names}
                  onChange={(e) => update('other_names', e.target.value)}
                />
              </label>

              <label>
                Phone *
                <input
                  required
                  type="tel"
                  pattern="[0-9+\-\s]{7,15}"
                  title="Enter a valid phone number"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                />
              </label>

              <label>
                Email *
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
              </label>

              <label>
                Status
                <select
                  value={form.relationship}
                  onChange={(e) => update('relationship', e.target.value)}
                >
                  <option value="owner">Home Owner</option>
                  <option value="tenant">Tenant</option>
                  <option value="family_member">Family Member</option>
                </select>
              </label>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <button className="action" disabled={loading}>
                {loading ? 'Submitting…' : 'Submit for review'}{' '}
                <span aria-hidden="true">→</span>
              </button>
            </form>
            <p className="login-help">
              <Link href="/login">← Back to sign in</Link>
            </p>
          </>
        )}
      </section>
      <aside className="login-aside">
        <span className="eyebrow">One estate, clear roles</span>
        <h2>The right view for every day.</h2>
      </aside>
    </main>
  )
}
