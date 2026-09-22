'use client'

import { SiteTools } from '@/components/site-tools'
import Link from 'next/link'
import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import { friendlyDbError } from '@/lib/friendly-error'

const HOUSE_TYPES = [
  'Studio',
  '1-bedroom flat',
  '2-bedroom flat',
  '3-bedroom flat',
  '2-bedroom bungalow',
  '3-bedroom bungalow',
  '4-bedroom bungalow',
  '3-bedroom duplex',
  '4-bedroom duplex',
  '5-bedroom detached',
  'Commercial',
  'Other',
]

const HOUSE_NUMBERS = Array.from(
  { length: 50 },
  (_, index) => String(index + 1)
)

const BLOCK_FLAT_NUMBERS = Array.from(
  { length: 10 },
  (_, index) => String(index + 1)
)

function cleanPhoneInput(value: string) {
  let cleaned = value.replace(
    /[^0-9+]/g,
    ''
  )

  if (cleaned.startsWith('+')) {
    cleaned =
      '+' +
      cleaned
        .slice(1)
        .replace(/\+/g, '')
  } else {
    cleaned =
      cleaned.replace(/\+/g, '')
  }

  return cleaned.slice(0, 16)
}

export default function RegisterPage() {
  const supabase = useMemo(
    () => createClient(),
    []
  )

  const [streets, setStreets] =
    useState<
      {
        id: string
        name: string
      }[]
    >([])

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [submitted, setSubmitted] =
    useState(false)

  const [consent, setConsent] =
    useState(false)

  const [website, setWebsite] =
    useState('')

  const [form, setForm] = useState({
    street_id: '',
    house_number: '',
    block_number: '',
    flat_number: '',
    house_type: '',
    house_type_other: '',
    surname: '',
    first_name: '',
    other_names: '',
    phone: '',
    email: '',
    relationship: '',
    move_in_date: '',
    property_allocation_date: '',
    vehicle_plate_numbers: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
  })

  useEffect(() => {
    supabase
      .from('streets')
      .select('id, name')
      .order('name', {
        ascending: true,
      })
      .then(({ data, error }) => {
        if (error) {
          setError(
            'Could not load estate streets. Please reload the page.'
          )
          return
        }

        setStreets(data ?? [])
      })
  }, [supabase])

  function update(
    field: keyof typeof form,
    value: string
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }))
  }

  async function submit(
    event: React.FormEvent
  ) {
    event.preventDefault()

    setLoading(true)
    setError(null)

    try {
      if (!form.relationship) {
        throw new Error(
          'Select a status'
        )
      }

      if (
        form.phone.length < 11 ||
        !/^\+?[0-9]{10,15}$/.test(
          form.phone
        )
      ) {
        throw new Error(
          'Phone number must contain only numbers and an optional + at the beginning, with at least 11 characters.'
        )
      }

      if (!form.email.includes('@')) {
        throw new Error(
          'Enter a valid email address containing @.'
        )
      }

      const moveInDate =
        form.move_in_date

      const allocationDate =
        form.property_allocation_date

      if (!moveInDate) {
        throw new Error(
          'Select the move-in date.'
        )
      }

      if (!allocationDate) {
        throw new Error(
          'Select the property allocation date.'
        )
      }

      const emergencyPhone =
        form.emergency_contact_phone.trim()

      if (
        emergencyPhone &&
        (
          emergencyPhone.length < 11 ||
          !/^\+?[0-9]{10,15}$/.test(
            emergencyPhone
          )
        )
      ) {
        throw new Error(
          'Enter a valid emergency contact phone number.'
        )
      }

      const houseType =
        form.house_type === 'Other'
          ? form.house_type_other.trim()
          : form.house_type

      const plates =
        form.vehicle_plate_numbers
          .split(',')
          .map((plate) =>
            plate.trim()
          )
          .filter(Boolean)

      const response = await fetch(
        '/api/registrations',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            consent,
            website,

            surname:
              form.surname.trim(),

            first_name:
              form.first_name.trim(),

            other_names:
              form.other_names.trim() ||
              null,

            phone:
              form.phone.trim(),

            email:
              form.email
                .trim()
                .toLowerCase(),

            street_id:
              form.street_id,

            house_number:
              form.house_number,

            block_number:
              form.block_number ||
              null,

            flat_number:
              form.flat_number ||
              null,

            house_type:
              houseType || null,

            relationship:
              form.relationship,

            move_in_date:
              moveInDate,

            property_allocation_date:
              allocationDate,

            vehicle_plate_numbers:
              plates,

            emergency_contact_name:
              form
                .emergency_contact_name
                .trim() || null,

            emergency_contact_phone:
              emergencyPhone || null,
          }),
        }
      )

      const result =
        await response.json()

      if (!response.ok) {
        throw new Error(
          result.error ||
            'Could not submit registration'
        )
      }

      setSubmitted(true)
    } catch (caughtError) {
      setError(
        friendlyDbError(
          caughtError
        )
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      id="main-content"
      className="login-page"
    >
      <div className="auth-tools">
        <SiteTools />
      </div>

      <section className="login-panel">
        <Link
          href="/"
          className="brand login-brand"
        >
          <span className="brand-mark">
            V
          </span>

          <span>
            Verdant
            <small>
              Estate operations
            </small>
          </span>
        </Link>

        <span className="eyebrow">
          Resident registration
        </span>

        <h1>
          Join your estate.
        </h1>

        {submitted ? (
          <>
            <p>
              Thanks — your registration
              has been submitted for
              review.
            </p>

            <p>
              Once approved, you&apos;ll
              receive an email invitation
              to set your password and
              access the resident portal.
            </p>

            <p className="login-help">
              <Link href="/login">
                ← Back to sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            <p>
              Enter your own address
              details below. If another
              resident has already
              registered the same house,
              Verdant will automatically
              attach you to that household
              instead of creating
              duplicate bills.
            </p>

            <form
              onSubmit={submit}
              className="login-form"
              style={{
                maxWidth: 520,
              }}
            >
              <label>
                Street *

                <select
                  required
                  value={
                    form.street_id
                  }
                  onChange={(event) =>
                    update(
                      'street_id',
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Select a street
                  </option>

                  {streets.map(
                    (street) => (
                      <option
                        key={street.id}
                        value={street.id}
                      >
                        {street.name}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                House Number *

                <select
                  required
                  value={
                    form.house_number
                  }
                  onChange={(event) =>
                    update(
                      'house_number',
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Select house number
                  </option>

                  {HOUSE_NUMBERS.map(
                    (number) => (
                      <option
                        key={number}
                        value={number}
                      >
                        {number}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Block Number

                <select
                  value={
                    form.block_number
                  }
                  onChange={(event) =>
                    update(
                      'block_number',
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    No block number
                  </option>

                  {BLOCK_FLAT_NUMBERS.map(
                    (number) => (
                      <option
                        key={number}
                        value={number}
                      >
                        {number}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                Flat Number

                <select
                  value={
                    form.flat_number
                  }
                  onChange={(event) =>
                    update(
                      'flat_number',
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    No flat number
                  </option>

                  {BLOCK_FLAT_NUMBERS.map(
                    (number) => (
                      <option
                        key={number}
                        value={number}
                      >
                        {number}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                House Type

                <select
                  value={
                    form.house_type
                  }
                  onChange={(event) =>
                    update(
                      'house_type',
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Select a house type
                  </option>

                  {HOUSE_TYPES.map(
                    (type) => (
                      <option
                        key={type}
                        value={type}
                      >
                        {type}
                      </option>
                    )
                  )}
                </select>
              </label>

              {form.house_type ===
                'Other' && (
                <label>
                  Specify House Type

                  <input
                    value={
                      form
                        .house_type_other
                    }
                    onChange={(event) =>
                      update(
                        'house_type_other',
                        event.target.value
                      )
                    }
                  />
                </label>
              )}

              <label>
                Surname *

                <input
                  required
                  value={
                    form.surname
                  }
                  onChange={(event) =>
                    update(
                      'surname',
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                First Name *

                <input
                  required
                  value={
                    form.first_name
                  }
                  onChange={(event) =>
                    update(
                      'first_name',
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                Other Names

                <input
                  value={
                    form.other_names
                  }
                  onChange={(event) =>
                    update(
                      'other_names',
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                Phone *

                <input
                  required
                  type="tel"
                  inputMode="tel"
                  minLength={11}
                  maxLength={16}
                  pattern="\+?[0-9]{10,15}"
                  title="Use only numbers and an optional + at the beginning. Minimum 11 characters."
                  value={form.phone}
                  onChange={(event) =>
                    update(
                      'phone',
                      cleanPhoneInput(
                        event.target.value
                      )
                    )
                  }
                  placeholder="08012345678"
                />
              </label>

              <label>
                Email *

                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    update(
                      'email',
                      event.target.value
                    )
                  }
                  placeholder="name@example.com"
                />
              </label>

              <label>
                Status *

                <select
                  required
                  value={
                    form.relationship
                  }
                  onChange={(event) =>
                    update(
                      'relationship',
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    Select a status
                  </option>

                  <option value="owner">
                    Home Owner
                  </option>

                  <option value="tenant">
                    Tenant
                  </option>

                  <option value="family_member">
                    Family Member
                  </option>
                </select>
              </label>

              <label>
                Move-in Date *

                <input
                  required
                  type="date"
                  value={
                    form.move_in_date
                  }
                  onChange={(event) =>
                    update(
                      'move_in_date',
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                Property Allocation Date *

                <input
                  required
                  type="date"
                  value={
                    form
                      .property_allocation_date
                  }
                  onChange={(event) =>
                    update(
                      'property_allocation_date',
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                Vehicle Plate Number(s)

                <input
                  value={
                    form
                      .vehicle_plate_numbers
                  }
                  onChange={(event) =>
                    update(
                      'vehicle_plate_numbers',
                      event.target.value
                    )
                  }
                  placeholder="ABC-123-XY, LND-456-KJ"
                />
              </label>

              <label>
                Emergency Contact Name

                <input
                  value={
                    form
                      .emergency_contact_name
                  }
                  onChange={(event) =>
                    update(
                      'emergency_contact_name',
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                Emergency Contact Phone

                <input
                  type="tel"
                  inputMode="tel"
                  minLength={11}
                  maxLength={16}
                  pattern="\+?[0-9]{10,15}"
                  value={
                    form
                      .emergency_contact_phone
                  }
                  onChange={(event) =>
                    update(
                      'emergency_contact_phone',
                      cleanPhoneInput(
                        event.target.value
                      )
                    )
                  }
                />
              </label>

              {error && (
                <p
                  className="form-error"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <label
                className="honeypot"
                aria-hidden="true"
              >
                Website

                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) =>
                    setWebsite(
                      event.target.value
                    )
                  }
                />
              </label>

              <p className="consent-note">
                Use sample details only
                in this demonstration.
                Read the{' '}
                <Link href="/privacy">
                  privacy draft
                </Link>{' '}
                before submitting.
              </p>

              <label className="consent-note">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={(event) =>
                    setConsent(
                      event.target.checked
                    )
                  }
                  style={{
                    width: 18,
                    minHeight: 18,
                    display: 'inline',
                    marginRight: 8,
                  }}
                />

                I understand this is a
                demonstration and confirm
                that I am submitting
                sample details.
              </label>

              <button
                className="action"
                disabled={loading}
              >
                {loading
                  ? 'Submitting…'
                  : 'Submit for review'}{' '}

                <span aria-hidden="true">
                  →
                </span>
              </button>
            </form>

            <p className="login-help">
              <Link href="/login">
                ← Back to sign in
              </Link>
            </p>
          </>
        )}
      </section>

      <aside className="login-aside">
        <span className="eyebrow">
          One estate, clear roles
        </span>

        <h2>
          The right view for every day.
        </h2>
      </aside>
    </main>
  )
}