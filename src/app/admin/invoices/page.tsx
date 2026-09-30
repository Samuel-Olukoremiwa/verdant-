import Link from 'next/link'

import {
  InvoicesTable,
} from '@/components/invoices-table'

import {
  SendRemindersButton,
} from '@/components/send-reminders-button'

import {
  normalizeInvoiceFilters,
} from '@/lib/invoices-directory'

import {
  loadInvoicesDirectory,
} from '@/lib/invoices-directory-server'

import {
  createClient,
} from '@/lib/supabase/server'

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams:
    Promise<
      Record<
        string,
        | string
        | string[]
        | undefined
      >
    >
}) {
  const params =
    await searchParams

  const filters =
    normalizeInvoiceFilters(
      params
    )

  const supabase =
    await createClient()

  let directory =
    await loadInvoicesDirectory(
      supabase,
      filters
    )

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        directory.total /
          directory.pageSize
      )
    )

  const effectivePage =
    Math.min(
      filters.page,
      totalPages
    )

  if (
    effectivePage !==
    filters.page
  ) {
    directory =
      await loadInvoicesDirectory(
        supabase,
        {
          ...filters,
          page:
            effectivePage,
        }
      )
  }

  const effectiveFilters = {
    ...filters,
    page:
      effectivePage,
  }

  const tableKey = [
    effectiveFilters.query,
    effectiveFilters.target ??
      '',
    effectiveFilters.scope,
    effectiveFilters.charge ??
      '',
    effectiveFilters.period ??
      '',
    effectiveFilters.dueDate ??
      '',
    effectiveFilters.status,
    effectiveFilters.outstanding,
    effectiveFilters.page,
  ].join('|')

  return (
    <div className="page-wrap">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">
            Dues &amp; billing
          </span>

          <h1 className="page-title">
            All Invoices
          </h1>

          <p className="page-lead">
            Household and personal charges, clearly separated in one place.
          </p>
        </div>

        <div className="header-actions">
          <Link
            href="/admin/due-types"
            className="action secondary"
          >
            Due types
          </Link>

          <Link
            href="/admin/invoices/generate"
            className="action"
          >
            + Generate dues
          </Link>
        </div>
      </div>

      <div
        style={{
          marginBottom:
            '1rem',
        }}
      >
        <SendRemindersButton />
      </div>

      <InvoicesTable
        key={
          tableKey
        }
        invoices={
          directory.rows
        }
        total={
          directory.total
        }
        totalBilled={
          directory.totalBilled
        }
        totalOutstanding={
          directory.totalOutstanding
        }
        page={
          effectivePage
        }
        pageSize={
          directory.pageSize
        }
        options={
          directory.options
        }
        filters={
          effectiveFilters
        }
      />
    </div>
  )
}

export const metadata = {
  title:
    'Admin Invoices',

  description:
    'Manage your estate account and workspace with Zadant.',

  robots: {
    index:
      false,
    follow:
      false,
  },
}