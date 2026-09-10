'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

type Resident = {
  id: string
  full_name: string
  phone: string | null
  relationship: string
  is_active: boolean
  houses: { address: string; house_type: string | null } | null
}

export function ResidentsTable({ residents }: { residents: Resident[] }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return residents.filter((r) => {
      if (status === 'active' && !r.is_active) return false
      if (status === 'inactive' && r.is_active) return false
      if (!q) return true
      return (
        r.full_name.toLowerCase().includes(q) ||
        (r.houses?.address ?? '').toLowerCase().includes(q) ||
        (r.phone ?? '').toLowerCase().includes(q)
      )
    })
  }, [residents, query, status])

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, house, or phone..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'all' | 'active' | 'inactive')}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        Showing {filtered.length} of {residents.length} resident
        {residents.length === 1 ? '' : 's'}
      </p>

      <div className="bg-white rounded-xl shadow overflow-hidden border">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-sm text-gray-600">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">House</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Relationship</th>
              <th className="p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((r) => (
                <tr key={r.id} className="border-t text-sm">
                  <td className="p-3 font-medium">{r.full_name}</td>
                  <td className="p-3">{r.houses?.address ?? '—'}</td>
                  <td className="p-3">{r.phone ?? '—'}</td>
                  <td className="p-3 capitalize">{r.relationship}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        r.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/admin/residents/${r.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  {residents.length === 0
                    ? 'No residents yet. Click "Add Resident" to get started.'
                    : 'No residents match your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
