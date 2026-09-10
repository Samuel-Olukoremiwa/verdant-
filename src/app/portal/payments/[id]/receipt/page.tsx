import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { PrintButton } from '@/components/print-button'

const naira = (n: number) => `₦${n.toLocaleString()}`

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireRole(['resident'])
  const supabase = await createClient()

  const { data: resident } = await supabase
    .from('residents')
    .select('id, full_name, houses ( address )')
    .eq('auth_user_id', user.id)
    .single()

  if (!resident) notFound()

  const { data: payment } = await supabase
    .from('payments')
    .select(
      'id, amount, status, paystack_reference, paid_at, resident_id, invoices ( period_label, due_types ( name ) )'
    )
    .eq('id', id)
    .single()

  // RLS already prevents cross-resident access, but double-check explicitly
  // so a stale/shared link never renders someone else's receipt.
  if (!payment || payment.resident_id !== resident.id || payment.status !== 'success') {
    notFound()
  }

  const house = resident.houses as unknown as { address: string } | null
  const invoice = payment.invoices as unknown as {
    period_label: string | null
    due_types: { name: string } | null
  } | null

  return (
    <div className="max-w-xl mx-auto p-6">
      <div className="flex justify-end mb-4 print:hidden">
        <PrintButton />
      </div>

      <div className="bg-white border rounded-xl shadow p-8">
        <div className="flex justify-between items-start mb-8 border-b pb-6">
          <div>
            <h1 className="text-xl font-bold">Verdant Estate</h1>
            <p className="text-sm text-gray-500">Evergreen Estate, Lagos</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Receipt</p>
            <p className="font-mono text-sm">{payment.paystack_reference}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <p className="text-gray-500">Paid by</p>
            <p className="font-medium">{resident.full_name}</p>
          </div>
          <div>
            <p className="text-gray-500">Residence</p>
            <p className="font-medium">{house?.address ?? '—'}</p>
          </div>
          <div>
            <p className="text-gray-500">Date paid</p>
            <p className="font-medium">
              {payment.paid_at
                ? new Date(payment.paid_at).toLocaleString()
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Status</p>
            <p className="font-medium text-green-700">Paid</p>
          </div>
        </div>

        <table className="w-full text-sm mb-8">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="text-left pb-2 font-normal">Description</th>
              <th className="text-right pb-2 font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-3">
                {invoice?.due_types?.name ?? 'Estate charge'}
                {invoice?.period_label ? ` — ${invoice.period_label}` : ''}
              </td>
              <td className="py-3 text-right">{naira(Number(payment.amount))}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 font-semibold">Total Paid</td>
              <td className="pt-3 text-right font-semibold">
                {naira(Number(payment.amount))}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="text-xs text-gray-400 text-center pt-6 border-t">
          This receipt was generated automatically and confirms a successful
          payment via Paystack.
        </p>
      </div>
    </div>
  )
}
