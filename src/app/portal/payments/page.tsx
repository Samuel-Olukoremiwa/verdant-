import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import Link from 'next/link'

const naira = (n: number) => `₦${n.toLocaleString()}`

type Payment = {
  id: string
  amount: number
  status: string
  paystack_reference: string | null
  paid_at: string | null
  created_at: string
  invoices: { period_label: string | null; due_types: { name: string } | null } | null
}

export default async function PaymentHistoryPage() {
  const user = await requireRole(['resident'])
  const supabase = await createClient()

  const { data: resident } = await supabase
    .from('residents')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  const { data: rows } = resident
    ? await supabase
        .from('payments')
        .select(
          'id, amount, status, paystack_reference, paid_at, created_at, invoices ( period_label, due_types ( name ) )'
        )
        .eq('resident_id', resident.id)
        .order('created_at', { ascending: false })
    : { data: [] }

  const payments = (rows ?? []) as unknown as Payment[]

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Payment History</h1>
        <Link href="/portal" className="text-sm text-blue-600 hover:underline">
          ← Back to portal
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow border overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Description</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {payments.length > 0 ? (
              payments.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">
                    {new Date(p.paid_at ?? p.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    {p.invoices?.due_types?.name ?? 'Estate charge'}
                    {p.invoices?.period_label ? ` — ${p.invoices.period_label}` : ''}
                  </td>
                  <td className="p-3">{naira(Number(p.amount))}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        p.status === 'success'
                          ? 'bg-green-100 text-green-700'
                          : p.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {p.status === 'success' && (
                      <Link
                        href={`/portal/payments/${p.id}/receipt`}
                        className="text-blue-600 hover:underline"
                      >
                        View receipt
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-500">
                  No payments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
