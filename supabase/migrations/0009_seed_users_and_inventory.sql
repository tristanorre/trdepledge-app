-- Slice 1 seed: 1 admin (Thomas), 4 named workers, assets, materials.
--
-- TEMPORARY PASSWORDS — change these on first login!
--   Thomas (admin):  email t.rdepledge@outlook.com  password 'ChangeMe!2025'
--   Workers (PIN):   PIN '1234' for all four pre-seeded workers
--
-- Both are bcrypt-hashed via pgcrypto's crypt(..., gen_salt('bf', 10)),
-- which produces a $2a$10$... hash compatible with bcryptjs.compare()
-- in the NextAuth credentials provider.
--
-- The 3 empty worker slots from the spec are NOT pre-created — Thomas
-- adds those via the admin panel when he hires.

create extension if not exists pgcrypto;

-- ── USERS ────────────────────────────────────────────────────────────
insert into public.users (name, email, role, password_hash, colour, phone, active)
values (
  'Thomas Depledge',
  't.rdepledge@outlook.com',
  'admin',
  crypt('ChangeMe!2025', gen_salt('bf', 10)),
  '#A8D818',
  '0474 844 204',
  true
)
on conflict (email) do nothing;

insert into public.users (name, role, pin_hash, colour, active) values
  ('Bradley Depledge',     'worker', crypt('1234', gen_salt('bf', 10)), '#1A4FB5', true),
  ('Aleisha Bussenschutt', 'worker', crypt('1234', gen_salt('bf', 10)), '#FFE500', true),
  ('Darrell Woods',        'worker', crypt('1234', gen_salt('bf', 10)), '#7AAB0F', true),
  ('Dave Kay',             'worker', crypt('1234', gen_salt('bf', 10)), '#DC2626', true);

-- Initial leave balances for the four pre-seeded workers, current year.
insert into public.leave_balances (worker_id, year)
select id, extract(year from now())::int
from public.users
where role = 'worker'
on conflict (worker_id, year) do nothing;


-- ── MATERIALS CATALOGUE ──────────────────────────────────────────────
insert into public.materials_catalogue (name, unit, base_price_cents, category) values
  ('Lawn Turf',       'm²',   1200, 'Lawn'),
  ('Lawn Seed',       'kg',    800, 'Lawn'),
  ('Gravel 10mm',     'm²',   2500, 'Hardscape'),
  ('Mulch',           'm²',   1800, 'Garden'),
  ('Garden Soil',     'bag',  1200, 'Garden'),
  ('Herbicide Spray', 'L',    2200, 'Chemical'),
  ('Fertiliser',      'kg',   1500, 'Garden'),
  ('Shrub Small',     'each', 1800, 'Plants'),
  ('Shrub Large',     'each', 4500, 'Plants'),
  ('Native Plant',    'each', 1200, 'Plants'),
  ('Tree Small',      'each', 8500, 'Plants'),
  ('Potting Mix',     'bag',  1400, 'Garden')
on conflict do nothing;


-- ── ASSETS ───────────────────────────────────────────────────────────
-- Vehicles
insert into public.assets (name, identifier, category, icon, condition, notes) values
  ('White Hilux Ute',     'Ute #1 · S123ABC', 'Vehicles', '🚙', 'Good', null),
  ('TR Depledge Trailer', 'Trailer #1',       'Vehicles', '🚛', 'Good', null);

-- Power Equipment
insert into public.assets (name, identifier, category, icon, condition, notes) values
  ('Ride-On Mower',     'Husqvarna Z254 · #001', 'Power Equipment', '🚜', 'Good',         null),
  ('Push Mower',        'Honda HRX · #002',      'Power Equipment', '🌱', 'Good',         null),
  ('Whipper Snipper #1','Husqvarna · #003',      'Power Equipment', '✂️', 'Good',         null),
  ('Whipper Snipper #2','Stihl · #004',          'Power Equipment', '✂️', 'Needs Service','Due for service'),
  ('Hedge Trimmer',     'Stihl HS45 · #005',     'Power Equipment', '🌳', 'Good',         null),
  ('Chainsaw',          'Stihl MS170 · #006',    'Power Equipment', '🪚', 'Good',         'Authorised users only'),
  ('Leaf Blower',       'Stihl BG86 · #007',     'Power Equipment', '🍂', 'Good',         null);

-- Hand Tools
insert into public.assets (name, identifier, category, icon, condition, notes) values
  ('Shovel Set x3',  'Tools #010', 'Hand Tools', '🛠️', 'Good', null),
  ('Rake Set x3',    'Tools #011', 'Hand Tools', '🛠️', 'Good', null),
  ('Wheelbarrow #1', 'WB #001',    'Hand Tools', '🛒', 'Good', null),
  ('Wheelbarrow #2', 'WB #002',    'Hand Tools', '🛒', 'Good', null);

-- Safety & PPE — one kit per worker, assigned by name.
insert into public.assets (name, identifier, category, icon, condition, assigned_to) values
  ('Safety Kit — Bradley Depledge',     null, 'Safety & PPE', '🦺', 'Good',
   (select id from public.users where name = 'Bradley Depledge')),
  ('Safety Kit — Aleisha Bussenschutt', null, 'Safety & PPE', '🦺', 'Good',
   (select id from public.users where name = 'Aleisha Bussenschutt')),
  ('Safety Kit — Darrell Woods',        null, 'Safety & PPE', '🦺', 'Good',
   (select id from public.users where name = 'Darrell Woods')),
  ('Safety Kit — Dave Kay',             null, 'Safety & PPE', '🦺', 'Good',
   (select id from public.users where name = 'Dave Kay'));

insert into public.assets (name, identifier, category, icon, condition, notes) values
  ('First Aid Kit', 'FAK #001', 'Safety & PPE', '⛑️', 'Good', 'Expires June 2026');

-- Materials Stock (current inventory levels, not the catalogue)
insert into public.assets (name, identifier, category, icon, condition, notes) values
  ('Herbicide Spray', null, 'Materials Stock', '🧴', 'In Stock', '12L remaining'),
  ('Fertiliser Bags', null, 'Materials Stock', '🌾', 'In Stock', '8 × 25kg bags'),
  ('Mulch (bulk)',    null, 'Materials Stock', '🪵', 'In Stock', '~3 cubic metres');
