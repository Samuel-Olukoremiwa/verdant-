import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

function filePath(relativePath) {
  return path.join(ROOT, relativePath)
}

function read(relativePath) {
  return fs.readFileSync(
    filePath(relativePath),
    'utf8'
  )
}

function replaceRequired(
  source,
  oldText,
  newText,
  label
) {
  if (source.includes(newText)) {
    return source
  }

  if (!source.includes(oldText)) {
    throw new Error(
      `Could not find the expected code for: ${label}`
    )
  }

  return source.replace(
    oldText,
    newText
  )
}

function updateFile(
  relativePath,
  transform
) {
  const source =
    read(relativePath)

  const next =
    transform(source)

  return {
    relativePath,
    source,
    next,
  }
}

const updates = []

updates.push(
  updateFile(
    'src/app/admin/residents/page.tsx',
    (source) => {
      source =
        replaceRequired(
          source,
          `type ResidentRow = {
  id: string
  house_id:`,
          `type ResidentRow = {
  id: string
  resident_code: string
  house_id:`,
          'admin residents ResidentRow resident_code'
        )

      source =
        replaceRequired(
          source,
          `.select(\`
            id,
            house_id,`,
          `.select(\`
            id,
            resident_code,
            house_id,`,
          'admin residents select resident_code'
        )

      return source
    }
  )
)

updates.push(
  updateFile(
    'src/components/residents-table.tsx',
    (source) => {
      source =
        replaceRequired(
          source,
          `type Resident = {
  id: string
  full_name: string`,
          `type Resident = {
  id: string
  resident_code: string
  full_name: string`,
          'ResidentsTable resident_code type'
        )

      source =
        replaceRequired(
          source,
          `          return (
            resident.full_name
              .toLowerCase()
              .includes(q)`,
          `          return (
            resident.resident_code
              .toLowerCase()
              .includes(q)
            ||
            resident.full_name
              .toLowerCase()
              .includes(q)`,
          'ResidentsTable search by resident ID'
        )

      source =
        replaceRequired(
          source,
          `placeholder="Search by name, house, or phone..."`,
          `placeholder="Search by resident ID, name, house, or phone..."`,
          'ResidentsTable search placeholder'
        )

      source =
        replaceRequired(
          source,
          `            <tr>
              <th className="p-3">
                Name
              </th>`,
          `            <tr>
              <th className="p-3">
                Resident ID
              </th>

              <th className="p-3">
                Name
              </th>`,
          'ResidentsTable Resident ID heading'
        )

      source =
        replaceRequired(
          source,
          `                  >
                    <td className="p-3 font-medium">
                      {
                        resident.full_name
                      }
                    </td>`,
          `                  >
                    <td className="p-3 font-mono text-xs">
                      {
                        resident.resident_code
                      }
                    </td>

                    <td className="p-3 font-medium">
                      {
                        resident.full_name
                      }
                    </td>`,
          'ResidentsTable Resident ID cell'
        )

      source =
        replaceRequired(
          source,
          `                  colSpan={9}`,
          `                  colSpan={10}`,
          'ResidentsTable empty-row colspan'
        )

      return source
    }
  )
)

updates.push(
  updateFile(
    'src/app/admin/residents/[id]/page.tsx',
    (source) => {
      source =
        replaceRequired(
          source,
          `type Resident = {
  id: string
  full_name: string`,
          `type Resident = {
  id: string
  resident_code: string
  full_name: string`,
          'resident detail resident_code type'
        )

      source =
        replaceRequired(
          source,
          `.select(\`
      id,
      full_name,`,
          `.select(\`
      id,
      resident_code,
      full_name,`,
          'resident detail select resident_code'
        )

      source =
        replaceRequired(
          source,
          `          <h1 className="page-title">{resident.full_name}</h1>
          <p className="page-lead">{displayAddress}</p>`,
          `          <h1 className="page-title">{resident.full_name}</h1>
          <p className="page-lead">{displayAddress}</p>
          <p className="text-sm text-gray-500 mt-2">
            Resident ID:{' '}
            <strong className="font-mono">
              {resident.resident_code}
            </strong>
          </p>`,
          'resident detail visible Resident ID'
        )

      return source
    }
  )
)

updates.push(
  updateFile(
    'src/app/portal/page.tsx',
    (source) => {
      source =
        replaceRequired(
          source,
          `type Resident = {
  id: string
  full_name: string`,
          `type Resident = {
  id: string
  resident_code: string
  full_name: string`,
          'portal resident_code type'
        )

      source =
        replaceRequired(
          source,
          `.select(\`
      id,
      full_name,`,
          `.select(\`
      id,
      resident_code,
      full_name,`,
          'portal select resident_code'
        )

      source =
        replaceRequired(
          source,
          `          <dl>
            <div>
              <dt>Email</dt>`,
          `          <dl>
            <div>
              <dt>Resident ID</dt>
              <dd className="font-mono">
                {resident.resident_code}
              </dd>
            </div>
            <div>
              <dt>Email</dt>`,
          'portal visible Resident ID'
        )

      return source
    }
  )
)

