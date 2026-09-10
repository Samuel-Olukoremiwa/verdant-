'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700"
    >
      Print / Save as PDF
    </button>
  )
}
