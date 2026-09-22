import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import QRCode from 'qrcode'
import Link from 'next/link'
import styles from './qr-pass.module.css'

export default async function QrPassPage() {
  const user =
    await requireRole([
      'resident',
    ])

  const supabase =
    await createClient()

  const {
    data: resident,
    error,
  } =
    await supabase
      .from('residents')
      .select(`
        full_name,
        qr_code_value,
        is_active,
        block_number,
        flat_number,
        houses:houses!residents_house_id_fkey (
          address
        )
      `)
      .eq(
        'auth_user_id',
        user.id
      )
      .maybeSingle()

  if (
    error ||
    !resident ||
    !resident.qr_code_value ||
    !resident.is_active
  ) {
    return (
      <div className="max-w-lg mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">
          Gate pass unavailable
        </h1>

        <p>
          {error
            ? 'We could not load your resident details.'
            : !resident
              ? 'Your login is not linked to a resident profile.'
              : !resident.is_active
                ? 'Your access is inactive.'
                : 'Your resident profile does not have a gate pass yet.'}
        </p>

        <Link
          href="/portal"
          className="action secondary"
        >
          Back to portal
        </Link>
      </div>
    )
  }

  const house =
    resident.houses as unknown as
      | {
          address:
            string
        }
      | null

  const location =
    [
      house?.address ??
        'Verdant Estate',

      resident.block_number
        ? `Block ${resident.block_number}`
        : null,

      resident.flat_number
        ? `Flat ${resident.flat_number}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ')

  const qrDataUrl =
    await QRCode.toDataURL(
      resident.qr_code_value,
      {
        width: 640,
        margin: 4,
        errorCorrectionLevel:
          'H',
      }
    )

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <h1 className="text-2xl font-bold">
          My Gate Pass
        </h1>

        <Link
          href="/portal"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to portal
        </Link>
      </div>

      <div className={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt="Your gate entry QR code"
          className={styles.qr}
        />

        <p className={styles.name}>
          {resident.full_name}
        </p>

        <p className={styles.address}>
          {location}
        </p>

        <p className={styles.note}>
          Show this complete QR code to
          gate staff for entry and exit.
          When printing, use 100% scale
          or Actual Size.
        </p>
      </div>
    </div>
  )
}

export const metadata = {
  title:
    'Portal QR Pass',

  description:
    'Resident gate pass for Verdant.',

  robots: {
    index: false,
    follow: false,
  },
}