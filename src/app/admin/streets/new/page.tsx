'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NewStreetPage() {
  const router = useRouter()
  const supabase = createClient()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.from('streets').insert({ name: name.trim() })
    setLoading(false)
    if (error) {
      setError(error.code === '23505' ? 'That street already exists.' : error.message)
      return
    }
    router.push('/admin/streets')
    router.refresh()
  }

  return (
    <div className="page-wrap max-w-2xl">
      <span className="eyebrow">Dues &amp; billing</span>
      <h1 className="page-title">Add a street</h1>
      <p className="page-lead mb-8">
        Once added, this street becomes selectable whenever a house is created or edited.
      </p>
      <form onSubmit={handleSubmit} className="form-card space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Street Name *</label>
          <input
            required
            className="w-full border rounded-lg px-3 py-2"
            placeholder="e.g. Wisper Avenue"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" disabled={loading} className="action disabled:opacity-50">
          {loading ? 'Saving...' : 'Save Street'}
        </button>
      </form>
    </div>
  )
}
