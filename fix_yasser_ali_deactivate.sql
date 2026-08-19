-- ============================================================
-- ACİL: Yasser Raji ve Ali Nkairi (Farah Team - Morocco'dan ayrıldılar)
-- artık giriş yapamasın ve "Kullanıcılar" listesinde pasif görünsün.
-- Supabase SQL Editor'de çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================
--
-- KÖK NEDEN (2026-08-19, Farah vakası):
-- Dış Zoho senkronu, işten ayrılan birini status=inactive yaparak
-- BIRAKMIYOR — satırı zoho_users'tan TAMAMEN SİLİYOR. Bu iki kişi için
-- doğrulandı: zoho_users tablosunda "Yasser Raji"/"Ali Nkairi" adına hiçbir
-- satır yok (ne aktif ne pasif). Sistemin ayrılan-kişi uyarısı
-- (api/sync-user-teams.js isLeaver()) yalnızca zoho_users'ta BİR SATIR
-- bulup onun status/exit_date alanına bakabiliyordu; satır hiç yoksa bu
-- kontrol hiç çalışmıyor ve kişi sessizce atlanıyordu (ne uyarı üretiliyor
-- ne de eski "Takim Adi" kaydı temizleniyordu) — bkz. sync-user-teams.js'e
-- eklenen "KAYIP KULLANICILAR" bloğu (bu committen kalıcı çözüm).
--
-- Bu SQL, o kod düzeltmesi devreye girene kadar (ve zaten geçmişte açılmış
-- satırı temizlemek için) İKİ kişiyi doğrudan pasife alır. "Satış Dışı"
-- (team_assignments) mekanizması bu iki kişi için hiçbir işe yaramıyordu
-- çünkü o mekanizma yalnızca zoho_users'ta hâlâ satırı olan kişiler için
-- devreye giriyor (bkz. api/team-members.js resolveZohoTeam) — zoho_users'tan
-- tamamen silinmiş biri için hiç okunmuyor. Bu iki kişinin doğrudan
-- görünmeye devam ettiği yer, team_assignments'tan hiç etkilenmeyen ham
-- "Kullanıcılar" (Users tablosu) admin ekranıydı.

update public."Users"
set is_active           = false,
    deactivated_at      = now(),
    deactivation_reason = 'Zoho''dan tamamen kaldırıldı — işten ayrıldı (2026-08-19, Farah takımı bildirimi)'
where ("Deal Owner Name" in ('Yasser Raji', 'Ali Nkairi')
    or "Username"        in ('Yasser Raji', 'Ali Nkairi'))
  and is_active is distinct from false;

-- ============================================================
-- Doğrulama
-- ============================================================
-- select "Username", "Deal Owner Name", "Takim Adi", is_active, deactivated_at
-- from public."Users"
-- where "Deal Owner Name" in ('Yasser Raji', 'Ali Nkairi')
--    or "Username"        in ('Yasser Raji', 'Ali Nkairi');
