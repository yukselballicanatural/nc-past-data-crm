-- ============================================================
-- "Sistem Etkisi" ölçümünü SIKILAŞTIR: yalnızca GERÇEKTEN GECİKMİŞ
-- (vadesi geçmiş) alarmlar "sistemin kazandırdığı para" sayılsın.
-- Supabase SQL Editor'de BİR KEZ çalıştır (deal_payment_history.sql'in
-- ÜZERİNE, o dosya zaten çalıştırılmış olmalı):
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================
--
-- NEDEN
-- Kullanıcı talebi: "önceki alarmı overdue olanları hesapla, onlar bizim
-- sistemin kazandırdığı; overdue olup değişenleri biz kazandırdık."
--
-- ESKİ kural: bir ödeme girişi (delta > 0), o deal için girişten ÖNCE
-- AÇILMIŞ herhangi bir alarm varsa "sistem sayesinde" sayılıyordu — alarm
-- hiç gecikmeden (vadesi geçmeden) aynı gün kapansa BİLE.
-- Bu gevşek: bir alarm açılıp saatler içinde normal seyrinde ödenen bir
-- deal de "kurtarıldı" gibi sayılıyordu, oysa bu zaten olağan bir tahsilattı.
--
-- YENİ kural: yalnızca alarmın reference_date'i (vadesi) ödeme ANINDAN
-- ÖNCE geçmişse sayılır — yani sistem bu ödemeyi GERÇEKTEN gecikmişken
-- yakalayıp kapatmış olmalı. Zamanında (vadesi geçmeden) kapanan bir alarm
-- artık "sistemin kazandırdığı" sayılmıyor.
--
-- admin.html'deki üstteki "hero" rakamı (İşaretlediğimiz deal'lerden kasaya
-- giren) client-side ayrı bir hesap; O TARAFA da aynı kural JS'te eklendi
-- (bkz. renderImpact() — reference_date < closed_at kontrolü). Bu dosya
-- yalnızca "Günlük tahsilat akışı" katmanının (deal_payment_history +
-- admin_payment_recovery RPC) SQL tarafını günceller.

create or replace function public.admin_payment_recovery(
  p_from         date    default null,
  p_to           date    default null,
  p_payment_only boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = public
set statement_timeout to '15000'
as $$
  with ev as (
    select h.deal_id, h.delta, h.changed_at, h.team, h.deal_owner, h.amount, h.new_paid
    from public.deal_payment_history h
    where h.delta > 0
      and (p_from is null or h.changed_at >= p_from::timestamptz)
      and (p_to   is null or h.changed_at <  (p_to + 1)::timestamptz)
  ),
  flagged as (
    -- Her ödeme girişi için, o girişten ÖNCE açılmış VE o giriş anında
    -- vadesi (reference_date) ZATEN GEÇMİŞ (gerçekten gecikmiş) bir alarm
    -- var mı? Zamanında kapanan alarmlar artık sayılmaz.
    select ev.*,
           (select min(a.created_at) from public.alarms a
             where a.deal_id = ev.deal_id
               and a.created_at <= ev.changed_at
               and a.reference_date is not null
               and a.reference_date < ev.changed_at::date
               and (not p_payment_only or a.alarm_type = 'payment_tracking')
           ) as first_flag_at
    from ev
  ),
  attributed as (
    select * from flagged where first_flag_at is not null
  )
  select jsonb_build_object(
    'ledger_started_at', (select min(changed_at) from public.deal_payment_history),
    'ledger_rows',       (select count(*) from public.deal_payment_history),

    -- Defterdeki TÜM para girişleri (işaretlenmiş olsun ya da olmasın)
    'inflow_total',      (select coalesce(sum(delta),0) from ev),
    'inflow_deals',      (select count(distinct deal_id) from ev),

    -- Gecikmişken işaretlenip SONRA gelen tahsilat (asıl rakam)
    'recovered_total',   (select coalesce(sum(delta),0) from attributed),
    'recovered_deals',   (select count(distinct deal_id) from attributed),
    'recovered_events',  (select count(*) from attributed),

    -- İşaretlemeden ödemeye geçen süre (gün) — medyan ve ortalama
    'days_median',       (select percentile_cont(0.5) within group (
                            order by extract(epoch from (changed_at - first_flag_at))/86400)
                          from attributed),
    'days_avg',          (select avg(extract(epoch from (changed_at - first_flag_at))/86400)
                          from attributed),

    'by_team',   (select coalesce(jsonb_agg(jsonb_build_object(
                    'team', team, 'recovered', recovered, 'deals', deals) order by recovered desc), '[]'::jsonb)
                  from (select coalesce(team,'—') team, sum(delta) recovered,
                               count(distinct deal_id) deals
                        from attributed group by 1) t),

    'by_owner',  (select coalesce(jsonb_agg(jsonb_build_object(
                    'owner', owner, 'recovered', recovered, 'deals', deals) order by recovered desc), '[]'::jsonb)
                  from (select coalesce(deal_owner,'—') owner, sum(delta) recovered,
                               count(distinct deal_id) deals
                        from attributed group by 1) t),

    -- Günlük seri (grafik için)
    'by_day',    (select coalesce(jsonb_agg(jsonb_build_object(
                    'd', d, 'recovered', recovered) order by d), '[]'::jsonb)
                  from (select changed_at::date d, sum(delta) recovered
                        from attributed group by 1) t),

    -- En büyük 50 kalem — denetim/drill-down için (rakamın arkasındaki deal'ler)
    'top_events', (select coalesce(jsonb_agg(jsonb_build_object(
                     'deal_id', deal_id, 'delta', delta, 'amount', amount,
                     'new_paid', new_paid, 'team', team, 'owner', deal_owner,
                     'changed_at', changed_at, 'flagged_at', first_flag_at,
                     'days', round((extract(epoch from (changed_at - first_flag_at))/86400)::numeric, 1)
                   ) order by delta desc), '[]'::jsonb)
                   from (select * from attributed order by delta desc limit 50) t)
  );
$$;

grant execute on function public.admin_payment_recovery(date, date, boolean) to anon, authenticated;

-- ============================================================
-- Doğrulama
-- ============================================================
-- select public.admin_payment_recovery();
-- Eski sonuçla (recovered_total) karşılaştır — yeni rakam EŞİT YA DA DAHA
-- KÜÇÜK olmalı (kural sıkılaştı, hiçbir zaman gevşemedi).
