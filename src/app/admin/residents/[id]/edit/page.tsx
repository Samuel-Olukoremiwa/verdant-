'use client'

import { DateField } from '@/components/date-field'

import {
  use,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { friendlyDbError } from '@/lib/friendly-error'

type HouseOption = {
  id: string
  address: string
  house_type:
    | string
    | null
}

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

function splitFullName(
  fullName: string
) {
  const parts =
    fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean)

  if (
    parts.length === 0
  ) {
    return {
      first_name: '',
      other_names: '',
      surname: '',
    }
  }

  if (
    parts.length === 1
  ) {
    return {
      first_name:
        parts[0],
      other_names: '',
      surname: '',
    }
  }

  if (
    parts.length === 2
  ) {
    return {
      first_name:
        parts[0],
      other_names: '',
      surname:
        parts[1],
    }
  }

  return {
    first_name:
      parts[0],

    other_names:
      parts
        .slice(1, -1)
        .join(' '),

    surname:
      parts[
        parts.length - 1
      ],
  }
}

export default function EditResidentPage({
  params,
}: {
  params: Promise<{
    id: string
  }>
}) {
  const { id } =
    use(params)

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
  ] = useState(true)

  const [
    saving,
    setSaving,
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
    HouseOption[]
  >([])

  const [
    originalHouseId,
    setOriginalHouseId,
  ] = useState('')

  const [
    selectedHouseId,
    setSelectedHouseId,
  ] = useState('')

  const [form, setForm] =
    useState({
      surname: '',
      first_name: '',
      other_names: '',
      phone: '',
      email: '',
      relationship: '',
      block_number: '',
      flat_number: '',
      vehicle_plate_numbers: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      move_in_date: '',
      property_allocation_date: '',
    })

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError(null)

      const [
        residentResult,
        housesResult,
      ] =
        await Promise.all([
          supabase
            .from(
              'residents'
            )
            .select(`
              full_name,
              phone,
              email,
              relationship,
              block_number,
              flat_number,
              vehicle_plate_numbers,
              emergency_contact_name,
              emergency_contact_phone,
              move_in_date,
              property_allocation_date,
              house_id
            `)
            .eq(
              'id',
              id
            )
            .single(),

          supabase
            .from(
              'houses'
            )
            .select(
              'id, address, house_type'
            )
            .order(
              'address',
              {
                ascending:
                  true,
              }
            ),
        ])

      if (!active) {
        return
      }

      if (
        residentResult.error ||
        !residentResult.data
      ) {
        setError(
          'Could not load resident'
        )

        setLoading(false)
        return
      }

      if (
        housesResult.error
      ) {
        setError(
          'Could not load households'
        )

        setLoading(false)
        return
      }

      const resident =
        residentResult.data

      const {
        first_name,
        other_names,
        surname,
      } =
        splitFullName(
          resident.full_name ??
            ''
        )

      const currentHouseId =
        resident.house_id ??
        ''

      setHouses(
        (
          housesResult.data ??
          []
        ) as HouseOption[]
      )

      setOriginalHouseId(
        currentHouseId
      )

      setSelectedHouseId(
        currentHouseId
      )

      setForm({
        first_name,
        other_names,
        surname,

        phone:
          resident.phone ??
          '',

        email:
          resident.email ??
          '',

        relationship:
          resident
            .relationship ??
          '',

        block_number:
          resident
            .block_number ??
          '',

        flat_number:
          resident
            .flat_number ??
          '',

        vehicle_plate_numbers:
          (
            resident
              .vehicle_plate_numbers ??
            []
          ).join(', '),

        emergency_contact_name:
          resident
            .emergency_contact_name ??
          '',

        emergency_contact_phone:
          resident
            .emergency_contact_phone ??
          '',

        move_in_date:
          resident
            .move_in_date ??
          '',

        property_allocation_date:
          resident
            .property_allocation_date ??
          '',
      })

      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [
    id,
    supabase,
  ])

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

    setSaving(true)
    setError(null)

    try {
      if (
        !selectedHouseId
      ) {
        throw new Error(
          'Select the household this resident belongs to.'
        )
      }

      if (
        !form.relationship
      ) {
        throw new Error(
          'Select a status.'
        )
      }

      if (
        form.phone.length <
          11 ||
        !/^\+?[0-9]{10,15}$/.test(
          form.phone
        )
      ) {
        throw new Error(
          'Enter a valid phone number.'
        )
      }

      if (
        !form.email.includes(
          '@'
        )
      ) {
        throw new Error(
          'Enter a valid email address.'
        )
      }

      const moveIn =
        form.move_in_date

      const allocation =
        form
          .property_allocation_date

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

      const emergencyPhone =
        form
          .emergency_contact_phone
          .trim()

      if (
        emergencyPhone &&
        (
          emergencyPhone.length <
            11 ||
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
          'update_estate_resident',
          {
            p_resident_id:
              id,

            p_house_id:
              selectedHouseId,

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
        `/admin/residents/${id}`
      )

      router.refresh()
    } catch (caughtError) {
      setError(
        friendlyDbError(
          caughtError
        )
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        Loading...
      </div>
    )
  }

  const movingHouse =
    Boolean(
      originalHouseId
    ) &&
    selectedHouseId !==
      originalHouseId

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">
        Edit Resident
      </h1>

      <p className="text-sm text-gray-600 mb-6">
        Changing the household moves the
        resident to another house. It does
        not rename the old house or move
        that house&apos;s invoices.
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-xl shadow border space-y-6"
      >
        <section>
          <h2 className="text-lg font-semibold mb-2">
            Household assignment
          </h2>

          <label className="block text-sm font-medium mb-1">
            Household *
          </label>

          <select
            required
            className="w-full border rounded-lg px-3 py-2"
            value={
              selectedHouseId
            }
            onChange={(event) =>
              setSelectedHouseId(
                event.target.value
              )
            }
          >
            <option value="">
              Select household
            </option>

            {houses.map(
              (house) => (
                <option
                  key={
                    house.id
                  }
                  value={
                    house.id
                  }
                >
                  {
                    house.address
                  }
                  {house.house_type
                    ? ` — ${house.house_type}`
                    : ''}
                </option>
              )
            )}
          </select>

          {movingHouse && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>
                Household move
              </strong>

              <p className="mt-1">
                Existing invoices and
                payment history stay with
                the former house.
              </p>
            </div>
          )}
        </section>

        <hr />

        <section>
          <h2 className="text-lg font-semibold mb-4">
            Resident location
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>
        </section>

        <hr />

        <section>
          <h2 className="text-lg font-semibold mb-4">
            Resident details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                className="w-full border rounded-lg px-3 py-2"
                value={
                  form.phone
                }
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
                value={
                  form.email
                }
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

              <DateField
                required
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

              <DateField
                required
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
        </section>

        {error && (
          <p
            role="alert"
            className="text-red-600 text-sm"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="action"
        >
          {saving
            ? 'Saving...'
            : movingHouse
              ? 'Save & Move Resident'
              : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}