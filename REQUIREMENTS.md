# Estate Management Web App — Requirements Document

## 1. Overview
A web application for managing a residential estate: resident records, house/unit
information, estate dues collection with online payment, payment history/receipts,
and gate entry/exit tracking via QR code. Includes a full admin panel for estate
management staff.

## 2. Recommended Tech Stack
- **Frontend/Backend:** Next.js (React) — single codebase for UI + API routes
- **Database & Auth:** Supabase (Postgres + built-in authentication + file storage)
- **Payments:** Paystack (Nigeria-friendly, supports card/bank transfer, has test mode)
- **QR Codes:** `qrcode` (generate) + `html5-qrcode` (scan via phone/tablet camera)
- **Hosting:** Vercel (frontend/backend), Supabase (database) — both have free tiers

An agent/developer is free to substitute equivalents (e.g. Firebase instead of
Supabase, Flutterwave instead of Paystack) as long as the functional requirements
below are met.

## 3. User Roles
| Role | Access |
|---|---|
| **Resident** | View/update own profile, view own house's dues, make payments, view own payment history/receipts, view own QR code |
| **Admin** | Full access: manage residents/houses, create due types, generate invoices, view all payments, view all entry/exit logs, mark manual payments (e.g. cash), manage other admins |
| **Gate Staff** (optional sub-role) | Scan resident QR codes to log entry/exit only — no access to financial or personal data beyond name/house/photo for verification |

## 4. Functional Requirements

### 4.1 Resident & House Management
- Admin can add/edit/deactivate a house (address, house type)
- Admin can add/edit/deactivate a resident and link to a house
- Resident fields: full name, phone, email, relationship to house (owner/tenant/family),
  photo, vehicle plate number(s), emergency contact name & phone, move-in date
- Each resident gets a unique auto-generated QR code value at creation
- Resident can log in (via email/phone) and view/edit their own profile
- Search/filter residents by name, house address, or status (active/inactive)

### 4.2 Estate Dues & Payments
- Admin defines **due types** (e.g. "Monthly Service Charge") with amount and frequency
  (monthly/quarterly/yearly/one-time)
- Admin generates **invoices**: applies a due type to all houses (or selected houses)
  for a given billing period, with a due date
- Resident sees their outstanding invoices and can pay online via Paystack
  (card, bank transfer, or USSD depending on what Paystack test/live mode supports)
- On successful payment:
  - Invoice status updates (unpaid → paid, or partial if underpaid)
  - A payment record is stored (amount, reference, timestamp)
  - A downloadable/printable receipt is generated (PDF or styled HTML)
- Resident can view full payment history with receipts for past payments
- Admin can manually mark an invoice as paid (for cash/offline payments) with a note
- Admin can view, per house: total billed, total paid, outstanding balance
- Failed/pending payments must be handled gracefully (don't mark invoice paid until
  payment gateway confirms success, ideally via webhook, not just client-side redirect)

### 4.3 Gate Entry/Exit (QR)
- Each resident has a unique QR code (can be displayed in-app or printed/laminated)
- Gate staff/admin scans QR via phone/tablet camera at the gate
- Each scan logs: resident, direction (entry/exit), timestamp, who scanned it
- Admin dashboard shows today's activity and can filter access logs by resident,
  house, or date range
- System should flag/handle scanning an inactive resident's QR code (e.g. moved out)

### 4.4 Admin Dashboard
- Summary cards: total billed, total collected, total outstanding (estate-wide)
- List of houses/residents owing vs. paid up, with amounts
- List of all residents with status and quick actions (edit/deactivate)
- Due types management (create/edit)
- Invoice generation tool
- Entry/exit log viewer
- Admin user management (add/remove other admins, assign gate-staff role)

## 5. Non-Functional Requirements
- **Row Level Security (RLS)** must be enabled before going live: a resident should
  only be able to read/write their own data; only admins can read/write everyone's.
  (This was intentionally left disabled during early development for convenience —
  it must be turned on and properly configured before any real resident data or
  payments go live.)
- Payment confirmation should be verified server-side against Paystack's API/webhook,
  not trusted purely from the client redirect
- Sensitive keys (Paystack secret key, Supabase service role key) must only be used
  in server-side code, never exposed to the browser
- Mobile-responsive UI (residents will likely use phones)
- Basic audit trail: who generated invoices, who marked manual payments, who scanned
  gate entries

## 6. Suggested Build Phases
1. Database schema + resident/house management (CRUD)
2. Due types + invoice generation
3. Admin dashboard (billing overview, resident status)
4. Payment integration (Paystack) + receipts + payment history
5. QR code generation + gate scan-in/scan-out flow
6. Authentication + role-based access + Row Level Security policies
7. Polish: search/filters, notifications (optional: SMS/email reminders for dues)

## 7. Open Decisions for Whoever Builds This
- Exact list of due types and their amounts/frequency
- Whether gate staff need their own login, or if admin does all scanning
- Whether residents self-register or are only added by admin
- SMS/email reminders for upcoming/overdue dues — needed or not, and via which provider
- Multi-estate support, or built for a single estate only (this doc assumes single estate)
