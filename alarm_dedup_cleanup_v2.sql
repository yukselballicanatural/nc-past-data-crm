-- ============================================================
-- ALARM KOPYA TEMİZLİĞİ v2 — "Bugün" + "Yaklaşıyor" çifti
-- Supabase SQL Editor'de BİR KEZ çalıştır.
--
-- SORUN: Motor, bir hastanın arrival/vizit tarihi "bugün" olduğunda
-- eski "N gün kaldı (yaklaşıyor)" alarmıyla AYNI (deal_id, alan, tarih)
-- için FARKLI bir dedup_key ("..._today_...") kullanıyordu. Bu yüzden
-- eski "yaklaşıyor" alarmı kapanmadan yeni bir "bugün" alarmı daha
-- açılıyor, aynı hasta için 2 (hatta daha fazla) kart birden
-- görünüyordu (bkz. ekran görüntüsü şikayeti — takım liderinde aynı
-- isimden 2şer kart, biri "arrival yaklaşıyor 1g" biri "bugün gelecek").
--
-- Motor artık düzeltildi (alarm-engine.js — iki dal da aynı dedup_key'i
-- kullanıyor). Bu script GEÇMİŞTE birikmiş kopyaları temizler.
--
-- MANTIK: Aynı (deal_id, reference_field, reference_date) için açık/aktif
-- durumda BİRDEN FAZLA alarm varsa (alarm_type FARKLI olsa bile), sadece
-- EN GÜNCEL olanı (en son created_at) bırakır, diğerlerini siler.
-- Kapatılmış/iptal alarmlara DOKUNMAZ.
-- ============================================================

with ranked as (
  select
    id,
    row_number() over (
      partition by deal_id, reference_field, reference_date
      order by created_at desc, id desc
    ) as rn
  from public.alarms
  where status in ('open','seen','in_progress','escalated','arrived','examined','processing')
    and reference_date is not null
)
delete from public.alarms
where id in (select id from ranked where rn > 1);

-- Kontrol: temizlikten sonra açık alarmlarda kopya kalmamalı (0 satır dönmeli)
-- select deal_id, reference_field, reference_date, count(*), array_agg(alarm_type)
-- from public.alarms
-- where status in ('open','seen','in_progress','escalated','arrived','examined','processing')
--   and reference_date is not null
-- group by 1,2,3 having count(*) > 1;
