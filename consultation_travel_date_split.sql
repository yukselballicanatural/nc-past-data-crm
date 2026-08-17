-- ============================================================
-- deals.consultation_date + deals.estimated_travel_date — ayrı, indexli
-- ============================================================
-- NEDEN
-- Tarih filtreleri artık Consultation Date ve Estimated Travel Date için
-- İKİ BAĞIMSIZ kutu olarak sunuluyor (tek birleşik "Arrival" filtresi
-- yerine). İlk denemede bunu doğrudan raw JSONB üzerinden
-- (?raw->>Estimated_Travel_Date=gte.X) filtrelemeyi denedim — canlıda
-- test ettim ve deals tablosunda (49K+ satır, indexsiz JSONB alanı)
-- STATEMENT TIMEOUT'A (57014) düştü, özellikle Estimated_Travel_Date hiç
-- dolu olmadığı için her satırın raw'ını taramak zorunda kalıyordu.
--
-- ÇÖZÜM: consultation_reference_date.sql'deki AYNI desen — bu iki alanı da
-- gerçek, indexli kolonlara materialize et. Var olan trigger fonksiyonu
-- genişletiliyor (yeni trigger eklemek yerine) ki tek yerden yönetilsin.
--
-- Supabase SQL Editor'e yapıştır, BİR KEZ çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================

alter table public.deals add column if not exists consultation_date date;
alter table public.deals add column if not exists estimated_travel_date date;

create or replace function public.deals_set_consultation_ref_date()
returns trigger
language plpgsql
as $$
begin
  NEW.consultation_date := (NEW.raw->>'Consultation_Date')::date;
  NEW.estimated_travel_date := (NEW.raw->>'Estimated_Travel_Date')::date;
  NEW.consultation_ref_date := coalesce(NEW.consultation_date, NEW.estimated_travel_date);
  return NEW;
end;
$$;

-- Trigger zaten kurulu (consultation_reference_date.sql) — fonksiyon
-- güncellendiği için yeniden oluşturmaya gerek yok, ama garantiye almak
-- için tekrar tanımlanıyor.
drop trigger if exists trg_deals_set_consultation_ref_date on public.deals;
create trigger trg_deals_set_consultation_ref_date
  before insert or update on public.deals
  for each row execute function public.deals_set_consultation_ref_date();

-- Var olan tüm satırları geriye dönük doldur.
update public.deals
   set consultation_date = (raw->>'Consultation_Date')::date,
       estimated_travel_date = (raw->>'Estimated_Travel_Date')::date;

create index if not exists deals_consultation_date_idx on public.deals(consultation_date);
create index if not exists deals_estimated_travel_date_idx on public.deals(estimated_travel_date);

-- ============================================================
-- Doğrulama
-- ============================================================
-- select count(*) from public.deals where consultation_date is not null;
-- select count(*) from public.deals where estimated_travel_date is not null;
-- select id, consultation_date, estimated_travel_date, consultation_ref_date
--   from public.deals where id = '645008001106953102';
