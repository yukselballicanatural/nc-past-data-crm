-- ============================================================
-- PAYMENT TAKİP (payment_tracking) ALARM TİPİNİ VE ESKİ KAYITLARINI TEMİZLE
-- Supabase SQL Editor'e yapıştır ve çalıştır — İSTEĞE BAĞLI, tek seferlik.
--
-- Bu betiğe kadar yapılan kod değişikliğiyle (alarm-engine.js) artık hiçbir
-- deal için "payment_tracking" tipinde YENİ alarm üretilmiyor ve tüm panel
-- ekranları (Alarmlar tablosu, Kapatılan Alarmlar, KPI kartları, filtreler)
-- bu tipteki satırları zaten görmezden geliyor. Bu SQL'i çalıştırman ZORUNLU
-- DEĞİL — sadece `alarms` tablosunda halihazırda duran ESKİ payment_tracking
-- satırlarını (açık veya kapalı fark etmez) veritabanından tamamen SİLMEK
-- istersen kullan. Deal'lara (deals tablosu) HİÇBİR DOKUNUŞ yok, sadece
-- alarms tablosundaki bu tek tipteki satırlar etkileniyor.
-- ============================================================

-- 1) Önce kaç satır etkileneceğini gör (silme YOK, sadece SELECT):
select count(*) as payment_tracking_alarm_sayisi
from public.alarms
where alarm_type = 'payment_tracking';

-- 2) Yukarıdaki sayıyı gördükten ve onayladıktan SONRA aşağıdaki satırın
--    başındaki "--" işaretini kaldırıp çalıştır:

-- delete from public.alarms where alarm_type = 'payment_tracking';
