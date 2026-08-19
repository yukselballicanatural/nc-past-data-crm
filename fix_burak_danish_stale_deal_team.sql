-- ============================================================
-- Anthony Cross (Burak Kalkanoğlu) ve Bradley Grant (Danish Munir)'in
-- deals.team alanı hala ESKİ (Sales Master olmadan önceki) takımı taşıyor.
-- Supabase SQL Editor'de çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================
--
-- NEDEN
-- Bir kişi Sales Master/Team Leader olduğunda Zoho'daki Deal.Team alanı
-- (raw.Team) YENİDEN HESAPLANMIYOR — kişinin YENİ role'e geçmeden ÖNCEKİ
-- takımıyla donmuş kalıyor. Canlı ölçüm (2026-08-19):
--   Anthony Cross'un 63 deal'i "Ghazal Team" diyordu (Sales Master olmadan
--   önce Ghazal'ın takımındaydı).
--   Bradley Grant'ın 33 deal'i "Touma Team" diyordu (önce Touma'nın takımı).
-- Bu deal'ler kendi panellerinde HİÇ görünmüyordu, eski liderlerin (Ghazal/
-- Touma) rakamlarını şişiriyordu.
--
-- Bu tek seferlik dosya TÜM geçmiş deal'leri (stage'den bağımsız — Won,
-- Cancelled dahil) düzeltir; alarm-engine.js'e eklenen syncDealTeamFields
-- ise yalnızca AKTİF stage'deki deal'leri her motor çalışmasında (15 dk'da
-- bir) sürekli kendi kendine düzeltir — Zoho bu alanı bir daha eski değerle
-- geri gönderse bile.

update public.deals
set team = 'SM - Burak Team'
where deal_owner = 'Anthony Cross'
  and team is distinct from 'SM - Burak Team';

update public.deals
set team = 'SM- Danish Team'
where deal_owner = 'Bradley Grant'
  and team is distinct from 'SM- Danish Team';

-- Doğrulama:
-- select team, count(*) from public.deals where deal_owner = 'Anthony Cross' group by 1;
-- select team, count(*) from public.deals where deal_owner = 'Bradley Grant' group by 1;
-- İkisi de TEK satır dönmeli (sırasıyla 'SM - Burak Team' ve 'SM- Danish Team').
