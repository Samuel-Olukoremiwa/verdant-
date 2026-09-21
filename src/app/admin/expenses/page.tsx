import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ExpensesTable } from '@/components/expenses-table'

export default async function ExpensesPage() {
  const supabase = await createClient()

  const { data: rawExpenses, error } = await supabase
    .from('expenses')
    .select('id, category, description, amount, expense_date')
    .order('expense_date', { ascending: false })

  const expenses = (rawExpenses ?? []) as {
    id: string
    category: string
    description: string
    amount: number
    expense_date: string
  }[]

  return (
    <div className="page-wrap">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Estate operations</span>
          <h1 className="page-title">Expenses</h1>
          <p className="page-lead">Money spent running the estate — maintenance, salaries, utilities, and more.</p>
        </div>
        <Link href="/admin/expenses/new" className="action">
          + Log Expense
        </Link>
      </div>

      {error && <p className="text-red-600 mb-4">Error loading expenses: {error.message}</p>}

      <ExpensesTable expenses={expenses} />
    </div>
  )
}

export const metadata = {title: 'Admin Expenses', description: 'Manage your estate account and workspace with Verdant.', robots: {index: false, follow: false}}
