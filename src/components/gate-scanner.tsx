'use client'

import { useEffect, useRef, useState } from 'react'

type ResultState = {
  type: 'success' | 'error' | 'inactive'
  message: string
} | null

export function GateScanner({ scannedByLabel }: { scannedByLabel: string }) {
  const [direction, setDirection] = useState<'entry' | 'exit'>('entry')
  const [result, setResult] = useState<ResultState>(null)
  const [processing, setProcessing] = useState(false)
  const scannerRef = useRef<{ clear: () => Promise<void> } | null>(null)
  const busyRef = useRef(false) // prevents overlapping processing of a scan
  const lastScanRef = useRef<{ value: string; at: number } | null>(null) // prevents re-logging the same held-up QR code repeatedly
  const SCAN_COOLDOWN_MS = 8000
  const directionRef = useRef(direction) // scanner callback is registered once on mount, so it must read fresh direction via ref, not closed-over state

  useEffect(() => {
    directionRef.current = direction
  }, [direction])

  useEffect(() => {
    let mounted = true
  async function handleScan(value: string) {
    if (busyRef.current) return

    const last = lastScanRef.current
    if (last && last.value === value && Date.now() - last.at < SCAN_COOLDOWN_MS) {
      return // same code still in frame — don't log it again
    }

    busyRef.current = true
    setProcessing(true)
    setResult(null)

    try {
      const response = await fetch('/api/gate/resident', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:value,direction:directionRef.current})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||'Unable to record scan')
      setResult({type:'success',message:`${data.name} — ${data.direction} logged.`})
      lastScanRef.current = { value, at: Date.now() }
    } catch(error) {
      setResult({type:'error',message:error instanceof Error?error.message:'Unable to connect. Please try again.'})
    } finally {
      setProcessing(false)
      // small cooldown so the same badge isn't logged twice in one breath
      setTimeout(() => {
        busyRef.current = false
      }, 2000)
    }
  }


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
  }, [])


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

      <p className="text-sm text-gray-500 mb-3">Scanning as {scannedByLabel}</p><div id="qr-reader" />

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
