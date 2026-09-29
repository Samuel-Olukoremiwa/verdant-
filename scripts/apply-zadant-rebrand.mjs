import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

const TEXT_EXTENSIONS =
  new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.md',
    '.mdx',
    '.json',
  ])

const SKIP_DIRS =
  new Set([
    'node_modules',
    '.next',
    '.git',
  ])

function walk(directory) {
  const files = []

  for (
    const entry of fs.readdirSync(
      directory,
      {
        withFileTypes: true,
      }
    )
  ) {
    if (
      SKIP_DIRS.has(
        entry.name
      )
    ) {
      continue
    }

    const full =
      path.join(
        directory,
        entry.name
      )

    if (
      entry.isDirectory()
    ) {
      files.push(
        ...walk(full)
      )
      continue
    }

    if (
      entry.isFile() &&
      TEXT_EXTENSIONS.has(
        path.extname(
          entry.name
        )
      )
    ) {
      files.push(full)
    }
  }

  return files
}

const roots =
  [
    'src',
    'tests',
  ]
    .map(
      (relative) =>
        path.join(
          ROOT,
          relative
        )
    )
    .filter(
      (full) =>
        fs.existsSync(full)
    )

const changed = []

for (
  const base
  of roots
) {
  for (
    const file
    of walk(base)
  ) {
    const original =
      fs.readFileSync(
        file,
        'utf8'
      )

    let next =
      original
        .replace(
          /VERDANT/g,
          'ZADANT'
        )
        .replace(
          /Verdant/g,
          'Zadant'
        )

    // Compact/text logo marks used in the authenticated workspaces.
    next =
      next.replace(
        /(<span\s+className=["']brand-mark["']\s*>\s*)V(\s*<\/span>)/g,
        '$1Z$2'
      )

    // Lowercase display wordmarks only.
    next =
      next.replace(
        />verdant\.<\/Link>/g,
        '>zadant.</Link>'
      )

    next =
      next.replace(
        />verdant(\s*)<span className=["']brand-period["']>/g,
        '>zadant$1<span className="brand-period">'
      )

    if (
      next !== original
    ) {
      fs.writeFileSync(
        file,
        next
      )

      changed.push(
        path.relative(
          ROOT,
          file
        )
      )
    }
  }
}

console.log('')
console.log(
  'Zadant rebrand applied.'
)

console.log('')
console.log(
  'Updated text/brand files:'
)

for (
  const file
  of changed.sort()
) {
  console.log(
    `- ${file}`
  )
}

console.log('')
console.log(
  'The Sample estate name was intentionally left unchanged.'
)

console.log('')
console.log(
  'KUDISMS_SENDER_ID was intentionally NOT changed. Set it to Zadant only after KudiSMS approves the sender ID.'
)

console.log('')
console.log(
  'Next: npm run lint && npm run build'
)
