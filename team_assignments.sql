-- ============================================================
-- TAKIM YÖNETİMİ KURULUMU
--   1) team_assignments tablosu — admin'in elle kurduğu kalıcı eşleştirme
--   2) Users tablosundaki eksik yaşam döngüsü kolonları
-- Supabase SQL Editor'e yapıştır ve BİR KEZ çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- Betik tekrar çalıştırılabilir (idempotent): her şey "if not exists" ile.
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

-- ============================================================
-- 2) Users TABLOSUNDAKİ EKSİK YAŞAM DÖNGÜSÜ KOLONLARI
-- ============================================================
-- Canlı şemada bu kolonların HİÇBİRİ yok; onları ekleyen zoho_users_sync.sql
-- hiç çalıştırılmamış. Ölçüldü (PostgREST'e olmayan kolon sorulduğunda
-- 42703 döner, RLS satırları gizlese bile bu ayrım güvenilir):
--   VAR : id, "Deal Owner Name", "Username", "Password", "Role",
--         "Takim Adi", "Phone", "Email"
--   YOK : created_at, updated_at, is_active, deactivated_at,
--         deactivation_reason, zoho_user_id
--
-- SONUÇLARI:
--  * "Zoho'ya göre eşitle" PATCH gövdesine updated_at koyuyordu; olmayan bir
--    kolon PostgREST'te TÜM isteği 400'e düşürüyor → panelde "0 takım atandı,
--    1 başarısız". Takım aslında yazılabilecek durumdaydı.
--    (Bu artık kodda da tolere ediliyor: api/sync-user-teams.js reddedilen
--    kolonu düşürüp yeniden deniyor. Yani takım ataması bu SQL olmadan da
--    çalışır — aşağıdaki kolonlar yalnızca izlenebilirlik ve "girişi kapat"
--    için gerekli.)
--  * "Girişi kapat" is_active'e yazıyor; o kolon olmadan bu özellik hiç
--    çalışamaz (kodda artık sessizce başarılı demiyor, açık hata veriyor).
--
-- Kolonlar TEK TEK ve "if not exists" ile ekleniyor: bir kısmı sonradan elle
-- eklenmiş olabilir, betiğin yeniden çalıştırılması zarar vermemeli.
alter table public."Users" add column if not exists created_at          timestamptz default now();
alter table public."Users" add column if not exists updated_at          timestamptz;
alter table public."Users" add column if not exists is_active           boolean not null default true;
alter table public."Users" add column if not exists deactivated_at      timestamptz;
alter table public."Users" add column if not exists deactivation_reason text;
alter table public."Users" add column if not exists zoho_user_id        text;

-- is_active üzerinden sık filtreleniyor (kadro listeleri aktif olanları alır).
create index if not exists users_is_active_idx on public."Users" (is_active);

-- Test:
-- select * from public.team_assignments order by full_name;
-- select "Username", "Takim Adi", is_active, updated_at from public."Users" limit 5;
--
-- Elle örnek (normalde admin panelinden yapılır):
--   insert into public.team_assignments (person_key, full_name, team, assigned_by)
--   values ('walid albarazi', 'Walid Albarazi', 'Touma Team', 'manuel')
--   on conflict (person_key) do update
--     set team = excluded.team, assigned_at = now(), assigned_by = excluded.assigned_by;
