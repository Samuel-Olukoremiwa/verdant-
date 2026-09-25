import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

const DATE_FIELD_FILE =
  path.normalize(
    path.join(
      ROOT,
      'src/components/date-field.tsx'
    )
  )

function read(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    'utf8'
  )
}

function write(relativePath, value) {
  fs.writeFileSync(
    path.join(ROOT, relativePath),
    value
  )
}

function ensureImport(
  source,
  importLine
) {
  if (
    source.includes(
      importLine.trim()
    )
  ) {
    return source
  }

  const useClient =
    source.startsWith(
      "'use client'"
    ) ||
    source.startsWith(
      '"use client"'
    )

  if (useClient) {
    const lineEnd =
      source.indexOf('\n')

    return (
      source.slice(
        0,
        lineEnd + 1
      ) +
      '\n' +
      importLine +
      source.slice(
        lineEnd + 1
      )
    )
  }

  return (
    importLine +
    source
  )
}

function transformDateInputs(
  source
) {
  let cursor = 0
  let output = ''
  let changed = false

  while (true) {
    const start =
      source.indexOf(
        '<input',
        cursor
      )

    if (start < 0) {
      output +=
        source.slice(
          cursor
        )
      break
    }

    output +=
      source.slice(
        cursor,
        start
      )

    const end =
      source.indexOf(
        '/>',
        start
      )

    if (end < 0) {
      output +=
        source.slice(
          start
        )
      break
    }

    let tag =
      source.slice(
        start,
        end + 2
      )

    if (
      /\btype\s*=\s*["']date["']/.test(
        tag
      )
    ) {
      tag =
        tag.replace(
          /^<input\b/,
          '<DateField'
        )

      tag =
        tag.replace(
          /\s*type\s*=\s*["']date["']\s*/m,
          '\n'
        )

      changed = true
    }

    output += tag
    cursor = end + 2
  }

  return {
    source: output,
    changed,
  }
}

function walk(directory) {
  const results = []

  for (
    const entry
    of fs.readdirSync(
      directory,
      {
        withFileTypes:
          true,
      }
    )
  ) {
    const full =
      path.join(
        directory,
        entry.name
      )

    if (
      entry.isDirectory()
    ) {
      results.push(
        ...walk(full)
      )
      continue
    }

    if (
      entry.isFile() &&
      full.endsWith(
        '.tsx'
      )
    ) {
      results.push(
        full
      )
    }
  }

  return results
}

const changedFiles = []

const srcRoot =
  path.join(
    ROOT,
    'src'
  )

for (
  const absolutePath
  of walk(srcRoot)
) {
  if (
    path.normalize(
      absolutePath
    ) === DATE_FIELD_FILE
  ) {
    continue
  }

  const relativePath =
    path.relative(
      ROOT,
      absolutePath
    )

  const original =
    fs.readFileSync(
      absolutePath,
      'utf8'
    )

  const result =
    transformDateInputs(
      original
    )

  if (
    !result.changed
  ) {
    continue
  }

  const next =
    ensureImport(
      result.source,
      "import { DateField } from '@/components/date-field'\n"
    )

  fs.writeFileSync(
    absolutePath,
    next
  )

  changedFiles.push(
    relativePath
  )
}

{
  const file =
    'src/app/admin/access-logs/page.tsx'

  if (
    fs.existsSync(
      path.join(
        ROOT,
        file
      )
    )
  ) {
    let source =
      read(file)

    source =
      ensureImport(
        source,
        "import { formatDateTimeGb } from '@/lib/date-format'\n"
      )

    source =
      source.replace(
        /new Date\(log\.scanned_at\)\.toLocaleString\(\)/g,
        'formatDateTimeGb(log.scanned_at)'
      )

    write(
      file,
      source
    )

    changedFiles.push(
      file
    )
  }
}

{
  const file =
    'src/components/visitor-entry-log.tsx'

  if (
    fs.existsSync(
      path.join(
        ROOT,
        file
      )
    )
  ) {
    let source =
      read(file)

    source =
      ensureImport(
        source,
        "import { formatDateTimeGb } from '@/lib/date-format'\n"
      )

    source =
      source.replace(
        /new Date\(\s*visitor\.redeemed_at\s*\)\.toLocaleString\(\s*'en-GB',\s*\{\s*timeZone:\s*'Africa\/Lagos',?\s*\}\s*\)/gm,
        'formatDateTimeGb(visitor.redeemed_at)'
      )

    write(
      file,
      source
    )

    changedFiles.push(
      file
    )
  }
}

{
  const file =
    'src/app/portal/payments/[id]/receipt/page.tsx'

  if (
    fs.existsSync(
      path.join(
        ROOT,
        file
      )
    )
  ) {
    let source =
      read(file)

    source =
      ensureImport(
        source,
        "import { formatDateTimeGb } from '@/lib/date-format'\n"
      )

    source =
      source.replace(
        /new Date\(payment\.paid_at\)\.toLocaleString\(\)/g,
        'formatDateTimeGb(payment.paid_at)'
      )

    write(
      file,
      source
    )

    changedFiles.push(
      file
    )
  }
}

{
  const file =
    'src/app/admin/reports/page.tsx'

  if (
    fs.existsSync(
      path.join(
        ROOT,
        file
      )
    )
  ) {
    let source =
      read(file)

    source =
      ensureImport(
        source,
        "import { formatDateGb } from '@/lib/date-format'\n"
      )

    source =
      source.replace(
        /\{from\}\s*\{\s*' to '\s*\}\s*\{to\}/g,
        "{formatDateGb(from)}\n              {' to '}\n              {formatDateGb(to)}"
      )

    source =
      source.replace(
        /\{\s*row\.date\s*\}\s*\{\s*' · '\s*\}/g,
        "{formatDateGb(String(row.date))}\n                                {' · '}"
      )

    write(
      file,
      source
    )

    changedFiles.push(
      file
    )
  }
}

console.log('')
console.log(
  'DD/MM/YYYY update applied.'
)

console.log('')
console.log(
  'Updated files:'
)

for (
  const file
  of Array.from(
    new Set(
      changedFiles
    )
  ).sort()
) {
  console.log(
    `- ${file}`
  )
}

console.log('')
console.log(
  'Next: npm run lint && npm run build'
)
