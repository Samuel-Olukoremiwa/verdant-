'use client'

import {
  use,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  useRouter,
} from 'next/navigation'

import Link from 'next/link'

import {
  createClient,
} from '@/lib/supabase/client'

import {
  friendlyDbError,
} from '@/lib/friendly-error'

type Frequency =
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'one-time'

type BillingScope =
  | 'house'
  | 'resident'

type FormState = {
  name: string

  amount: string

  frequency:
    Frequency

  billing_scope:
    BillingScope

  active:
    boolean

  auto_generate:
    boolean

  allow_advance_payment:
    boolean
}

export default function EditDueTypePage({
  params,
}: {
  params: Promise<{
    id: string
  }>
}) {
  const {
    id,
  } =
    use(
      params
    )

  const router =
    useRouter()

  const supabase =
    useMemo(
      () =>
        createClient(),
      []
    )

  const [
    loading,
    setLoading,
  ] = useState(
    true
  )

  const [
    saving,
    setSaving,
  ] = useState(
    false
  )

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(
    null
  )

  const [
    form,
    setForm,
  ] = useState<FormState>({
    name:
      '',

    amount:
      '',

    frequency:
      'monthly',

    billing_scope:
      'house',

    active:
      true,

    auto_generate:
      false,

    allow_advance_payment:
      false,
  })

  const supportsCapabilities =
    form.billing_scope ===
      'house' &&
    form.frequency ===
      'monthly'

  useEffect(
    () => {
      let active =
        true

      async function load() {
        setLoading(
          true
        )

        setError(
          null
        )

        const {
          data,
          error:
            loadError,
        } =
          await supabase
            .from(
              'due_types'
            )
            .select(`
              id,
              name,
              amount,
              frequency,
              billing_scope,
              active,
              auto_generate,
              allow_advance_payment
            `)
            .eq(
              'id',
              id
            )
            .single()

        if (
          !active
        ) {
          return
        }

        if (
          loadError ||
          !data
        ) {
          setError(
            'Could not load this due type.'
          )

          setLoading(
            false
          )

          return
        }

        const frequency =
          data.frequency as
            Frequency

        const billingScope =
          data.billing_scope as
            BillingScope

        setForm({
          name:
            data.name ??
            '',

          amount:
            String(
              data.amount ??
              ''
            ),

          frequency,

          billing_scope:
            billingScope,

          active:
            Boolean(
              data.active
            ),

          auto_generate:
            Boolean(
              data.auto_generate
            ),

          allow_advance_payment:
            Boolean(
              data.allow_advance_payment
            ),
        })

        setLoading(
          false
        )
      }

      void load()

      return () => {
        active =
          false
      }
    },
    [
      id,
      supabase,
    ]
  )

  function updateScope(
    billingScope:
      BillingScope
  ) {
    setForm(
      (
        previous
      ) => {
        const supported =
          billingScope ===
            'house' &&
          previous.frequency ===
            'monthly'

        return {
          ...previous,

          billing_scope:
            billingScope,

          auto_generate:
            supported
              ? previous.auto_generate
              : false,

          allow_advance_payment:
            supported
              ? previous.allow_advance_payment
              : false,
        }
      }
    )
  }

  function updateFrequency(
    frequency:
      Frequency
  ) {
    setForm(
      (
        previous
      ) => {
        const supported =
          previous.billing_scope ===
            'house' &&
          frequency ===
            'monthly'

        return {
          ...previous,

          frequency,

          auto_generate:
            supported
              ? previous.auto_generate
              : false,

          allow_advance_payment:
            supported
              ? previous.allow_advance_payment
              : false,
        }
      }
    )
  }

  async function handleSubmit(
    event:
      React.FormEvent
  ) {
    event.preventDefault()

    setSaving(
      true
    )

    setError(
      null
    )

    try {
      const name =
        form.name.trim()

      if (!name) {
        throw new Error(
          'Enter a due type name.'
        )
      }

      const amount =
        Number(
          form.amount
        )

      if (
        !Number.isFinite(
          amount
        ) ||
        amount <=
          0
      ) {
        throw new Error(
          'Enter a valid amount greater than zero.'
        )
      }

      const autoGenerate =
        supportsCapabilities
          ? form.auto_generate
          : false

      const allowAdvancePayment =
        supportsCapabilities
          ? form.allow_advance_payment
          : false

      const {
        error:
          saveError,
      } =
        await supabase
          .from(
            'due_types'
          )
          .update({
            name,

            amount,

            frequency:
              form.frequency,

            billing_scope:
              form.billing_scope,

            active:
              form.active,

            auto_generate:
              autoGenerate,

            allow_advance_payment:
              allowAdvancePayment,
          })
          .eq(
            'id',
            id
          )

      if (
        saveError
      ) {
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
        friendlyDbError(
          caughtError
        )
      )
    } finally {
      setSaving(
        false
      )
    }
  }

  if (
    loading
  ) {
    return (
      <div className="page-wrap max-w-2xl">
        Loading...
      </div>
    )
  }

  if (
    error &&
    !form.name
  ) {
    return (
      <div className="page-wrap max-w-2xl">
        <span className="eyebrow">
          Dues & billing
        </span>

        <h1 className="page-title">
          Edit due type
        </h1>

        <div className="form-card mt-6">
          <p
            role="alert"
            className="text-red-600"
          >
            {error}
          </p>

          <Link
            href="/admin/due-types"
            className="action secondary inline-block mt-4"
          >
            Back to Due Types
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrap max-w-2xl">
      <span className="eyebrow">
        Dues & billing
      </span>

      <h1 className="page-title">
        Edit due type
      </h1>

      <p className="page-lead mb-8">
        Update this charge and
        control how Zadant uses it
        for future billing.
        Historical invoices and
        payments are preserved.
      </p>

      <form
        onSubmit={
          handleSubmit
        }
        className="form-card space-y-6"
      >
        <section className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1">
              Name *
            </label>

            <input
              required
              className="w-full border rounded-lg px-3 py-2"
              value={
                form.name
              }
              onChange={(
                event
              ) =>
                setForm(
                  (
                    previous
                  ) => ({
                    ...previous,

                    name:
                      event
                        .target
                        .value,
                  })
                )
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
                form.billing_scope
              }
              onChange={(
                event
              ) =>
                updateScope(
                  event
                    .target
                    .value as
                    BillingScope
                )
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
              Changing the scope
              affects future
              billing only.
              Existing invoices
              retain their current
              target.
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
                setForm(
                  (
                    previous
                  ) => ({
                    ...previous,

                    amount:
                      event
                        .target
                        .value,
                  })
                )
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
                updateFrequency(
                  event
                    .target
                    .value as
                    Frequency
                )
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
        </section>

        <hr />

        <section>
          <h2 className="text-lg font-semibold">
            Availability
          </h2>

          <p className="mt-1 text-sm text-gray-600">
            Deactivating a due
            type prevents it from
            participating in new
            automatic generation
            and advance payment.
            Existing accounting
            history is untouched.
          </p>

          <label className="mt-4 flex items-start gap-3 rounded-lg border p-4 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={
                form.active
              }
              onChange={(
                event
              ) =>
                setForm(
                  (
                    previous
                  ) => ({
                    ...previous,

                    active:
                      event
                        .target
                        .checked,
                  })
                )
              }
            />

            <span>
              <strong className="block">
                Active
              </strong>

              <span className="text-sm text-gray-600">
                Keep this charge
                available for
                current estate
                billing.
              </span>
            </span>
          </label>
        </section>

        <hr />

        <section>
          <h2 className="text-lg font-semibold">
            Billing capabilities
          </h2>

          <p className="mt-1 text-sm text-gray-600">
            Automatic generation
            and advance payment
            are currently
            supported only for
            monthly household
            charges.
          </p>

          {!supportsCapabilities && (
            <div className="mt-4 rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
              These capabilities
              have been disabled
              because the selected
              scope or frequency
              is not supported.
            </div>
          )}

          <div className="mt-4 space-y-3">
            <label
              className={
                `flex items-start gap-3 rounded-lg border p-4 ${
                  supportsCapabilities
                    ? 'cursor-pointer'
                    : 'opacity-50 cursor-not-allowed'
                }`
              }
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                disabled={
                  !supportsCapabilities
                }
                checked={
                  supportsCapabilities &&
                  form.auto_generate
                }
                onChange={(
                  event
                ) =>
                  setForm(
                    (
                      previous
                    ) => ({
                      ...previous,

                      auto_generate:
                        event
                          .target
                          .checked,
                    })
                  )
                }
              />

              <span>
                <strong className="block">
                  Automatically
                  generate monthly
                  invoices
                </strong>

                <span className="text-sm text-gray-600">
                  Include this due
                  type in Zadant&apos;s
                  automatic
                  monthly
                  household
                  billing.
                </span>
              </span>
            </label>

            <label
              className={
                `flex items-start gap-3 rounded-lg border p-4 ${
                  supportsCapabilities
                    ? 'cursor-pointer'
                    : 'opacity-50 cursor-not-allowed'
                }`
              }
            >
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                disabled={
                  !supportsCapabilities
                }
                checked={
                  supportsCapabilities &&
                  form.allow_advance_payment
                }
                onChange={(
                  event
                ) =>
                  setForm(
                    (
                      previous
                    ) => ({
                      ...previous,

                      allow_advance_payment:
                        event
                          .target
                          .checked,
                    })
                  )
                }
              />

              <span>
                <strong className="block">
                  Allow advance
                  payment
                </strong>

                <span className="text-sm text-gray-600">
                  Allow the
                  household payer
                  to select and pay
                  future months for
                  this charge.
                </span>
              </span>
            </label>
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

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={
              saving
            }
            className="action disabled:opacity-50"
          >
            {saving
              ? 'Saving...'
              : 'Save Changes'}
          </button>

          <Link
            href="/admin/due-types"
            className="action secondary"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}