import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import Link from 'next/link'

export default async function QrPassPage() {
  const user = await requireRole(['resident'])
  const supabase = await createClient()

  const { data: resident } = await supabase
    .from('residents')
    .select('full_name, qr_code_value, is_active, houses ( address )')
    .eq('auth_user_id', user.id)
    .single()

  if (!resident || !resident.qr_code_value) notFound()

  const house = resident.houses as unknown as { address: string } | null
  const qrDataUrl = await QRCode.toDataURL(resident.qr_code_value, {
    width: 320,
    margin: 2,
  })

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Gate Pass</h1>
        <Link href="/portal" className="text-sm text-blue-600 hover:underline">
          ← Back to portal
        </Link>
      </div>

      <div className="bg-white border rounded-xl shadow p-8 text-center">
        {!resident.is_active && (
          <p className="mb-4 text-sm bg-red-50 text-red-700 px-3 py-2 rounded-lg">
            Your access is currently marked inactive. Contact the estate office.
          </p>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt="Your gate entry QR code"
          className="mx-auto mb-4 rounded-lg border"
        />
        <p className="font-semibold">{resident.full_name}</p>
        <p className="text-sm text-gray-500">{house?.address ?? 'Evergreen Estate'}</p>
        <p className="text-xs text-gray-400 mt-4">
          Show this code to gate staff for entry and exit. You can also print
          or screenshot it.
        </p>
      </div>
    </div>
  )
}
