-- ============================================================
-- TAKIM ATAMASI — ADMIN'IN ELLE KURDUĞU, KALICI EŞLEŞTİRME
-- Supabase SQL Editor'e yapıştır ve BİR KEZ çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================
--
-- NEDEN GEREKLİ
-- -------------
-- Bir kişinin takımı şimdiye kadar TAHMİN ediliyordu: zoho_users.role →
-- Users."Takim Adi" → en son deal'in takımı. Bu zincirin her halkası
-- bayatlayabiliyor ve tahmin yanlış çıkabiliyordu (somut vaka: danışman
-- Zoho'da/Supabase'de doğru takımdayken panelde başka bir takım liderinin
-- ekranında görünüyordu). Tahminin yanlış olduğu yerde yöneticinin son sözü
-- söyleyebileceği, KALICI ve tahminle EZİLMEYEN bir yer gerekiyordu.
--
-- Bu tablo o yer. api/team-members.js çözümleme sırasının EN BAŞINA konuyor:
-- burada bir kayıt varsa Zoho/Users/deals sinyallerinin hiçbiri onu geçemez.
-- api/sync-user-teams.js de ("Zoho'ya göre eşleştir") bu kişileri öneri
-- listesinden çıkarır — yönetici kararı bir sonraki senkronda geri alınmaz.
--
-- KİMLİK NEDEN `person_key`
-- -------------------------
-- Users.id bigint ve JS'in güvenli tamsayı sınırını aşıyor (bkz. diğer
-- uçlardaki aynı not), zoho_users.id ise Zoho'dan gelip değişebiliyor; ayrıca
-- atanmak istenen kişinin Users tablosunda satırı hiç olmayabilir (yalnızca
-- Zoho'da var). Bu yüzden kimlik, adın normalize edilmiş hâli:
--   person_key = lower(full_name), ardışık boşluklar tek boşluğa, baş/son trim
-- Bu, kodun her yerindeki nameKey() ile BİREBİR aynı kural (api/team-members.js,
-- api/sync-user-teams.js, team-map.js). Kuralı değiştirirsen dördünü birlikte
-- güncelle, yoksa atamalar sessizce eşleşmez hâle gelir.
--
-- `team` NULL NE DEMEK
-- --------------------
-- NULL = "bu kişi bir satış takımına ait DEĞİL" (Finance, Muhasebe, IT gibi).
-- Kişi kadro listesinde görünmez ve "hiçbir takıma bağlanamadı" uyarısına
-- girmez. Yani uyarı yalnızca GERÇEK sorunları gösterir.
--
-- `is_leader` NE İŞE YARAR
-- ------------------------
-- Bir takımın Zoho'daki lideri pasifleştiğinde (somut vaka: Touma Team'de 12
-- aktif danışman var, lideri Abdulkader Touma Zoho'da inactive) o takımı kimse
-- kendi ekranında göremiyordu. is_leader=true olan kişi, o takımın kadrosunu
-- takım lideri yetkisiyle görür — kendi Zoho rolü ne olursa olsun.
-- ============================================================

create table if not exists public.team_assignments (
  person_key   text primary key,          -- nameKey(full_name) — yukarıdaki nota bakınız
  full_name    text not null,             -- okunabilirlik (panelde gösterilen ad)
  zoho_user_id text,                      -- izlenebilirlik; kimlik DEĞİL
  team         text,                       -- kanonik takım adı; NULL = satış dışı
  is_leader    boolean not null default false,
  assigned_by  text,                       -- atamayı yapan admin'in kullanıcı adı
  assigned_at  timestamptz not null default now(),
  note         text
);

-- Bir takımın liderini bulmak sık yapılan sorgu (kadro kapsamı hesaplanırken).
create index if not exists team_assignments_team_idx
  on public.team_assignments (team) where team is not null;

-- ── Güvenlik ────────────────────────────────────────────────────────────
-- Users tablosuyla AYNI model: RLS açık, hiçbir policy YOK. Böylece anon ve
-- authenticated rolleri bu tabloyu ne okuyabilir ne yazabilir; tüm erişim
-- service_role ile api/* uçlarından geçer (service_role RLS'i bypass eder).
-- Bu kasıtlı: kimin hangi takımı gördüğünü belirleyen veri, tarayıcıdaki
-- public key ile DEĞİŞTİRİLEBİLİR olmamalı — aksi halde bir danışman kendini
-- başka bir takıma atayıp o takımın verisini görebilirdi.
alter table public.team_assignments enable row level security;

-- Test:
-- select * from public.team_assignments order by full_name;
--
-- Elle örnek (normalde admin panelinden yapılır):
--   insert into public.team_assignments (person_key, full_name, team, assigned_by)
--   values ('walid albarazi', 'Walid Albarazi', 'Touma Team', 'manuel')
--   on conflict (person_key) do update
--     set team = excluded.team, assigned_at = now(), assigned_by = excluded.assigned_by;