updates.push(
  updateFile(
    'src/app/portal/payments/page.tsx',
    (source) => {
      if (
        !source.includes(
          `import { formatDateGb } from '@/lib/date-format'`
        )
      ) {
        source =
          `import { formatDateGb } from '@/lib/date-format'\n` +
          source
      }

      source =
        replaceRequired(
          source,
          `type Payment = {
  id: string
  amount: number`,
          `type Payment = {
  id: string
  payment_code: string
  amount: number`,
          'payment history payment_code type'
        )

      source =
        replaceRequired(
          source,
          `'id, amount, status, paystack_reference, paid_at, created_at, invoices ( period_label, due_types ( name ) )'`,
          `'id, payment_code, amount, status, paystack_reference, paid_at, created_at, invoices ( period_label, due_types ( name ) )'`,
          'payment history select payment_code'
        )

      source =
        replaceRequired(
          source,
          `<th className="p-3">Date</th>
              <th className="p-3">Description</th>`,
          `<th className="p-3">Payment ID</th>
              <th className="p-3">Date</th>
              <th className="p-3">Description</th>`,
          'payment history Payment ID heading'
        )

      source =
        replaceRequired(
          source,
          `<tr key={p.id} className="border-t">
                  <td className="p-3">
                    {new Date(p.paid_at ?? p.created_at).toLocaleDateString()}
                  </td>`,
          `<tr key={p.id} className="border-t">
                  <td className="p-3 font-mono text-xs">
                    {p.payment_code}
                  </td>
                  <td className="p-3">
                    {formatDateGb(p.paid_at ?? p.created_at)}
                  </td>`,
          'payment history Payment ID and DD/MM/YYYY date'
        )

      source =
        replaceRequired(
          source,
          `<td colSpan={5} className="p-6 text-center text-gray-500">`,
          `<td colSpan={6} className="p-6 text-center text-gray-500">`,
          'payment history colspan'
        )

      return source
    }
  )
)

updates.push(
  updateFile(
    'src/app/portal/payments/[id]/receipt/page.tsx',
    (source) => {
      source =
        replaceRequired(
          source,
          `.select('id, full_name, houses:houses!residents_house_id_fkey ( address )')`,
          `.select('id, resident_code, full_name, houses:houses!residents_house_id_fkey ( address )')`,
          'receipt select resident_code'
        )

      source =
        replaceRequired(
          source,
          `'id, amount, status, paystack_reference, paid_at, resident_id, invoices ( period_label, due_types ( name ) )'`,
          `'id, payment_code, amount, status, paystack_reference, paid_at, resident_id, invoices ( period_label, due_types ( name ) )'`,
          'receipt select payment_code'
        )

      source =
        replaceRequired(
          source,
          `<p className="text-sm text-gray-500">Receipt</p>
            <p className="font-mono text-sm">{payment.paystack_reference}</p>`,
          `<p className="text-sm text-gray-500">Receipt</p>
            <p className="font-mono text-sm font-semibold">
              {payment.payment_code}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Gateway ref: {payment.paystack_reference ?? '—'}
            </p>`,
          'receipt header Payment ID'
        )

      source =
        replaceRequired(
          source,
          `<div>
            <p className="text-gray-500">Paid by</p>
            <p className="font-medium">{resident.full_name}</p>
          </div>
          <div>
            <p className="text-gray-500">Residence</p>`,
          `<div>
            <p className="text-gray-500">Paid by</p>
            <p className="font-medium">{resident.full_name}</p>
          </div>
          <div>
            <p className="text-gray-500">Resident ID</p>
            <p className="font-mono font-medium">
              {resident.resident_code}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Residence</p>`,
          'receipt Resident ID'
        )

      return source
    }
  )
)

updates.push(
  updateFile(
    'src/app/api/admin/reports/route.ts',
    (source) => {
      source =
        replaceRequired(
          source,
          `          paid_at,
          paystack_reference,
          status,`,
          `          paid_at,
          payment_code,
          paystack_reference,
          status,`,
          'collected report select payment_code'
        )

      source =
        replaceRequired(
          source,
          `          reference: payment.paystack_reference ?? '—',`,
          `          reference:
            payment.payment_code ??
            payment.paystack_reference ??
            '—',`,
          'collected report use human Payment ID'
        )

      return source
    }
  )
)

updates.push(
  updateFile(
    'src/lib/report-format.ts',
    (source) => {
      source =
        replaceRequired(
          source,
          `          {
            key: 'reference',
            label:
              'Reference',
          },`,
          `          {
            key: 'reference',
            label:
              'Payment ID',
          },`,
          'report column label Payment ID'
        )

      return source
    }
  )
)

const changed =
  updates.filter(
    ({ source, next }) =>
      source !== next
  )

// Nothing is written until every transformation above has succeeded.
for (
  const {
    relativePath,
    next,
  }
  of changed
) {
  fs.writeFileSync(
    filePath(relativePath),
    next
  )
}

console.log('')
console.log(
  'Human-readable ID UI update applied.'
)

console.log('')

if (!changed.length) {
  console.log(
    'No files changed; the update appears to already be applied.'
  )
} else {
  console.log(
    'Updated files:'
  )

  for (
    const { relativePath }
    of changed
  ) {
    console.log(
      `- ${relativePath}`
    )
  }
}

console.log('')
console.log(
  'Next: npm run lint && npm run build'
)
