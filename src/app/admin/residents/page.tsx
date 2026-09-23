import {
  createClient,
} from '@/lib/supabase/server'
import Link from 'next/link'
import {
  readAll,
} from '@/lib/read-all'
import {
  ResidentsTable,
} from '@/components/residents-table'

type ResidentRow = {
  id: string
  house_id:
    | string
    | null
  full_name: string
  phone:
    | string
    | null
  relationship: string
  is_active: boolean

  houses:
    | {
        address: string
        house_type:
          | string
          | null
        street_id:
          | string
          | null
        billing_responsible_resident_id:
          | string
          | null

        streets:
          | {
              name: string
            }
          | null
      }
    | null
}

type InvoiceRow = {
  id: string
  house_id:
    | string
    | null
  resident_id:
    | string
    | null
  amount: number
  amount_paid:
    | number
    | null
}

export default async function ResidentsPage({
  searchParams,
}: {
  searchParams:
    Promise<{
      dues?: string
    }>
}) {
  const initialHasDues =
    (
      await searchParams
    ).dues === 'yes'

  const supabase =
    await createClient()

  const rawResidents =
    await readAll(
      (
        from,
        to
      ) =>
        supabase
          .from(
            'residents'
          )
          .select(`
            id,
            house_id,
            full_name,
            phone,
            email,
            relationship,
            is_active,
            houses:houses!residents_house_id_fkey (
              address,
              house_type,
              street_id,
              billing_responsible_resident_id,
              streets (
                name
              )
            )
          `)
          .order('id')
          .range(
            from,
            to
          )
    )

  const residents =
    (
      rawResidents ??
      []
    ) as unknown as
      ResidentRow[]

  const {
    data:
      streets,
  } =
    await supabase
      .from('streets')
      .select(
        'id, name'
      )
      .order(
        'name',
        {
          ascending:
            true,
        }
      )

  const rawBills =
    await readAll(
      (
        from,
        to
      ) =>
        supabase
          .from(
            'invoices'
          )
          .select(`
            id,
            house_id,
            resident_id,
            amount,
            amount_paid
          `)
          .order('id')
          .range(
            from,
            to
          )
    )

  const bills =
    (
      rawBills ??
      []
    ) as unknown as
      InvoiceRow[]

  const houseBalances =
    new Map<
      string,
      number
    >()

  const personalBalances =
    new Map<
      string,
      number
    >()

  for (
    const bill
    of bills
  ) {
    const balance =
      Math.max(
        0,
        Number(
          bill.amount
        ) -
          Number(
            bill.amount_paid ??
              0
          )
      )

    if (
      bill.house_id
    ) {
      houseBalances.set(
        bill.house_id,

        (
          houseBalances.get(
            bill.house_id
          ) ?? 0
        ) +
          balance
      )
    }

    if (
      bill.resident_id
    ) {
      personalBalances.set(
        bill.resident_id,

        (
          personalBalances.get(
            bill.resident_id
          ) ?? 0
        ) +
          balance
      )
    }
  }

  const nameById =
    new Map(
      residents.map(
        (resident) => [
          resident.id,
          resident.full_name,
        ]
      )
    )

  const defaultOwnerByHouse =
    new Map<
      string,
      string
    >()

  for (
    const resident
    of residents
  ) {
    if (
      resident.house_id &&
      resident.is_active &&
      resident.relationship ===
        'owner' &&
      !defaultOwnerByHouse.has(
        resident.house_id
      )
    ) {
      defaultOwnerByHouse.set(
        resident.house_id,
        resident.id
      )
    }
  }

  const tableResidents =
    residents.map(
      (resident) => {
        const houseId =
          resident.house_id

        const explicitBillingId =
          resident.houses
            ?.billing_responsible_resident_id ??
          null

        const billingContactId =
          explicitBillingId ??
          (
            houseId
              ? defaultOwnerByHouse.get(
                  houseId
                ) ??
                null
              : null
          )

        const managesHouseholdBilling =
          Boolean(
            billingContactId
          ) &&
          billingContactId ===
            resident.id

        return {
          ...resident,

          personalOutstanding:
            personalBalances.get(
              resident.id
            ) ?? 0,

          householdOutstanding:
            managesHouseholdBilling &&
            houseId
              ? houseBalances.get(
                  houseId
                ) ?? 0
              : 0,

          managesHouseholdBilling,

          billingContactName:
            billingContactId
              ? nameById.get(
                  billingContactId
                ) ??
                null
              : null,
        }
      }
    )

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
        key={String(
          initialHasDues
        )}
        residents={
          tableResidents
        }
        streets={
          streets ?? []
        }
        initialHasDues={
          initialHasDues
        }
      />
    </div>
  )
}

export const metadata = {
  title:
    'Admin Residents',

  description:
    'Manage estate residents and billing with Verdant.',

  robots: {
    index: false,
    follow: false,
  },
}