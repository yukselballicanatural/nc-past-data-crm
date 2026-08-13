-- ============================================================
-- ÖDEME GEÇMİŞİ DEFTERİ — "sistem ne kadar para kazandırdı?" sorusunun
-- KESİN cevabını ölçmek için. Supabase SQL Editor'e yapıştır, BİR KEZ çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================
--
-- NEDEN GEREKLİ (ölçümle doğrulandı)
-- "Sistem sayesinde kasaya şu kadar para girdi" cümlesini kanıtlamak için
-- bir deal'in ödemesinin ZAMAN İÇİNDE nasıl arttığını bilmek gerekiyor:
-- alarm 8 Temmuz'da açıldıysa ve 16 Temmuz'da 5.000 € geldiyse, o 5.000 €
-- "işaretlemeden SONRA gelen tahsilat"tır.
--
-- Ancak bu bilgi ŞU AN HİÇBİR YERDE TUTULMUYOR. Canlı veri üzerinde
-- doğrulandı:
--   * Zoho senkronu `deals.total_paid_amount` kolonunu ÜZERİNE YAZIYOR —
--     eski tutar kalıcı olarak kayboluyor.
--   * `deals.raw` içindeki 169 Zoho alanı tarandı: ödeme TARİHİ alanı yok.
--     `Last_Payment_Amount` yalnızca son ödemenin tutarı (o da eziliyor),
--     `Change_Log_Time__s` bir değişim günlüğü DEĞİL (sadece zaman damgası,
--     Modified_Time ile aynı), `Previous_Grand_Total`/`Previous_Approval_Amount`
--     alanları ölçülen kayıtlarda boş.
--   * `Logs.old_values` yalnızca result_code/sub_code/agent_note gibi iş akışı
--     kolonlarını saklıyor — tutar alanları oraya HİÇ girmiyor.
--   * `deals.row_updated_at` "bir şey değişti" der, NEYİN NE KADAR
--     değiştiğini söylemez.
--
-- Sonuç: geçmiş GERİYE DÖNÜK üretilemez. Bu defter çalıştırıldığı andan
-- itibaren ölçer. Geriye dönük sahte veri üretilmiyor — Sistem Etkisi
-- sayfası ölçümün başladığı tarihi açıkça yazar.
--
-- NEDEN UYGULAMA KATMANI DEĞİL, TRIGGER
-- Zoho→Supabase senkronu bu repoda değil ve uygulama katmanından geçmiyor
-- (api/ altında deals'a yazan tek dosya yok). Dolayısıyla ödeme değişimini
-- yakalayabilecek tek yer veritabanının kendisi.
--
-- MALİYET
-- Satır yalnızca `total_paid_amount` GERÇEKTEN değiştiğinde yazılıyor
-- (IS DISTINCT FROM). Senkron aynı tutarı tekrar yazdığında defter büyümez.
-- ============================================================

create table if not exists public.deal_payment_history (
  id          bigserial primary key,
  deal_id     text        not null,
  old_paid    numeric,
  new_paid    numeric,
  delta       numeric,                                   -- artı = kasaya giren
  amount      numeric,                                   -- o anki sözleşme tutarı
  stage       text,
  team        text,
  deal_owner  text,
  changed_at  timestamptz not null default now()
);

-- Sorgu desenleri: (a) bir deal'in kronolojisi, (b) tarih aralığında toplam
-- tahsilat, (c) yalnızca para GİRİŞLERİ.
create index if not exists dph_deal_changed_idx on public.deal_payment_history(deal_id, changed_at);
create index if not exists dph_changed_idx      on public.deal_payment_history(changed_at desc);
create index if not exists dph_delta_pos_idx    on public.deal_payment_history(changed_at desc) where delta > 0;

-- Defter DEĞİŞTİRİLEMEZ olmalı: kanıt niteliği taşıyor. Okuma serbest,
-- yazma yalnızca aşağıdaki security definer trigger üzerinden (tablo sahibi
-- olarak RLS'i aşar). anon/authenticated rolleri INSERT/UPDATE/DELETE
-- yapamaz — kasten policy verilmedi (aynı desen: admin_cache).
alter table public.deal_payment_history enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'deal_payment_history'
      and policyname = 'dph_read'
  ) then
    create policy dph_read on public.deal_payment_history for select using (true);
  end if;
end $$;

create or replace function public.deals_log_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Yalnızca ödeme tutarı gerçekten değiştiyse yaz. NULL→0 / 0→NULL gibi
  -- anlamsız salınımları da ayıklıyoruz: coalesce ile karşılaştırılıyor.
  if coalesce(NEW.total_paid_amount, 0) is distinct from coalesce(OLD.total_paid_amount, 0) then
    insert into public.deal_payment_history
      (deal_id, old_paid, new_paid, delta, amount, stage, team, deal_owner)
    values (
      NEW.id,
      coalesce(OLD.total_paid_amount, 0),
      coalesce(NEW.total_paid_amount, 0),
      coalesce(NEW.total_paid_amount, 0) - coalesce(OLD.total_paid_amount, 0),
      coalesce(NEW.amount, 0),
      NEW.stage,
      NEW.team,
      NEW.deal_owner
    );
  end if;
  return NEW;
end;
$$;

-- AFTER UPDATE: satır zaten yazıldıktan sonra defterlenir; trigger hata
-- verse bile (defter dolu/kilitli vb.) senkronun kendi yazması bozulmasın
-- diye BEFORE değil AFTER seçildi.
drop trigger if exists trg_deals_log_payment_change on public.deals;
create trigger trg_deals_log_payment_change
  after update on public.deals
  for each row execute function public.deals_log_payment_change();

-- ============================================================
-- ÖLÇÜM RPC'si — "alarm açıldıktan SONRA gelen tahsilat"
-- ============================================================
-- Attribution kuralı (kasten muhafazakâr ve ŞEFFAF):
--   Bir ödeme girişi (delta > 0) ancak o deal için AÇILMIŞ ve girişten ÖNCE
--   oluşturulmuş bir alarm varsa sayılır. Yani sistem o deal'i o para
--   gelmeden önce işaretlemiş olmalı.
--
--   `payment_only = true` ise yalnızca ÖDEME ile ilgili işaretlemeler sayılır
--   (payment_tracking alarmı veya Won ödeme takibi sonuç kodu) — daha sıkı,
--   daha savunulabilir rakam.
--
-- DÜRÜSTLÜK NOTU: bu bir ZAMAN SIRASI tespitidir, nedensellik kanıtı değil.
-- "İşaretlendi, sonra para geldi" der; "işaretlenmese gelmezdi" DEMEZ.
-- Sayfa arayüzü de bu ifadeyi aynen kullanıyor.
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
    -- Her ödeme girişi için, o girişten ÖNCE açılmış bir alarm var mı?
    select ev.*,
           (select min(a.created_at) from public.alarms a
             where a.deal_id = ev.deal_id
               and a.created_at <= ev.changed_at
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

    -- İşaretlemeden SONRA gelen tahsilat (asıl rakam)
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
-- Doğrulama / test
-- ============================================================
-- 1) Defter kuruldu mu:
--    select count(*) from public.deal_payment_history;      -- ilk anda 0 (normal)
-- 2) Trigger duruyor mu:
--    select tgname from pg_trigger where tgname = 'trg_deals_log_payment_change';
-- 3) Ölçüm (defter dolmaya başladıktan sonra anlamlı olur):
--    select public.admin_payment_recovery();                 -- tüm zaman, geniş kural
--    select public.admin_payment_recovery(null, null, true);  -- yalnızca ödeme alarmları
--    select public.admin_payment_recovery('2026-08-01','2026-08-31');
-- 4) Bir deal'in ödeme kronolojisi:
--    select changed_at, old_paid, new_paid, delta from public.deal_payment_history
--     where deal_id = '645008001114228553' order by changed_at;
--
-- GERİ ALMAK istersen (defter verisi silinmez, sadece kayıt durur):
--    drop trigger if exists trg_deals_log_payment_change on public.deals;
