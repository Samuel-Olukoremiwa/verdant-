'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { friendlyDbError } from '@/lib/friendly-error'

const HOUSE_TYPES = [
  'Studio',
  '1-bedroom flat',
  '2-bedroom flat',
  '3-bedroom flat',
  '2-bedroom bungalow',
  '3-bedroom bungalow',
  '4 Bedroom Bungalow',
  '3-bedroom duplex',
  '4-bedroom duplex',
  '5-bedroom detached',
  'Commercial',
  'Other',
]

const HOUSE_NUMBERS =
  Array.from(
    { length: 50 },
    (_, index) =>
      String(index + 1)
  )

const BLOCK_FLAT_NUMBERS =
  Array.from(
    { length: 10 },
    (_, index) =>
      String(index + 1)
  )

function cleanPhoneInput(
  value: string
) {
  let cleaned =
    value.replace(
      /[^0-9+]/g,
      ''
    )

  if (
    cleaned.startsWith('+')
  ) {
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

export default function NewResidentPage() {
  const router =
    useRouter()

  const supabase =
    useMemo(
      () => createClient(),
      []
    )

  const [
    loading,
    setLoading,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null)

  const [
    houses,
    setHouses,
  ] = useState<
    {
      id: string
      address: string
    }[]
  >([])

  const [
    houseId,
    setHouseId,
  ] = useState('')

  const [
    streets,
    setStreets,
  ] = useState<
    {
      id: string
      name: string
    }[]
  >([])

  const [form, setForm] =
    useState({
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
      vehicle_plate_numbers: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      move_in_date: '',
      property_allocation_date: '',
    })

  useEffect(() => {
    supabase
      .from('houses')
      .select(
        'id, address'
      )
      .order('address')
      .then(
        ({
          data,
          error,
        }) => {
          if (error) {
            setError(
              'Could not load existing houses. Please reload before adding a resident.'
            )
          } else {
            setHouses(
              data ?? []
            )
          }
        }
      )

    supabase
      .from('streets')
      .select(
        'id, name'
      )
      .order(
        'name',
        {
          ascending: true,
        }
      )
      .then(
        ({
          data,
          error,
        }) => {
          if (error) {
            setError(
              'Could not load streets.'
            )
          } else {
            setStreets(
              data ?? []
            )
          }
        }
      )
  }, [supabase])

  function update(
    field: keyof typeof form,
    value: string
  ) {
    setForm(
      (previous) => ({
        ...previous,
        [field]: value,
      })
    )
  }

  async function handleSubmit(
    event: React.FormEvent
  ) {
    event.preventDefault()

    setLoading(true)
    setError(null)

    try {
      if (!houseId) {
        throw new Error(
          'Choose an existing household or create a new house.'
        )
      }

      if (!form.relationship) {
        throw new Error(
          'Select a status.'
        )
      }

      if (
        form.phone.length < 11 ||
        !/^\+?[0-9]{10,15}$/.test(
          form.phone
        )
      ) {
        throw new Error(
          'Phone number must contain only numbers and an optional leading +, with at least 11 characters.'
        )
      }

      if (
        !form.email.includes('@')
      ) {
        throw new Error(
          'Enter a valid email address containing @.'
        )
      }

      const moveIn =
        form.move_in_date

      const allocation =
        form.property_allocation_date

      if (!moveIn) {
        throw new Error(
          'Select the move-in date.'
        )
      }

      if (!allocation) {
        throw new Error(
          'Select the property allocation date.'
        )
      }

      if (
        houseId === 'new' &&
        !form.street_id
      ) {
        throw new Error(
          'Select a street for the new house.'
        )
      }

      if (
        houseId === 'new' &&
        !form.house_number
      ) {
        throw new Error(
          'Select a house number.'
        )
      }

      const emergencyPhone =
        form
          .emergency_contact_phone
          .trim()

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

      const fullName =
        [
          form.first_name,
          form.other_names,
          form.surname,
        ]
          .map(
            (value) =>
              value.trim()
          )
          .filter(Boolean)
          .join(' ')

      if (!fullName) {
        throw new Error(
          'Enter the resident name.'
        )
      }

      const houseType =
        form.house_type ===
        'Other'
          ? form
              .house_type_other
              .trim()
          : form.house_type

      const plates =
        form
          .vehicle_plate_numbers
          .split(',')
          .map(
            (plate) =>
              plate.trim()
          )
          .filter(Boolean)

      const {
        error:
          saveError,
      } =
        await supabase.rpc(
          'add_estate_resident',
          {
            p_house_id:
              houseId ===
              'new'
                ? null
                : houseId,

            p_house: {
              street_id:
                form.street_id ||
                null,

              house_number:
                form.house_number,

              house_type:
                houseType ||
                null,
            },

            p_resident: {
              full_name:
                fullName,

              phone:
                form.phone.trim(),

              email:
                form.email
                  .trim()
                  .toLowerCase(),

              relationship:
                form.relationship,

              block_number:
                form.block_number ||
                null,

              flat_number:
                form.flat_number ||
                null,

              vehicle_plate_numbers:
                plates,

              emergency_contact_name:
                form
                  .emergency_contact_name
                  .trim(),

              emergency_contact_phone:
                emergencyPhone,

              move_in_date:
                moveIn,

              property_allocation_date:
                allocation,
            },
          }
        )

      if (saveError) {
        throw saveError
      }

      router.push(
        '/admin/residents'
      )

      router.refresh()
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
    <div className="page-wrap max-w-3xl">
      <span className="eyebrow">
        Residents
      </span>

      <h1 className="page-title">
        Add a resident
      </h1>

      <p className="page-lead mb-8">
        Link the resident to an existing
        house or create a new house. Bills
        belong to the house, not to each
        individual resident.
      </p>

      <form
        onSubmit={handleSubmit}
        className="form-card space-y-5"
      >
        <label className="block font-medium">
          Household *

          <select
            required
            className="w-full border rounded-lg px-3 py-2"
            value={houseId}
            onChange={(event) =>
              setHouseId(
                event.target.value
              )
            }
          >
            <option
              value=""
              disabled
            >
              Choose an address or create a new one
            </option>

            <option value="new">
              Create a new house
            </option>

            {houses.map(
              (house) => (
                <option
                  key={house.id}
                  value={house.id}
                >
                  {house.address}
                </option>
              )
            )}
          </select>
        </label>

        <p className="text-sm text-gray-600">
          For tenants and family members,
          select the owner&apos;s existing
          house so everyone shares one
          household billing account.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {houseId ===
            'new' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Street *
                </label>

                <select
                  required
                  className="w-full border rounded-lg px-3 py-2"
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
                        key={
                          street.id
                        }
                        value={
                          street.id
                        }
                      >
                        {
                          street.name
                        }
                      </option>
                    )
                  )}
                </select>

                {streets.length ===
                  0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    No streets set up yet.{' '}
                    <Link
                      href="/admin/streets/new"
                      className="text-blue-600 hover:underline"
                    >
                      Add one first
                    </Link>
                    .
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  House Number *
                </label>

                <select
                  required
                  className="w-full border rounded-lg px-3 py-2"
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
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  House Type
                </label>

                <select
                  className="w-full border rounded-lg px-3 py-2"
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
              </div>

              {form.house_type ===
                'Other' && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Specify House Type
                  </label>

                  <input
                    className="w-full border rounded-lg px-3 py-2"
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
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              Block Number
            </label>

            <select
              className="w-full border rounded-lg px-3 py-2"
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Flat Number
            </label>

            <select
              className="w-full border rounded-lg px-3 py-2"
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Surname *
            </label>

            <input
              required
              className="w-full border rounded-lg px-3 py-2"
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              First Name *
            </label>

            <input
              required
              className="w-full border rounded-lg px-3 py-2"
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
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Other Names
            </label>

            <input
              className="w-full border rounded-lg px-3 py-2"
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Phone *
            </label>

            <input
              required
              type="tel"
              inputMode="tel"
              minLength={11}
              maxLength={16}
              pattern="\+?[0-9]{10,15}"
              title="Use only numbers and an optional + at the beginning."
              className="w-full border rounded-lg px-3 py-2"
              value={form.phone}
              onChange={(event) =>
                update(
                  'phone',
                  cleanPhoneInput(
                    event.target.value
                  )
                )
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Email *
            </label>

            <input
              required
              type="email"
              className="w-full border rounded-lg px-3 py-2"
              value={form.email}
              onChange={(event) =>
                update(
                  'email',
                  event.target.value
                )
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Status *
            </label>

            <select
              required
              className="w-full border rounded-lg px-3 py-2"
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Move-in Date *
            </label>

            <input
              required
              type="date"
              className="w-full border rounded-lg px-3 py-2"
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Property Allocation Date *
            </label>

            <input
              required
              type="date"
              className="w-full border rounded-lg px-3 py-2"
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
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Vehicle Plate Number(s)
            </label>

            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Separate multiple plates with commas"
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
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Emergency Contact Name
            </label>

            <input
              className="w-full border rounded-lg px-3 py-2"
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Emergency Contact Phone
            </label>

            <input
              type="tel"
              inputMode="tel"
              minLength={11}
              maxLength={16}
              pattern="\+?[0-9]{10,15}"
              className="w-full border rounded-lg px-3 py-2"
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
          </div>
        </div>

        {error && (
          <p className="text-red-600 text-sm">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="action disabled:opacity-50"
        >
          {loading
            ? 'Saving...'
            : 'Save Resident'}
        </button>
      </form>
    </div>
  )
}