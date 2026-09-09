import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { SignOutButton } from '@/components/sign-out-button'
export default async function GateLayout({children}:{children:React.ReactNode}) {const user=await requireRole(['gate_staff','admin','super_admin']);return <div className="gate-shell"><header className="gate-header"><Link href="/gate" className="brand"><span className="brand-mark">V</span><span>Verdant<small>Gate operations</small></span></Link><div className="user-menu"><div><strong>{user.name}</strong><span>{user.role.replace('_',' ')}</span></div><SignOutButton /></div></header><main id="main-content">{children}</main></div>}
