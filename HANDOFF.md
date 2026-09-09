# Handoff Notes — Estate Management App

## Where things stand
This is a Next.js + Supabase project. The database is live and working. The
following pages are built and functional:

| Page | Route | What it does |
|---|---|---|
| Residents list | `/admin/residents` | Table of all residents + house + status |
| Add resident | `/admin/residents/new` | Form: creates house + resident together, auto-generates QR value |
| Due types list | `/admin/due-types` | Table of billing categories (e.g. "Monthly Service Charge") |
| Add due type | `/admin/due-types/new` | Form to create a due type (name, amount, frequency) |
| Generate invoices | `/admin/invoices/generate` | Bills every house at once for a chosen due type + period |
| Admin dashboard | `/admin` | Totals billed/collected/outstanding, owing vs. paid-up houses, today's gate activity (empty until QR scanning is built) |

**Not yet built:** Paystack payment flow, receipts, resident-facing login/portal,
QR code generation UI + gate scan-in/scan-out, authentication, and Row Level
Security policies. See `REQUIREMENTS.md` for the full spec of these.

## Project structure
```
estate-app/
├── src/
│   ├── app/
│   │   ├── admin/
│   │   │   ├── page.tsx                    → dashboard
│   │   │   ├── residents/page.tsx          → residents list
│   │   │   ├── residents/new/page.tsx      → add resident form
│   │   │   ├── due-types/page.tsx          → due types list
│   │   │   ├── due-types/new/page.tsx      → add due type form
│   │   │   └── invoices/generate/page.tsx  → generate invoices
│   │   ├── layout.tsx
│   │   └── globals.css
│   └── lib/supabase/
│       ├── client.ts   → Supabase client for browser/Client Components
│       └── server.ts   → Supabase client for Server Components
├── supabase/schema.sql → full database schema (already applied to the live DB)
├── .env.local          → Supabase credentials (already filled in, see below)
├── REQUIREMENTS.md      → full functional spec
└── package.json
```

## Credentials already configured
`.env.local` already contains:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

These are safe to keep as-is — they're meant for client-side use. **Do not** commit
`.env.local` to a public GitHub repo; add it to `.gitignore` if not already there.

**Not yet set up:** Paystack keys. Whoever builds the payment flow will need a
Paystack account (test mode is free, no business verification needed until going
live) and its Test Secret Key + Test Public Key.

## Database
- Live in Supabase, project ref `gpjuimeuaykqgsdxxjoo`
- Schema already applied — see `supabase/schema.sql` for the full structure
- **Row Level Security (RLS) is currently disabled** on all tables — this was
  intentional for early development but is a hard requirement before real
  resident data or live payments are used. See REQUIREMENTS.md section 5.

## How to run locally
```
npm install
npm run dev
```
Then visit `http://localhost:3000/admin` (or whatever port it starts on).

## What I'd like the next agent/developer to prioritize
1. Paystack payment flow on the resident side (pay an invoice → webhook confirms →
   invoice marked paid → receipt generated)
2. Resident authentication (Supabase Auth) + a resident-facing portal (their own
   dues, payment history, QR code)
3. QR code generation (image/display) tied to each resident's existing
   `qr_code_value`, and a scan interface for gate staff using `html5-qrcode`
4. Row Level Security policies once auth is in place

Everything above is scoped in detail in `REQUIREMENTS.md`.
