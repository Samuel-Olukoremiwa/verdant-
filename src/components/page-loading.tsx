export function PageLoading({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="page-loading">
      <div className="spinner" role="status" aria-label={label} />
      <p>{label}</p>
    </div>
  )
}
