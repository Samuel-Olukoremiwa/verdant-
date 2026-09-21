'use client'

import { useMemo, useState } from 'react'

const naira = (n: number) => `₦${n.toLocaleString()}`

type Expense = {
  id: string
  category: string
  description: string
  amount: number
  expense_date: string
}

export function ExpensesTable({ expenses }: { expenses: Expense[] }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')

  const categories = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.category))).sort(),
    [expenses]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return expenses.filter((e) => {
      if (category !== 'all' && e.category !== category) return false
      if (!q) return true
      return (
        e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
      )
    })
  }, [expenses, query, category])

  const total = filtered.reduce((sum, e) => sum + Number(e.amount), 0)

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by description or category..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        Showing {filtered.length} of {expenses.length} expense{expenses.length === 1 ? '' : 's'} —{' '}
        {naira(total)} total
      </p>

      <div className="bg-white rounded-xl shadow border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Category</th>
              <th className="p-3">Description</th>
              <th className="p-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-3">{new Date(e.expense_date).toLocaleDateString()}</td>
                  <td className="p-3">{e.category}</td>
                  <td className="p-3">{e.description}</td>
                  <td className="p-3 text-right font-medium">{naira(Number(e.amount))}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="p-6 text-center text-gray-500">
                  {expenses.length === 0
                    ? 'No expenses logged yet.'
                    : 'No expenses match your search.'}
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-gray-50 text-sm font-semibold">
                <td className="p-3" colSpan={3}>
                  Total ({filtered.length} expense{filtered.length === 1 ? '' : 's'})
                </td>
                <td className="p-3 text-right">{naira(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
