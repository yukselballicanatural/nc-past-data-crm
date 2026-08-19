-- ============================================================
-- "Sistem Etkisi" ölçümünü SIKILAŞTIR (2. tur): yalnızca GERÇEKTEN
-- GECİKMİŞ + en az 1 hafta geçmiş + ARKASINDA GERÇEK BİR AKSİYON (log) olan
-- ödemeler "sistemin kazandırdığı para" sayılsın.
-- Supabase SQL Editor'de çalıştır (deal_payment_history.sql +
-- alarm_logs_and_settings.sql ÖNCEDEN çalıştırılmış olmalı):
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================
--
-- NEDEN (2. tur sıkılaştırma — kullanıcı talebi, aynen)
-- "overdue olan ve 1 hafta sonra ödeme gelen hatta bizde logu olan yani
--  tıklamış takım lideri zohoya gitmiş veya o alarmı kapatmış kendisi veya
--  sistem veya agenta mesaj atmış whatsaptan yani cidden bizde hareket
--  dönmüş olanlar olsun ama minimum 1 hafta süre geçmiş olan."
--
-- 1. tur (aynı dosyanın önceki hâli): yalnızca "vadesi geçmişken kapandı" —
-- kabul, ama bir alarm vadesi geçer geçmez (ör. 1 gün sonra) ödense de
-- sayılıyordu; bu da "sistem gerçekten arayı kapattı mı yoksa tesadüf mü"
-- sorusunu tam cevaplamıyordu.
--
-- 2. tur (bu dosya) ÜÇ koşulun HEPSİNİ birden ister:
--   a) GECİKMİŞ  : alarmın reference_date'i (vadesi) ödeme ANINDAN önce geçmiş.
--   b) EN AZ 1 HAFTA: ödeme, vade geçtikten EN AZ 7 gün SONRA gelmiş — kısa
--      süreli/tesadüfi gecikmeleri eler, gerçekten "uzun süre bekleyip
--      sonra tahsil edilen" parayı ölçer.
--   c) GERÇEK AKSİYON: o alarm için alarm_logs'ta 'created' DIŞINDA en az
--      bir kayıt var — durum değiştirilmiş, not düşülmüş, kapatılmış,
--      yeniden açılmış, otomatik kapanmış YA DA agent'a WhatsApp gönderilmiş.
--      'created' sayılmaz çünkü o her alarmda otomatik oluşuyor, bir kanıt
--      değil. Aksiyonun ödemeden ÖNCE/aynı anda olması şart — sonradan
--      düşülen bir not, o ödemeye neden olmuş sayılamaz.
--
-- Bu üçü birden = "sistem gerçekten bu parayı ARADI, TAKİP ETTİ ve
-- KAZANDIRDI" iddiasının en savunulabilir hâli.
--
-- 3. tur: Sarah Shahin (Ahmed Anwar takımı) SADECE bu ölçümden hariç
-- tutuldu — kullanıcı talebi: "onun paralarını da hesaplamıyacaz". Başka
-- hiçbir yeri (alarm, Analytics, kendi paneli) etkilemiyor.

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
    -- Sarah Shahin (Ahmed Anwar takımı, gerçek adı Ayhan Şahin) SADECE bu
    -- sayfada/RPC'de hariç tutuluyor — kullanıcı talebi: "onun paralarını da
    -- hesaplamıyacaz". Başka hiçbir ekranı (alarmlar, Analytics, kendi
    -- panelindeki dealleri) etkilemez, yalnızca "Sistem Etkisi" ölçümünden
    -- çıkarılıyor.
    select h.deal_id, h.delta, h.changed_at, h.team, h.deal_owner, h.amount, h.new_paid
    from public.deal_payment_history h
    where h.delta > 0
      and h.deal_owner is distinct from 'Sarah Shahin'
      and (p_from is null or h.changed_at >= p_from::timestamptz)
      and (p_to   is null or h.changed_at <  (p_to + 1)::timestamptz)
  ),
  flagged as (
    -- Her ödeme girişi için: (a) girişten ÖNCE açılmış, (b) o giriş anında
    -- vadesi EN AZ 7 GÜNDÜR geçmiş (gerçekten gecikmiş) bir alarm var mı?
    -- Birden fazla uyan varsa EN ERKEN açılanı alınır (overdue_alarm_id ile
    -- birlikte — aşağıda alarm_logs'a bunun üzerinden bakılıyor).
    select ev.*, ov.id as overdue_alarm_id, ov.created_at as first_flag_at
    from ev
    left join lateral (
      select a.id, a.created_at
      from public.alarms a
      where a.deal_id = ev.deal_id
        and a.created_at <= ev.changed_at
        and a.reference_date is not null
        and a.reference_date < ev.changed_at::date
        and (ev.changed_at::date - a.reference_date) >= 7
        and (not p_payment_only or a.alarm_type = 'payment_tracking')
      order by a.created_at asc
      limit 1
    ) ov on true
  ),
  attributed as (
    -- + GERÇEK AKSİYON şartı: 'created' dışında, ödemeden ÖNCE/aynı anda
    -- düşülmüş en az bir alarm_logs kaydı (durum değişikliği, not, kapatma,
    -- yeniden açma, otomatik kapatma ya da WhatsApp gönderimi). INNER JOIN
    -- LATERAL hem şartı sağlıyor (eşleşmeyen satır hiç gelmiyor) hem de
    -- HANGİ aksiyonun sayıldığını (action_taken/action_by/action_at)
    -- kanıt olarak arayüze taşıyor — kullanıcı talebi: "o deal'ı bağlamak
    -- için hangi aksiyonu almışlar onu da gösterelim."
    select f.*, al.action_type as action_taken, al.action_by, al.created_at as action_at
    from flagged f
    join lateral (
      select l.action_type, l.action_by, l.created_at
      from public.alarm_logs l
      where l.alarm_id = f.overdue_alarm_id
        and l.action_type <> 'created'
        and l.created_at <= f.changed_at
      -- Kapatma/otomatik kapatma en açıklayıcı kanıt (ödemenin nedeni
      -- muhtemelen budur); yoksa ödemeye en YAKIN (son) aksiyon gösterilir.
      order by (case when l.action_type in ('closed','auto_closed') then 0 else 1 end),
               l.created_at desc
      limit 1
    ) al on true
    where f.overdue_alarm_id is not null
  )
  select jsonb_build_object(
    'ledger_started_at', (select min(changed_at) from public.deal_payment_history),
    'ledger_rows',       (select count(*) from public.deal_payment_history),

    -- Defterdeki TÜM para girişleri (işaretlenmiş olsun ya da olmasın)
    'inflow_total',      (select coalesce(sum(delta),0) from ev),
    'inflow_deals',      (select count(distinct deal_id) from ev),

    -- Gecikmişken + en az 1 hafta sonra + gerçek aksiyonla gelen tahsilat
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
    -- action_taken/action_by/action_at: bu ödemeyi "sistemin kazandırdığı"
    -- saymamıza neden olan somut kanıt (bkz. yukarıdaki attributed CTE'si).
    'top_events', (select coalesce(jsonb_agg(jsonb_build_object(
                     'deal_id', deal_id, 'delta', delta, 'amount', amount,
                     'new_paid', new_paid, 'team', team, 'owner', deal_owner,
                     'changed_at', changed_at, 'flagged_at', first_flag_at,
                     'days', round((extract(epoch from (changed_at - first_flag_at))/86400)::numeric, 1),
                     'action_taken', action_taken, 'action_by', action_by, 'action_at', action_at
                   ) order by delta desc), '[]'::jsonb)
                   from (select * from attributed order by delta desc limit 50) t)
  );
$$;

grant execute on function public.admin_payment_recovery(date, date, boolean) to anon, authenticated;

-- ============================================================
-- Doğrulama
-- ============================================================
-- select public.admin_payment_recovery();
-- Bir önceki sürüme göre recovered_total EŞİT YA DA DAHA KÜÇÜK olmalı
-- (kural yalnızca sıkılaştı).
--
-- Belirli bir deal'in neden sayılıp/sayılmadığını görmek için:
--   select a.id, a.deal_id, a.reference_date, a.created_at, a.status
--   from public.alarms a where a.deal_id = '<deal_id>';
--   select * from public.alarm_logs where alarm_id = '<yukarıdaki id>';
