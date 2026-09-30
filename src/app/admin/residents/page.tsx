import Link from 'next/link'

import {
  ResidentsTable,
} from '@/components/residents-table'

import {
  loadResidentsDirectory,
  normalizeResidentFilters,
} from '@/lib/residents-directory-server'

import {
  createClient,
} from '@/lib/supabase/server'

export default async function ResidentsPage({
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
    normalizeResidentFilters(
      params
    )

  const supabase =
    await createClient()

  const [
    directoryResult,
    streetsResult,
  ] =
    await Promise.all([
      loadResidentsDirectory(
        supabase,
        filters
      ),

      supabase
        .from(
          'streets'
        )
        .select(
          'id,name'
        )
        .order(
          'name',
          {
            ascending:
              true,
          }
        ),
    ])

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        directoryResult.total /
          directoryResult.pageSize
      )
    )

  const effectivePage =
    Math.min(
      filters.page,
      totalPages
    )

  let directory =
    directoryResult

  if (
    effectivePage !==
    filters.page
  ) {
    directory =
      await loadResidentsDirectory(
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
    effectiveFilters.street ??
      'all',
    effectiveFilters.status,
    effectiveFilters.dues,
    effectiveFilters.page,
  ].join('|')

  return (
    <div className="page-wrap">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">
            Estate directory
          </span>

          <h1 className="page-title">
            Residents
          </h1>

          <p className="page-lead">
            Personal dues and
            household billing
            are kept separate.
          </p>
        </div>

        <Link
          href="/admin/residents/new"
          className="action"
        >
          + Add Resident
        </Link>
      </div>

      <ResidentsTable
        key={
          tableKey
        }
        residents={
          directory.rows
        }
        total={
          directory.total
        }
        page={
          effectivePage
        }
        pageSize={
          directory.pageSize
        }
        streets={
          streetsResult.data ??
          []
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
    'Admin Residents',

  description:
    'Manage estate residents and billing with Zadant.',

  robots: {
    index:
      false,

    follow:
      false,
  },
}