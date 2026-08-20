-- ============================================================
-- Faz 3 (Clinic Planning — Deal Bazlı Chat) — CLINIC_PLANNING_ROADMAP.md
-- Supabase SQL Editor'de çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================
--
-- Takım lideri deal içinde "Clinic'e Bildir" ile tercüman/danışman/
-- planlama sorumlusuna mesaj gönderir. Roadmap'teki iki ayrı tablo
-- (clinic_messages + clinic_assignments) TEK tabloya birleştirildi —
-- `status` alanı hafif bir görev takibi de sağlıyor (open/acknowledged/
-- done), ayrı bir "assignment" tablosuna şu an gerek yok; ihtiyaç
-- büyürse (Faz 6 clinic-staff paneli) ayrıştırılabilir.
--
-- alarms/deals ile AYNI desen: RLS açık, "Public Access" policy — anon
-- key ile doğrudan Supabase REST üzerinden okunup yazılıyor (bu depoda
-- ayrı bir api/*.js uç noktası GEREKMİYOR, team-leader.html doğrudan
-- erişiyor).

create table if not exists public.clinic_messages (
  id                uuid default gen_random_uuid() primary key,
  deal_id           text not null,
  deal_name         text,
  sent_by_username  text,
  sent_by_name      text,
  sent_to_role      text not null,   -- 'Translators Manager' | 'Profclinic' | 'Planning'
  message           text not null,
  related_alarm_id  uuid,
  status            text not null default 'open',   -- open | acknowledged | done
  read_at           timestamptz,
  read_by           text,
  resolved_at       timestamptz,
  resolved_by       text,
  created_at        timestamptz default now() not null
);

alter table public.clinic_messages enable row level security;
create policy "Public Access" on public.clinic_messages for all using (true) with check (true);

create index if not exists clinic_messages_deal_id_idx    on public.clinic_messages(deal_id);
create index if not exists clinic_messages_created_at_idx on public.clinic_messages(created_at desc);
create index if not exists clinic_messages_status_idx     on public.clinic_messages(status);

-- ============================================================
-- Doğrulama
-- ============================================================
-- select * from public.clinic_messages order by created_at desc limit 10;
