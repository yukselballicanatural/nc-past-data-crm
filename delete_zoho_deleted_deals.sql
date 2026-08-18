-- ============================================================
-- Zoho'dan doğrudan silinen deal'leri deals tablosundan da kaldır
-- Supabase SQL Editor'de çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================
--
-- NEDEN
-- Harici Zoho→Supabase senkron süreci, Zoho'da silinen deal'leri
-- deals.is_deleted = true olarak işaretliyor ama satırı silmiyor.
-- alarm-engine.js bu alanı hiç kontrol etmediği için Zoho'da var
-- olmayan deal'ler için alarm üretmeye devam ediyordu (canlı ölçüm
-- 2026-08-18: 14 is_deleted=true deal, 13'ü aktif stage'de, bunlara
-- bağlı 11 açık alarm). Alarmlar zaten kapatıldı (canlı, anon key ile);
-- bu dosya yalnızca deal kayıtlarının kendisini kaldırıyor.
--
-- anon key ile DELETE denendi, RLS reddetti (deals tablosu kasıtlı
-- olarak anon-yazma/silmeye kapalı) — bu yüzden SQL Editor'den,
-- yetkili bağlantıyla çalıştırman gerekiyor.

-- Önce hangi kayıtların silineceğini teyit et:
select id, deal_name, stage, deleted_at, synced_at
from public.deals
where is_deleted = true;
-- 14 satır dönmeli (yukarıdaki liste ile aynı).

-- Teyit ettikten sonra sil:
delete from public.deals
where is_deleted = true;

-- Doğrulama — 0 dönmeli:
-- select count(*) from public.deals where is_deleted = true;
