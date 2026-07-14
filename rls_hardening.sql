-- ============================================================
-- RLS SERTLEŞTİRME — deals / alarms / Logs / alarm_logs / app_settings
-- Supabase SQL Editor'de çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
--
-- AMAÇ: Şu an bu tabloların hepsinde "Public Access Policy" var:
--   FOR ALL USING (true) WITH CHECK (true)
-- Bu, herkese açık anon key ile bu tablolarda HER ŞEYİN (SELECT/INSERT/
-- UPDATE/DELETE) yapılabilmesi demek. Yani anon key'i bilen biri (network
-- sekmesinden herkes görebilir) deals tablosunu KOMPLE SİLEBİLİR, sahte
-- kayıt enjekte edebilir veya denetim loglarını (Logs) silip izini
-- temizleyebilir.
--
-- Bu script, uygulamanın GERÇEKTEN kullandığı işlemleri koruyup gerisini
-- kapatır. Uygulamanın tarayıcıdan yaptığı işlemler (kod taramasıyla
-- doğrulandı):
--   deals         : SELECT + UPDATE            (INSERT/DELETE YOK)
--   alarms        : SELECT + INSERT + UPDATE   (DELETE YOK)
--   Logs          : SELECT + INSERT            (UPDATE/DELETE YOK → tamper-proof)
--   alarm_logs    : SELECT + INSERT            (UPDATE/DELETE YOK)
--   app_settings  : SELECT + INSERT + UPDATE   (DELETE YOK)
-- Bu yüzden aşağıdaki policy'ler sadece bu işlemlere izin verir; kalanlar
-- (özellikle DELETE) anon/authenticated için TAMAMEN reddedilir.
--
-- NOT: service_role (api/login.js, api/admin-users.js) RLS'i zaten by-pass
-- eder — bu değişiklikler onları etkilemez.
--
-- NOT 2: Bu, tam bir çözüm DEĞİL — anon key hâlâ tüm veriyi OKUYABİLİR ve
-- mevcut kayıtları GÜNCELLEYEBİLİR (uygulama bunlara ihtiyaç duyuyor).
-- Gerçek satır-bazlı izolasyon (herkes sadece kendi takımını görsün) ancak
-- Supabase Auth geçişiyle mümkün. Bu script "felaket" senaryolarını (toplu
-- silme, log silme, sahte kayıt enjeksiyonu) kapatan en yüksek değerli,
-- sistemi bozmayan adımdır.
-- ============================================================

-- ---------- deals: SELECT + UPDATE ----------
drop policy if exists "Public Access Policy" on public.deals;
drop policy if exists deals_select on public.deals;
drop policy if exists deals_update on public.deals;
create policy deals_select on public.deals for select using (true);
create policy deals_update on public.deals for update using (true) with check (true);
-- INSERT ve DELETE policy YOK → anon/authenticated bunları yapamaz.
-- (Deal verisi Zoho'dan senkronize ediliyor, tarayıcı hiç insert/delete etmiyor.)

-- ---------- alarms: SELECT + INSERT + UPDATE ----------
drop policy if exists "Public Access Policy" on public.alarms;
drop policy if exists alarms_select on public.alarms;
drop policy if exists alarms_insert on public.alarms;
drop policy if exists alarms_update on public.alarms;
create policy alarms_select on public.alarms for select using (true);
create policy alarms_insert on public.alarms for insert with check (true);
create policy alarms_update on public.alarms for update using (true) with check (true);
-- DELETE policy YOK → alarmlar silinemez (kapatma = UPDATE ile status değişimi).

-- ---------- Logs: SELECT + INSERT (denetim kaydı — değiştirilemez/silinemez) ----------
drop policy if exists "Public Access Policy" on public."Logs";
drop policy if exists logs_select on public."Logs";
drop policy if exists logs_insert on public."Logs";
create policy logs_select on public."Logs" for select using (true);
create policy logs_insert on public."Logs" for insert with check (true);
-- UPDATE/DELETE policy YOK → denetim logları tamper-proof olur.

-- ---------- alarm_logs: SELECT + INSERT ----------
drop policy if exists "Public Access Policy" on public.alarm_logs;
drop policy if exists alarm_logs_select on public.alarm_logs;
drop policy if exists alarm_logs_insert on public.alarm_logs;
create policy alarm_logs_select on public.alarm_logs for select using (true);
create policy alarm_logs_insert on public.alarm_logs for insert with check (true);

-- ---------- app_settings: SELECT + INSERT + UPDATE (upsert) ----------
drop policy if exists "Public Access Policy" on public.app_settings;
drop policy if exists app_settings_select on public.app_settings;
drop policy if exists app_settings_insert on public.app_settings;
drop policy if exists app_settings_update on public.app_settings;
create policy app_settings_select on public.app_settings for select using (true);
create policy app_settings_insert on public.app_settings for insert with check (true);
create policy app_settings_update on public.app_settings for update using (true) with check (true);

-- ============================================================
-- DOĞRULAMA (bu script'ten sonra):
--   1) Uygulama normal çalışmaya devam etmeli (deal sonucu girme, alarm
--      kapatma, filtreler — hepsi SELECT/INSERT/UPDATE olduğu için çalışır).
--   2) Anon key ile DELETE artık reddedilmeli. Test (anon key ile):
--        curl -X DELETE "https://aztxfncqanrodbttywrb.supabase.co/rest/v1/deals?id=eq.NONEXISTENT" \
--          -H "apikey: <anon>" -H "Authorization: Bearer <anon>" -w "%{http_code}"
--      Beklenen: RLS reddi (0 satır etkilenir / policy hatası) — silme mümkün değil.
-- ============================================================
