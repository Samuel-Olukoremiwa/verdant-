import fs from 'node:fs'
import path from 'node:path'

import {
  fileURLToPath,
} from 'node:url'

import assert from 'node:assert/strict'

import {
  test,
} from 'node:test'

const root =
  path.resolve(
    path.dirname(
      fileURLToPath(
        import.meta.url
      )
    ),
    '..'
  )

test(
  'estate operations migration contains the emergency incident model and RPCs',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'supabase',
          'migrations',
          '20261004182634_estate_operations_pack.sql'
        ),
        'utf8'
      )

    assert.match(
      source,
      /emergency_incidents/i
    )

    assert.match(
      source,
      /raise_emergency_incident/i
    )

    assert.match(
      source,
      /update_emergency_incident/i
    )

    assert.match(
      source,
      /acknowledged_at/i
    )

    assert.match(
      source,
      /responding_at/i
    )

    assert.match(
      source,
      /resolved_at/i
    )

    assert.match(
      source,
      /resolution_note/i
    )
  }
)

test(
  'emergency API authenticates callers and uses the database emergency RPCs',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src',
          'app',
          'api',
          'emergencies',
          'route.ts'
        ),
        'utf8'
      )

    assert.match(
      source,
      /\.auth\.getUser\(\)/
    )

    assert.match(
      source,
      /raise_emergency_incident/
    )

    assert.match(
      source,
      /update_emergency_incident/
    )

    assert.match(
      source,
      /gate_staff/
    )

    assert.match(
      source,
      /super_admin/
    )

    assert.match(
      source,
      /resolved/
    )

    assert.match(
      source,
      /resolution note/i
    )
  }
)

test(
  'resident emergency UI raises incidents through the protected API',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src',
          'components',
          'resident-emergency-panel.tsx'
        ),
        'utf8'
      )

    assert.match(
      source,
      /\/api\/emergencies/
    )

    assert.match(
      source,
      /method:\s*['"]POST['"]/s
    )

    assert.match(
      source,
      /security/
    )

    assert.match(
      source,
      /medical/
    )

    assert.match(
      source,
      /fire/
    )

    assert.match(
      source,
      /Raise emergency alert/
    )
  }
)

test(
  'staff emergency UI supports acknowledgement response and resolution',
  () => {
    const source =
      fs.readFileSync(
        path.join(
          root,
          'src',
          'components',
          'emergency-operations-panel.tsx'
        ),
        'utf8'
      )

    assert.match(
      source,
      /scope=staff/
    )

    assert.match(
      source,
      /method:\s*['"]PATCH['"]/s
    )

    assert.match(
      source,
      /acknowledged/
    )

    assert.match(
      source,
      /responding/
    )

    assert.match(
      source,
      /resolved/
    )

    assert.match(
      source,
      /emergency_contact_phone/
    )
  }
)

test(
  'resident admin and gate workspaces expose emergency operations',
  () => {
    const portal =
      fs.readFileSync(
        path.join(
          root,
          'src',
          'app',
          'portal',
          'layout.tsx'
        ),
        'utf8'
      )

    const gate =
      fs.readFileSync(
        path.join(
          root,
          'src',
          'app',
          'gate',
          'layout.tsx'
        ),
        'utf8'
      )

    const admin =
      fs.readFileSync(
        path.join(
          root,
          'src',
          'components',
          'admin-nav.tsx'
        ),
        'utf8'
      )

    assert.match(
      portal,
      /\/portal\/emergency/
    )

    assert.match(
      gate,
      /\/gate\/emergencies/
    )

    assert.match(
      admin,
      /\/admin\/emergencies/
    )
  }
)