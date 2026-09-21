'use client'
export default function AdminError({ reset }: { reset: () => void }) {
  return <div className="page-wrap"><h1 className="page-title">This page could not be loaded</h1><p className="page-lead">Please check your connection and try again.</p><button className="action" onClick={reset}>Try again</button></div>
}
