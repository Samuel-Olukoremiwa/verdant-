import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(
  path.dirname(
    fileURLToPath(import.meta.url)
  ),
  '..'
)

const baselinePath = path.join(
  root,
  'supabase',
  'migrations',
  '20260930120000_legacy_schema_baseline.sql'
)

const baseline = fs.readFileSync(
  baselinePath,
  'utf8'
)

const separator =
  '-- ============================================================'

const markerPrefix =
  '-- SOURCE: supabase/'

export function legacySql(
  filename
) {
  const marker =
    `${markerPrefix}${filename}`

  const markerIndex =
    baseline.indexOf(
      marker
    )

  if (
    markerIndex ===
    -1
  ) {
    throw new Error(
      `Legacy SQL source not found in baseline: ${filename}`
    )
  }

  const contentSeparator =
    baseline.indexOf(
      separator,
      markerIndex +
        marker.length
    )

  if (
    contentSeparator ===
    -1
  ) {
    throw new Error(
      `Legacy SQL section is malformed in baseline: ${filename}`
    )
  }

  const separatorEnd =
    contentSeparator +
    separator.length

  const contentStartLine =
    baseline.indexOf(
      '\n',
      separatorEnd
    )

  const contentStart =
    contentStartLine ===
    -1
      ? baseline.length
      : contentStartLine +
        1

  const nextMarker =
    `\n\n${separator}\n${markerPrefix}`

  const nextSection =
    baseline.indexOf(
      nextMarker,
      contentStart
    )

  const contentEnd =
    nextSection ===
    -1
      ? baseline.length
      : nextSection

  const sql =
    baseline
      .slice(
        contentStart,
        contentEnd
      )
      .trim()

  if (!sql) {
    throw new Error(
      `Legacy SQL section is empty in baseline: ${filename}`
    )
  }

  return `${sql}\n`
}