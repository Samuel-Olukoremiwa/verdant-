'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type HouseResident = {
  id: string
  full_name: string
  relationship: string
}

export function BillingResponsibilityCard({
  houseId,
  currentResponsibleId,
}: {
  houseId: string
  currentResponsibleId:
    | string
    | null
}) {
  const router =
    useRouter()

  const supabase =
    useMemo(
      () => createClient(),
      []
    )

  const [
    residents,
    setResidents,
  ] =
    useState<
      HouseResident[]
    >([])

  const [
    selected,
    setSelected,
  ] =
    useState(
      currentResponsibleId ??
        ''
    )

  const [
    savedResponsibleId,
    setSavedResponsibleId,
  ] =
    useState<
      string | null
    >(
      currentResponsibleId
    )

  const [
    loading,
    setLoading,
  ] =
    useState(false)

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null)

  useEffect(() => {
    let active = true

    async function load() {
      const {
        data,
        error,
      } =
        await supabase
          .from(
            'residents'
          )
          .select(
            'id, full_name, relationship'
          )
          .eq(
            'house_id',
            houseId
          )
          .eq(
            'is_active',
            true
          )
          .order(
            'full_name',
            {
              ascending:
                true,
            }
          )

      if (!active) {
        return
      }

      if (error) {
        setError(
          'Could not load household members'
        )
        return
      }

      setResidents(
        data ?? []
      )
    }

    void load()

    return () => {
      active = false
    }
  }, [
    houseId,
    supabase,
  ])

  const owner =
    residents.find(
      (resident) =>
        resident.relationship ===
        'owner'
    )

  async function handleSave() {
    setLoading(true)
    setError(null)

    try {
      const newResponsibleId =
        selected || null

      const response =
        await fetch(
          `/api/admin/houses/${houseId}/billing-responsible`,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                resident_id:
                  newResponsibleId,
              }),
          }
        )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data.error ??
            'Could not update billing responsibility'
        )
      }

      setSavedResponsibleId(
        newResponsibleId
      )

      router.refresh()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Something went wrong'
      )
    } finally {
      setLoading(false)
    }
  }

  const delegated =
    Boolean(
      savedResponsibleId
    )

  const savedResident =
    residents.find(
      (resident) =>
        resident.id ===
        savedResponsibleId
    )

  return (
    <article className="panel">
      <div className="panel-head">
        <h2>
          Billing responsibility
        </h2>
      </div>

      <div
        style={{
          padding:
            '1.25rem',
        }}
      >
        <p
          style={{
            fontSize:
              '.8rem',

            color:
              'var(--muted)',

            marginBottom:
              '.85rem',
          }}
        >
          The Home Owner is
          the default billing
          contact. Billing may
          be delegated to one
          active resident in
          the same house.
        </p>

        <div className="rounded-lg bg-gray-50 border p-3 text-sm mb-4">
          {delegated ? (
            <>
              <strong>
                Billing is
                currently
                delegated
                {savedResident
                  ? ` to ${savedResident.full_name}.`
                  : '.'}
              </strong>

              <p className="mt-1 text-gray-600">
                The designated
                resident receives
                and manages this
                house&apos;s
                bills. The Home
                Owner remains the
                recorded property
                owner.
              </p>
            </>
          ) : (
            <>
              <strong>
                Home Owner is
                responsible.
              </strong>

              <p className="mt-1 text-gray-600">
                No billing
                delegation is
                active.
              </p>
            </>
          )}
        </div>

        <label className="block text-sm font-medium mb-1">
          Billing contact
        </label>

        <select
          value={selected}
          onChange={(event) =>
            setSelected(
              event.target.value
            )
          }
          className="w-full border rounded-lg px-3 py-2 text-sm"
          style={{
            marginBottom:
              '.75rem',
          }}
        >
          <option value="">
            {owner
              ? `${owner.full_name} (Home Owner — default)`
              : 'Home Owner (default)'}
          </option>

          {residents
            .filter(
              (resident) =>
                resident.relationship !==
                'owner'
            )
            .map(
              (resident) => (
                <option
                  key={
                    resident.id
                  }
                  value={
                    resident.id
                  }
                >
                  {
                    resident.full_name
                  }
                  {' ('}
                  {resident.relationship ===
                  'family_member'
                    ? 'Family Member'
                    : 'Tenant'}
                  {')'}
                </option>
              )
            )}
        </select>

        <button
          type="button"
          onClick={
            handleSave
          }
          disabled={
            loading
          }
          className="action secondary"
        >
          {loading
            ? 'Saving...'
            : 'Save Billing Contact'}
        </button>

        {error && (
          <p className="text-xs text-red-600 mt-2">
            {error}
          </p>
        )}
      </div>
    </article>
  )
}