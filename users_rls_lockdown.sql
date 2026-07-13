-- ============================================================
-- USERS TABLOSUNU ANON KEY'E TAMAMEN KAPAT
-- Supabase SQL Editor'e yapıştır ve çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
--
-- ⚠️ ÖNCE ŞUNU DOĞRULA, SONRA BU SQL'İ ÇALIŞTIR:
--   - api/login.js ve api/admin-users.js Vercel'e deploy edilmiş olmalı
--   - Vercel'de SUPABASE_SERVICE_ROLE_KEY environment variable'ı ayarlanmış olmalı
--   - Login ekranından normal giriş test edilmiş olmalı (çalışıyor olmalı)
--   - Admin panelinde Users sayfası (listeleme/ekleme/düzenleme/silme) test
--     edilmiş olmalı (çalışıyor olmalı)
-- Bu adımlar tamamlanmadan bu SQL çalıştırılırsa, kod henüz eskiyi
-- kullanıyorsa (deploy olmamışsa) login ve Users sayfası KIRILIR.
--
-- Ne yapıyor: Users tablosundaki "herkes her şeyi yapabilir" policy'sini
-- kaldırıp hiçbir policy koymuyor. RLS açıkken policy yoksa varsayılan
-- davranış "hiç kimseye izin verme" olur — anon ve authenticated rolleri
-- bu tabloya artık HİÇ erişemez (SELECT/INSERT/UPDATE/DELETE hiçbiri).
-- service_role bu kısıtlamayı zaten by-pass eder (RLS'i hiç görmez), o
-- yüzden api/login.js ve api/admin-users.js (service_role key kullanıyor)
-- çalışmaya devam eder.
-- ============================================================

drop policy if exists "Public Access Policy" on public."Users";

-- Test: anon key ile aşağıdaki sorgu artık BOŞ dönmeli / yetki hatası vermeli
-- (Supabase SQL Editor'de değil, doğrudan REST API'ye anon key ile denenir):
--   curl "https://aztxfncqanrodbttywrb.supabase.co/rest/v1/Users?select=Username&limit=1" \
--     -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"
-- Beklenen sonuç: [] (boş dizi) — artık hiçbir satır dönmüyor.
