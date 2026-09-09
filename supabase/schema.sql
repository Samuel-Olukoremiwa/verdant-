-- ESTATE MANAGEMENT APP — DATABASE SCHEMA
-- Run this in Supabase SQL editor (Project > SQL Editor > New query)

-- 1. HOUSES / UNITS
create table houses (
  id uuid primary key default gen_random_uuid(),
  address text not null,           -- e.g. "Block 4, House 12"
  house_type text,                 -- e.g. "3-bedroom duplex"
  created_at timestamptz default now()
);

-- 2. RESIDENTS
create table residents (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id), -- links to Supabase auth login
  house_id uuid references houses(id),
  full_name text not null,
  phone text,
  email text,
  relationship text default 'owner',  -- owner, tenant, family member
  photo_url text,
  vehicle_plate_numbers text[],       -- e.g. {"ABC-123-XY", "LND-456-KJ"}
  emergency_contact_name text,
  emergency_contact_phone text,
  move_in_date date,
  qr_code_value text unique,          -- unique code embedded in resident's QR
  is_active boolean default true,     -- false = moved out / disabled access
  created_at timestamptz default now()
);

-- 3. DUES / BILL TYPES (e.g. "Monthly Service Charge", "Security Levy")
create table due_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12,2) not null,
  frequency text default 'monthly', -- monthly, quarterly, yearly, one-time
  created_at timestamptz default now()
);

-- 4. INVOICES/CHARGES (a due assigned to a house for a period)
create table invoices (
  id uuid primary key default gen_random_uuid(),
  house_id uuid references houses(id),
  due_type_id uuid references due_types(id),
  period_label text,             -- e.g. "March 2026"
  amount numeric(12,2) not null,
  amount_paid numeric(12,2) default 0,
  status text default 'unpaid',  -- unpaid, partial, paid, overdue
  due_date date,
  created_at timestamptz default now()
);

-- 5. PAYMENTS (actual transactions, linked to Paystack)
create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id),
  resident_id uuid references residents(id),
  amount numeric(12,2) not null,
  paystack_reference text unique,
  status text default 'pending', -- pending, success, failed
  receipt_url text,
  paid_at timestamptz,
  created_at timestamptz default now()
);

-- 6. ENTRY / EXIT LOGS (QR scans at gate)
create table access_logs (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid references residents(id),
  direction text not null,   -- 'entry' or 'exit'
  scanned_by text,           -- gate staff name/id
  scanned_at timestamptz default now(),
  notes text
);

-- 7. ADMIN USERS (staff who manage the system)
create table admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id),
  full_name text,
  role text default 'admin', -- admin, super_admin, gate_staff
  created_at timestamptz default now()
);

-- Helpful indexes
create index idx_residents_house on residents(house_id);
create index idx_invoices_house on invoices(house_id);
create index idx_payments_resident on payments(resident_id);
create index idx_access_logs_resident on access_logs(resident_id);
