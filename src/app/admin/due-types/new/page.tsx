'use client'

import {
  useState,
} from 'react'
import {
  useRouter,
} from 'next/navigation'
import {
  createClient,
} from '@/lib/supabase/client'

export default function NewDueTypePage() {
  const router =
    useRouter()

  const supabase =
    createClient()

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
    form,
    setForm,
  ] = useState({
    name: '',
    amount: '',
    frequency:
      'monthly',
    billing_scope:
      'house',
  })

  async function handleSubmit(
    event:
      React.FormEvent
  ) {
    event.preventDefault()

    setLoading(true)
    setError(null)

    try {
      const amount =
        Number(
          form.amount
        )

      if (
        !Number.isFinite(
          amount
        ) ||
        amount <= 0
      ) {
        throw new Error(
          'Enter a valid amount greater than zero.'
        )
      }

      const {
        error:
          saveError,
      } =
        await supabase
          .from(
            'due_types'
          )
          .insert({
            name:
              form.name.trim(),

            amount,

            frequency:
              form.frequency,

            billing_scope:
              form.billing_scope,
          })

      if (saveError) {
        throw saveError
      }

      router.push(
        '/admin/due-types'
      )

      router.refresh()
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : 'Something went wrong'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-wrap max-w-2xl">
      <span className="eyebrow">
        Dues & billing
      </span>

      <h1 className="page-title">
        Create a due type
      </h1>

      <p className="page-lead mb-8">
        Choose whether this
        charge belongs to one
        property or to an
        individual resident.
      </p>

      <form
        onSubmit={
          handleSubmit
        }
        className="form-card space-y-5"
      >
        <div>
          <label className="block text-sm font-medium mb-1">
            Name *
          </label>

          <input
            required
            className="w-full border rounded-lg px-3 py-2"
            placeholder="e.g. Allocation Levy"
            value={
              form.name
            }
            onChange={(
              event
            ) =>
              setForm({
                ...form,
                name:
                  event
                    .target
                    .value,
              })
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Billing Scope *
          </label>

          <select
            required
            className="w-full border rounded-lg px-3 py-2"
            value={
              form
                .billing_scope
            }
            onChange={(
              event
            ) =>
              setForm({
                ...form,

                billing_scope:
                  event
                    .target
                    .value,
              })
            }
          >
            <option value="house">
              Household /
              Property
            </option>

            <option value="resident">
              Individual
              Resident
            </option>
          </select>

          <p className="text-xs text-gray-500 mt-1">
            Household charges
            are issued once per
            house. Individual
            charges belong only
            to the selected
            resident.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Amount (₦) *
          </label>

          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            className="w-full border rounded-lg px-3 py-2"
            value={
              form.amount
            }
            onChange={(
              event
            ) =>
              setForm({
                ...form,
                amount:
                  event
                    .target
                    .value,
              })
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Frequency *
          </label>

          <select
            required
            className="w-full border rounded-lg px-3 py-2"
            value={
              form.frequency
            }
            onChange={(
              event
            ) =>
              setForm({
                ...form,
                frequency:
                  event
                    .target
                    .value,
              })
            }
          >
            <option value="monthly">
              Monthly
            </option>

            <option value="quarterly">
              Quarterly
            </option>

            <option value="yearly">
              Yearly
            </option>

            <option value="one-time">
              One-time
            </option>
          </select>
        </div>

        {form.billing_scope ===
          'resident' && (
          <div className="rounded-lg border bg-gray-50 p-4 text-sm">
            <strong>
              Individual
              Resident billing
            </strong>

            <p className="mt-1 text-gray-600">
              When this charge
              is generated,
              Verdant will split
              the selected date
              range according to
              this frequency.
              Each period receives
              its own invoice.
            </p>
          </div>
        )}

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
          disabled={loading}
          className="action disabled:opacity-50"
        >
          {loading
            ? 'Saving...'
            : 'Save Due Type'}
        </button>
      </form>
    </div>
  )
}