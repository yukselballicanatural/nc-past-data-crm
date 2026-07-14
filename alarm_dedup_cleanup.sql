-- ============================================================
-- ALARM KOPYA TEMİZLİĞİ (Görev 11)
-- Supabase SQL Editor'de BİR KEZ çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
--
-- SORUN: Eski alarm motoru dedup_key'e eşik gününü (45/30/15/7/3) dahil
-- ediyordu. Hasta yaklaştıkça (15g→7g→3g) her eşikte YENİ alarm satırı
-- oluşup eskiler kapanmadan birikiyordu — tek hasta için 4'e kadar açık alarm.
-- Motor artık düzeltildi (dedup_key'de eşik yok) ama GEÇMİŞTE birikmiş
-- kopyalar tabloda duruyor. Bu script onları temizler.
--
-- MANTIK: Aynı (deal_id, reference_field, reference_date, alarm_type) için
-- açık/aktif durumda BİRDEN FAZLA alarm varsa, sadece EN GÜNCEL olanı (en son
-- created_at) bırakır, diğerlerini siler. KAPATILMIŞ/İPTAL alarmlara (closed,
-- cancelled, no_show) DOKUNMAZ — geçmiş kayıt olarak korunur.
--
-- service_role (SQL Editor) RLS'i by-pass eder, DELETE burada çalışır.
-- ============================================================

with ranked as (
  select
    id,
    row_number() over (
      partition by deal_id, reference_field, reference_date, alarm_type
      order by created_at desc, id desc
    ) as rn
  from public.alarms
  where status in ('open','seen','in_progress','escalated')
    and reference_date is not null
)
delete from public.alarms
where id in (select id from ranked where rn > 1);

-- Kontrol: temizlikten sonra açık alarmlarda kopya kalmamalı (0 satır dönmeli)
-- select deal_id, reference_field, reference_date, alarm_type, count(*)
-- from public.alarms
-- where status in ('open','seen','in_progress','escalated') and reference_date is not null
-- group by 1,2,3,4 having count(*) > 1;
