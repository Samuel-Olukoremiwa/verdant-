'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ResultState = {
  type: 'success' | 'error' | 'inactive'
  message: string
} | null

export function GateScanner({ scannedByLabel }: { scannedByLabel: string }) {
  const [direction, setDirection] = useState<'entry' | 'exit'>('entry')
  const [result, setResult] = useState<ResultState>(null)
  const [processing, setProcessing] = useState(false)
  const scannerRef = useRef<{ clear: () => Promise<void> } | null>(null)
  const busyRef = useRef(false) // prevents double-processing the same rapid scan
  const directionRef = useRef(direction) // scanner callback is registered once on mount, so it must read fresh direction via ref, not closed-over state
  const supabase = createClient()

  useEffect(() => {
    directionRef.current = direction
  }, [direction])

  useEffect(() => {
    let mounted = true

    import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      if (!mounted) return
      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        { fps: 10, qrbox: 250 },
        false
      )
      scanner.render(
        (decodedText: string) => handleScan(decodedText),
        () => {
          /* called continuously while nothing is in frame — ignore */
        }
      )
      scannerRef.current = scanner
    })

    return () => {
      mounted = false
      scannerRef.current?.clear().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleScan(value: string) {
    if (busyRef.current) return
    busyRef.current = true
    setProcessing(true)
    setResult(null)

    try {
      const { data: resident, error: lookupError } = await supabase
        .from('residents')
        .select('id, full_name, is_active')
        .eq('qr_code_value', value)
        .maybeSingle()

      if (lookupError || !resident) {
        setResult({ type: 'error', message: 'QR code not recognized.' })
        return
      }

      if (!resident.is_active) {
        setResult({
          type: 'inactive',
          message: `${resident.full_name} — access is inactive. Entry denied.`,
        })
        return
      }

      const { error: insertError } = await supabase.from('access_logs').insert({
        resident_id: resident.id,
        direction: directionRef.current,
        scanned_by: scannedByLabel,
      })

      if (insertError) {
        setResult({ type: 'error', message: insertError.message })
        return
      }

      setResult({
        type: 'success',
        message: `${resident.full_name} — ${
          directionRef.current === 'entry' ? 'entry' : 'exit'
        } logged.`,
      })
    } finally {
      setProcessing(false)
      // small cooldown so the same badge isn't logged twice in one breath
      setTimeout(() => {
        busyRef.current = false
      }, 2000)
    }
  }

  return (
    <div className="bg-white border rounded-xl shadow p-5">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setDirection('entry')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
            direction === 'entry'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          Entry
        </button>
        <button
          onClick={() => setDirection('exit')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
            direction === 'exit'
              ? 'bg-orange-600 text-white'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          Exit
        </button>
      </div>

      <div id="qr-reader" />

      {processing && (
        <p className="text-sm text-gray-500 mt-3">Checking QR code...</p>
      )}

      {result && (
        <div
          className={`mt-3 text-sm px-3 py-2 rounded-lg ${
            result.type === 'success'
              ? 'bg-green-100 text-green-700'
              : result.type === 'inactive'
              ? 'bg-orange-100 text-orange-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  )
}
