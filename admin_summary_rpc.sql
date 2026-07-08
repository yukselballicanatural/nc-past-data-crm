-- ============================================================
-- ADMIN PANELİ — SUNUCU TARAFLI ÖZET (AGGREGATE) FONKSİYONU
-- Supabase SQL Editor'e yapıştır ve BİR KEZ çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
--
-- Amaç: admin paneli 49K+ deal satırının tamamını tarayıcıya indirip
-- toplamları JavaScript'te hesaplıyordu (yavaş + rakamlar sonradan gelip
-- "0"dan zıplıyordu). Bu fonksiyon tüm toplamları Postgres'te (milisaniyeler)
-- hesaplayıp sadece birkaç KB'lık özet döndürür. Yeni deal geldiğinde otomatik
-- yansır — bakım/trigger gerektirmez, drift olmaz.
--
-- Not: Cutoff tarihi (2026-06-15) admin.html'deki isBeforeCutoff ile birebir
-- aynıdır. Değiştirirsen iki yeri birlikte güncelle.
-- ============================================================

create or replace function public.admin_deal_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with flags as (
    select
      coalesce(amount, 0)::numeric            as amount,
      coalesce(total_paid_amount, 0)::numeric  as paid,
      coalesce(remaining_amount, 0)::numeric   as unpaid,
      coalesce(stage, '')                      as stage,
      coalesce(team, '')                       as team,
      coalesce(deal_owner, '')                 as owner,
      arrival_date                             as arrival,
      visit_date_1                             as v1,
      visit_date_2                             as v2,
      visit_date_3                             as v3,
      created_time,
      nullif(result_codes, '')                 as rc,
      coalesce(nullif(raw->>'Language',''), 'Unknown') as lang,
      (lower(coalesce(stage,'')) like '%won%')    as is_won,
      (lower(coalesce(stage,'')) like '%cancel%') as is_cancel,
      case
        when coalesce(total_paid_amount,0) <= 0 then 'Unpaid'
        when coalesce(amount,0) > 0 and coalesce(total_paid_amount,0) >= coalesce(amount,0) then 'Paid'
        else 'Partial'
      end as pay_status,
      (visit_date_1 is not null or visit_date_2 is not null or visit_date_3 is not null) as visited
    from public.deals
  )
  select jsonb_build_object(
    'total',            (select count(*) from flags),
    'sum_amount',       (select coalesce(sum(amount),0)  from flags),
    'sum_paid',         (select coalesce(sum(paid),0)    from flags),
    'sum_unpaid',       (select coalesce(sum(unpaid),0)  from flags),
    'won',              (select count(*) from flags where is_won),
    'cancel',           (select count(*) from flags where is_cancel),
    'no_result',        (select count(*) from flags where rc is null),
    'visited',          (select count(*) from flags where visited),
    'unlock_requested', 0,  -- deals tablosunda lock_approval_requested kolonu yok (mevcut davranışla aynı: 0)

    -- Sekme rozetleri: won hariç; a/v1/v2/v3 = iptal de hariç, tarih cutoff öncesi
    'badge_arrival',    (select count(*) from flags where not is_won and not is_cancel and arrival < date '2026-06-15'),
    'badge_v1',         (select count(*) from flags where not is_won and not is_cancel and v1 < date '2026-06-15'),
    'badge_v2',         (select count(*) from flags where not is_won and not is_cancel and v2 < date '2026-06-15'),
    'badge_v3',         (select count(*) from flags where not is_won and not is_cancel and v3 < date '2026-06-15'),
    'badge_cancelled',  (select count(*) from flags where not is_won and is_cancel and (
                            arrival < date '2026-06-15' or
                            v1 < date '2026-06-15' or
                            v2 < date '2026-06-15' or
                            v3 < date '2026-06-15' or
                            created_time::date < date '2026-06-15'
                         )),

    'by_stage',   (select coalesce(jsonb_agg(jsonb_build_object('stage',stage,'cnt',cnt) order by cnt desc),'[]'::jsonb)
                     from (select stage, count(*) cnt from flags group by stage) a),
    'by_payment', (select coalesce(jsonb_agg(jsonb_build_object('status',pay_status,'cnt',cnt) order by cnt desc),'[]'::jsonb)
                     from (select pay_status, count(*) cnt from flags group by pay_status) a),
    'by_month',   (select coalesce(jsonb_agg(jsonb_build_object('ym',ym,'cnt',cnt,'amount',amt) order by ym),'[]'::jsonb)
                     from (select to_char(arrival,'YYYY-MM') ym, count(*) cnt, sum(amount) amt
                             from flags where arrival is not null group by to_char(arrival,'YYYY-MM')) a),
    'by_result',  (select coalesce(jsonb_agg(jsonb_build_object('code',rc,'cnt',cnt,'agents',agents) order by cnt desc),'[]'::jsonb)
                     from (select rc, count(*) cnt, count(distinct owner) agents
                             from flags where rc is not null group by rc) a),
    'by_team',    (select coalesce(jsonb_agg(jsonb_build_object('team',team,'deals',deals,'paid',paid,'unpaid',unpaid,'won',won,'results',results) order by deals desc),'[]'::jsonb)
                     from (select team, count(*) deals, sum(paid) paid, sum(unpaid) unpaid,
                                  count(*) filter (where is_won) won,
                                  count(*) filter (where rc is not null) results
                             from flags group by team) a),
    'by_owner',   (select coalesce(jsonb_agg(jsonb_build_object('owner',owner,'deals',deals,'paid',paid,'unpaid',unpaid,'won',won,'results',results) order by deals desc),'[]'::jsonb)
                     from (select owner, count(*) deals, sum(paid) paid, sum(unpaid) unpaid,
                                  count(*) filter (where is_won) won,
                                  count(*) filter (where rc is not null) results
                             from flags group by owner) a),
    'by_language',(select coalesce(jsonb_agg(jsonb_build_object('lang',lang,'cnt',cnt) order by cnt desc),'[]'::jsonb)
                     from (select lang, count(*) cnt from flags group by lang) a)
  );
$$;

grant execute on function public.admin_deal_summary() to anon, authenticated;

-- Test: select public.admin_deal_summary();
