-- ============================================================
-- Faz 3 (Clinic Planning — Deal Bazlı Sohbet) — CLINIC_PLANNING_ROADMAP.md
-- Supabase SQL Editor'de çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================
--
-- AMAÇ (kullanıcı talebi, aynen): takım liderleri bir deal'de düzeltme
-- gerektiğinde ekran görüntüsü alıp Zoho'daki deal'in "Notes" alanına
-- yapıştırıp sohbeti ORADA yürütüyorlardı. Artık bu, her deal için kendi
-- sohbet dizisi olarak BİZİM sistemimizde yapılıyor.
--
-- KİME gidiyor: rol seçimi YOK. Muhatap, Zoho'nun deal üzerindeki
-- `Aftercare_Owner` alanından ({id, name}) otomatik okunuyor — canlı veride
-- doğrulandı (2026-08-20: 400 deal örneğinde 105'i dolu, biçim
-- {"id":"645008000090451331","name":"Mohammad Azzam"}). Alan boş olan
-- deal'lerde arayüz sohbeti açar ama "Aftercare sorumlusu atanmamış"
-- uyarısı gösterir.
--
-- Bu dosya TEKRAR ÇALIŞTIRILABİLİR (idempotent): tablo daha önceki
-- sürümüyle oluşturulmuş olsa bile `add column if not exists` ile
-- eksik kolonlar tamamlanır, veri kaybı olmaz.
--
-- alarms/deals ile AYNI desen: RLS açık, "Public Access" policy — anon key
-- ile doğrudan Supabase REST üzerinden okunup yazılıyor, ayrı bir
-- api/*.js uç noktası GEREKMİYOR (bkz. clinic-chat.js).

create table if not exists public.clinic_messages (
  id                uuid default gen_random_uuid() primary key,
  deal_id           text not null,
  deal_name         text,
  message           text not null,
  created_at        timestamptz default now() not null
);

-- Sonradan eklenen/eksik kalabilecek kolonlar — bkz. idempotent notu.
alter table public.clinic_messages
  -- Bildirimleri takım liderinin KENDİ takımına sınırlamak için (deals'a
  -- join atmadan): bir TL yalnızca kendi takımının deal'lerindeki sohbetlerde
  -- bildirim almalı.
  add column if not exists deal_team        text,
  add column if not exists sent_by_username text,
  add column if not exists sent_by_name     text,
  add column if not exists sent_by_role     text,
  -- Muhatap: Zoho Aftercare_Owner ({id, name}) — rol seçimi yok.
  add column if not exists sent_to_id       text,
  add column if not exists sent_to_name     text,
  add column if not exists sent_to_role     text default 'Aftercare Owner',
  -- Ek görsel sayısı. Dosyaların KENDİSİ Supabase Storage'da duruyor
  -- (alarm-attachments bucket, path prefix alarm/<deal_id>/ — attach-util.js
  -- + api/alarm-files.js zaten deal id'sini kabul ediyor, bkz. o dosyalar).
  -- Burada yalnızca "bu mesajda ek var mı" bilgisi tutuluyor.
  add column if not exists attachment_count integer default 0,
  add column if not exists related_alarm_id uuid,
  add column if not exists status           text default 'open',
  add column if not exists read_at          timestamptz,
  add column if not exists read_by          text;

alter table public.clinic_messages enable row level security;

-- Policy'i tekrar oluşturmak hata verir; varsa düşürüp yeniden kur.
drop policy if exists "Public Access" on public.clinic_messages;
create policy "Public Access" on public.clinic_messages for all using (true) with check (true);

create index if not exists clinic_messages_deal_id_idx    on public.clinic_messages(deal_id);
create index if not exists clinic_messages_created_at_idx on public.clinic_messages(created_at desc);
-- Bildirim sorgusu: okunmamış + takıma göre.
create index if not exists clinic_messages_unread_idx     on public.clinic_messages(deal_team, read_at);

-- ============================================================
-- Doğrulama
-- ============================================================
-- select column_name, data_type from information_schema.columns
-- where table_name = 'clinic_messages' order by ordinal_position;
--
-- select * from public.clinic_messages order by created_at desc limit 10;
