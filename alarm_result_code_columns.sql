-- ============================================================
-- ALARMS TABLOSUNA SONUÇ KODU (RESULT CODE) KOLONLARI
-- Supabase SQL Editor'e yapıştır ve çalıştır — tek seferlik.
--
-- Zoho_Deals_Alarm_Yonetimi.md'de tanımlanan manuel Sonuç Kodu / Takibe Al
-- akışı için gerekli. result_code: seçilen sonuç kodu metni (ör. "Hasta
-- Geldi", "Ulaşılamadı"). follow_up_date: "Takibe Al" aksiyonlu bir sonuç
-- kodu seçildiğinde zorunlu olan yeni takip tarihi.
-- ============================================================

ALTER TABLE public.alarms
  ADD COLUMN IF NOT EXISTS result_code text,
  ADD COLUMN IF NOT EXISTS follow_up_date date;

CREATE INDEX IF NOT EXISTS alarms_follow_up_date_idx ON public.alarms(follow_up_date);
