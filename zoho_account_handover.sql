-- ============================================================
-- ZOHO HESAP DEVRİ + AYRILAN KİŞİLER ARŞİVİ
-- Supabase SQL Editor'e yapıştır ve BİR KEZ çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- Betik tekrar çalıştırılabilir (idempotent): her şey "if not exists" ile.
-- ============================================================
--
-- NEDEN GEREKLİ
-- -------------
-- Ajanslar Zoho'da takma isimle (persona hesabıyla) çalışıyor: "Nicholas
-- Parker" gerçek bir kişi değil, o hesabı kullanan kişi. Biri işten
-- ayrılınca (zoho_users.exit_date geçmişe düşer) aynı hesabı bir süre sonra
-- yeni işe giren biri devralabiliyor (zoho_users.start_date, exit_date'ten
-- SONRA). api/team-members.js şimdiye kadar exit_date geçmişse kişiyi
-- doğrudan "ayrılmış" sayıp kadrodan düşürüyordu (bkz. isLeaver()) — hesap
-- devredildiğinde bu, HÂLÂ ÇALIŞAN yeni kişiyi de kadrodan düşürüyordu
-- (somut vaka: Nicholas Parker hesabı, exit_date 06.05, start_date 15.06 —
-- yani 15 Haziran'dan beri hesabı kullanan kişi hâlâ aktif).
--
-- Otomatik "start_date > exit_date ise aktif say" YAPILMADI — Zoho verisi
-- hatalı/eksik olabilir, bu yüzden admin onayı şart. Onaylanana kadar kişi
-- "Hesap Devri Onayı Bekliyor" uyarısında bekler; team-leader panelinde
-- görünmez.
--
-- Ayrıca gerçekten ayrılan (devir şüphesi OLMAYAN) herkesin gerçek adı,
-- telefonu, e-postası ayrıca departed_employees'e anlık görüntü olarak
-- yazılıyor — çünkü zoho_users satırı hesap yeniden kullanıldığında yeni
-- kişinin bilgileriyle EZİLİYOR, eski kişinin verisi kalıcı olarak kaybolur.
-- ============================================================

create table if not exists public.departed_employees (
  id           bigint generated always as identity primary key,
  zoho_user_id text not null,
  full_name    text,
  email        text,
  phone        text,
  team         text,
  region       text,
  exit_date    date,
  captured_at  timestamptz not null default now(),
  unique (zoho_user_id, exit_date)
);

alter table public.departed_employees enable row level security;

create table if not exists public.account_handover_approvals (
  zoho_user_id text not null,
  exit_date    date not null,
  start_date   date not null,
  approved_by  text,
  approved_at  timestamptz not null default now(),
  primary key (zoho_user_id, exit_date, start_date)
);

alter table public.account_handover_approvals enable row level security;

-- ── Güvenlik ────────────────────────────────────────────────────────────
-- team_assignments/Users ile AYNI model: RLS açık, hiçbir policy YOK.
-- Tüm erişim service_role ile api/* uçlarından geçer.

-- Test:
-- select * from public.departed_employees order by exit_date desc;
-- select * from public.account_handover_approvals order by approved_at desc;
