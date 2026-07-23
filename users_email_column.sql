-- ============================================================
-- USERS TABLOSUNA E-POSTA KOLONU
-- Supabase SQL Editor'e yapıştır ve çalıştır
-- Takım Liderinin "Takımımdaki Kişiler" tablosuna
-- danışmanların e-posta adresini girebilmesi için.
-- Erişim sadece service_role kullanan api/team-members.js üzerinden.
-- ============================================================

ALTER TABLE public."Users"
  ADD COLUMN IF NOT EXISTS "Email" text;
