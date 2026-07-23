-- ============================================================
-- USERS TABLOSUNA TELEFON NUMARASI KOLONU
-- Supabase SQL Editor'e yapıştır ve çalıştır
-- Takım Liderinin "Takımımdaki Kişiler" sayfasından takımındaki
-- danışmanların WhatsApp'tan ulaşılabilecek telefon numaralarını
-- girip güncelleyebilmesi için (bkz. api/team-members.js).
-- Bu kolona anon key ile ASLA doğrudan erişilmiyor — Users tablosu
-- zaten tamamen kilitli (bkz. users_rls_lockdown.sql / rls_hardening.sql),
-- erişim sadece service_role kullanan yeni api/team-members.js üzerinden.
-- ============================================================

ALTER TABLE public."Users"
  ADD COLUMN IF NOT EXISTS "Phone" text;
