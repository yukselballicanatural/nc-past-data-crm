-- ============================================================
-- Farah Team - Morocco kadrosunu kullanıcının verdiği kesin listeye
-- (15 kişi) indir. Supabase SQL Editor'de çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================
--
-- Kullanıcının verdiği liste (2026-08-20) ile Zoho'daki güncel
-- "Farah Team - Morocco" kadrosu karşılaştırıldı: TEK fark
-- "Filippo Jr Sacco" — kullanıcının listesinde yok ama zoho_users'ta
-- hâlâ bu takımda görünüyor.
--
-- team_assignments'a team=NULL ("Satış Dışı") kaydı yazmak KALICI bir
-- karardır (bkz. api/_teams.js resolveZohoTeam — manuel atama Zoho'nun
-- kendi rol/takım alanını HER ZAMAN yener). Bu sayede Zoho tarafı bir
-- sonraki senkronda hâlâ eski değeri taşısa bile Filippo bir daha
-- Farah'ın kadrosunda/"Takımımdaki Kişiler"inde/"Günlük Ekip Girişi"nde
-- görünmez.
--
-- person_key üretimi api/_teams.js teamNameKey() ile BİREBİR aynı olmalı:
-- lower(trim(ad)) + fazla boşlukları teke indirme. "Filippo Jr Sacco" için
-- ekstra boşluk riski yok, doğrudan yazılabilir.

insert into public.team_assignments
  (person_key, full_name, team, is_leader, assigned_by, assigned_at, note)
values
  ('filippo jr sacco', 'Filippo Jr Sacco', null, false, 'system',
   now(), 'Kullanıcı talebiyle Farah takımından çıkarıldı (2026-08-20) — verilen 15 kişilik kesin listede yok.')
on conflict (person_key) do update
  set team = excluded.team,
      assigned_by = excluded.assigned_by,
      assigned_at = excluded.assigned_at,
      note = excluded.note;

-- ============================================================
-- Doğrulama
-- ============================================================
-- select * from public.team_assignments where person_key = 'filippo jr sacco';
-- ↑ team sütunu NULL olmalı.
--
-- Not: Bu satır yalnızca ROSTER görünürlüğünü kapatır (hangi takım
-- liderinin panelinde göründüğünü). Kişinin GEÇMİŞ deal'leri / performans
-- kayıtları silinmiyor, dokunulmuyor.
