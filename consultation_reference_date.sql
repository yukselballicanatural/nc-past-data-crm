-- ============================================================
-- deals.consultation_ref_date — Arrival Date'in yerini alan yeni referans
-- ============================================================
-- NEDEN
-- Takım liderlerinin ve agent'ların Zoho'da Arrival Date güncelleme yetkisi
-- yok — bu alan onların erişemediği bir ekipten (uçuş/karşılama) geliyor.
-- Sistem artık şu önceliği kullanıyor: Consultation_Date -> (boşsa)
-- Estimated_Travel_Date -> (o da boşsa) "tarih eksik" alarmı.
-- alarm-engine.js effectiveArrivalDate() bu önceliği zaten raw JSONB'den
-- canlı hesaplıyor (alarm üretimi için). Ama "Tüm Deallar" sayfalarındaki
-- tarih aralığı filtresi ve sıralama deals.arrival_date GERÇEK KOLONUNA
-- (hızlı, indexli) dayanıyor — Consultation_Date raw JSONB içinde olduğu
-- için aynı hızda filtrelenemez/sıralanamaz.
--
-- ÇÖZÜM: deals.arrival_date'in YANINA (onu SİLMEDEN — Zoho senkronu o
-- kolonu yazmaya devam ediyor, dokunursak senkron kırılır) yeni bir
-- materialized kolon: consultation_ref_date. Trigger ile raw JSONB
-- değiştikçe otomatik güncellenir, deal_payment_history ile AYNI desen
-- (bkz. deal_payment_history.sql).
--
-- Supabase SQL Editor'e yapıştır, BİR KEZ çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================

alter table public.deals add column if not exists consultation_ref_date date;

create or replace function public.deals_set_consultation_ref_date()
returns trigger
language plpgsql
as $$
begin
  NEW.consultation_ref_date := coalesce(
    (NEW.raw->>'Consultation_Date')::date,
    (NEW.raw->>'Estimated_Travel_Date')::date
  );
  return NEW;
end;
$$;

drop trigger if exists trg_deals_set_consultation_ref_date on public.deals;
create trigger trg_deals_set_consultation_ref_date
  before insert or update on public.deals
  for each row execute function public.deals_set_consultation_ref_date();

-- Var olan tüm satırları geriye dönük doldur (trigger sadece BUNDAN SONRAKİ
-- insert/update'lerde otomatik çalışır).
update public.deals
   set consultation_ref_date = coalesce(
     (raw->>'Consultation_Date')::date,
     (raw->>'Estimated_Travel_Date')::date
   );

create index if not exists deals_consultation_ref_date_idx on public.deals(consultation_ref_date);

-- ============================================================
-- Doğrulama
-- ============================================================
-- select count(*) from public.deals where consultation_ref_date is not null;
-- select id, arrival_date, consultation_ref_date, raw->>'Consultation_Date', raw->>'Estimated_Travel_Date'
--   from public.deals where id = '645008001106953102';
