import { createClient } from '@/lib/supabase/server'
import { RegistrationsTable } from '@/components/registrations-table'

export default async function RegistrationsPage() {
  const supabase = await createClient()

  const { data: rawRequests } = await supabase
    .from('registration_requests')
    .select(
      'id, surname, first_name, other_names, phone, email, house_number, house_type, relationship, status, decline_reason, created_at, streets ( name )'
    )
    .order('created_at', { ascending: false })

  const requests = (rawRequests ?? []) as unknown as {
    id: string
    surname: string
    first_name: string
    other_names: string | null
    phone: string
    email: string
    house_number: string
    house_type: string | null
    relationship: string
    status: string
    decline_reason: string | null
    created_at: string
    streets: { name: string } | null
  }[]

  return (
    <div className="page-wrap">
      <span className="eyebrow">Residents</span>
      <h1 className="page-title">Registration Requests</h1>
      <p className="page-lead mb-8">
        Residents who signed up via the public registration link, awaiting your review.
      </p>

      <RegistrationsTable requests={requests} />
    </div>
  )
}
