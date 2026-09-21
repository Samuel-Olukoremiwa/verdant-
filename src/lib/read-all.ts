// Fetch every page instead of silently truncating financial totals at the API row limit.
export async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await page(from, from + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 500) return rows
  }
}
