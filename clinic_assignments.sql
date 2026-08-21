-- ============================================================
-- Faz 3 (2/2) — Clinic Görev Atama — CLINIC_PLANNING_ROADMAP.md Bölüm 5
-- Supabase SQL Editor'de çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================
--
-- NEDEN AYRI TABLO (mesaja bir kolon eklemek yerine):
-- Mesaj ile görev farklı ömürlere sahip. Mesaj yazıldığı anda BİTER ve bir
-- daha değişmez; görev ise açılır, bekler, tamamlanır veya "yapamadım"a
-- düşer. İkisi aynı satırda tutulsaydı her durum değişikliği mesaj kaydını
-- da mutasyona uğratırdı ve "kim ne zaman ne yazdı" denetim izi bozulurdu —
-- oysa yol haritasındaki asıl amaç tam olarak o iz.
--
-- AÇIKLAMA MESAJIN KENDİSİDİR: görev `message_id` ile bağlı olduğu mesaja
-- işaret ediyor, metin orada duruyor (`description` yalnızca mesajsız/salt
-- ek gönderimlerde doluyor). Böylece aynı metin iki yerde tutulmuyor.
--
-- ÇÖZÜM (status='done'/'blocked') KLİNİK TARAFINDAN yazılacak — o panel
-- Faz 6. Bu faz görevi ÜRETİR, durumunu gösterir ve denetim izini tutar;
-- takım lideri yalnızca kendi açtığı görevi İPTAL edebilir (başkası adına
-- "tamamlandı" işaretlemek denetim izini yalan yapardı).
--
-- Bu dosya TEKRAR ÇALIŞTIRILABİLİR (idempotent) — clinic_messages.sql ile
-- aynı desen. RLS açık + "Public Access": anon key ile REST üzerinden
-- okunup yazılıyor, ayrı api/*.js ucu gerekmiyor.

create table if not exists public.clinic_assignments (
  id          uuid default gen_random_uuid() primary key,
  deal_id     text not null,
  created_at  timestamptz default now() not null
);

alter table public.clinic_assignments
  add column if not exists deal_name            text,
  -- Bildirim/filtre sorguları deals'a join atmadan takıma göre daralsın
  -- (clinic_messages.deal_team ile aynı gerekçe).
  add column if not exists deal_team            text,
  -- Görevin açıklaması olan mesaj. Silinirse görev yetim kalmasın diye
  -- yabancı anahtar YOK: mesajlar denetim kaydı, silinmiyorlar.
  add column if not exists message_id           uuid,
  add column if not exists assigned_by_username text,
  add column if not exists assigned_by_name     text,
  -- Muhatap: clinic_messages ile AYNI çözüm yolu (Zoho Aftercare_Owner,
  -- yoksa WA_Group'tan çözülen kişi, hiçbiri yoksa 'Unassigned').
  add column if not exists assigned_to_id       text,
  add column if not exists assigned_to_name     text,
  add column if not exists assigned_to_role     text,
  -- Alarmdan açılan görevlerde alarm tipi (hotel_missing, interpreter_missing
  -- ...); alarmsız görevlerde 'manual'. Faz 4/5 panolarında kırılım için.
  add column if not exists action_type          text default 'manual',
  add column if not exists description          text,
  add column if not exists priority             text default 'normal',
  add column if not exists due_date             date,
  add column if not exists related_alarm_id     uuid,
  add column if not exists status               text default 'open',
  add column if not exists resolved_at          timestamptz,
  add column if not exists resolved_by          text,
  add column if not exists resolution_note      text;

-- Serbest metin yerine kapalı küme: panolar (Faz 4/5) bu değerlere göre
-- sayacak, yazım farkı sessizce yanlış sayıya yol açardı.
-- `not valid`: tabloda önceki sürümden veri varsa kurulum patlamasın.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clinic_assignments_status_chk') then
    alter table public.clinic_assignments
      add constraint clinic_assignments_status_chk
      check (status in ('open', 'done', 'blocked', 'cancelled')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clinic_assignments_priority_chk') then
    alter table public.clinic_assignments
      add constraint clinic_assignments_priority_chk
      check (priority in ('normal', 'high', 'urgent')) not valid;
  end if;
end $$;

alter table public.clinic_assignments enable row level security;

drop policy if exists "Public Access" on public.clinic_assignments;
create policy "Public Access" on public.clinic_assignments for all using (true) with check (true);

-- Sohbet çizilirken görevler mesaja bağlanıyor: deal_id ile çekilip
-- message_id'ye göre eşleniyor (bkz. clinic-chat.js _loadThread).
create index if not exists clinic_assignments_deal_id_idx    on public.clinic_assignments(deal_id);
create index if not exists clinic_assignments_message_id_idx on public.clinic_assignments(message_id);
-- Faz 4/5 panoları: açık görevler, takıma ve termine göre.
create index if not exists clinic_assignments_open_idx       on public.clinic_assignments(status, deal_team, due_date);

-- ============================================================
-- Doğrulama
-- ============================================================
-- select column_name, data_type from information_schema.columns
-- where table_name = 'clinic_assignments' order by ordinal_position;
--
-- select status, priority, count(*) from public.clinic_assignments
-- group by 1,2 order by 1,2;
