-- ============================================================
-- Ödeme defterinden (deal_payment_history) Profclinic verisini çıkar
-- ============================================================
-- SORUN: Sistem Etkisi sayfasının ana rakamları (allDeals) zaten
-- team=neq.Profclinic ile temiz geliyordu, ama deal_payment_history
-- tablosunu dolduran trigger TÜM deals güncellemelerini team filtresi
-- olmadan yakalıyordu — Profclinic'in ödeme hareketleri deftere karışmış
-- ve admin_payment_recovery() bunları hiç ayıklamadan sayıyordu
-- (ledger_rows, inflow_total, by_team, top_events, günlük grafik — hepsi).
--
-- ÇÖZÜM: (1) deftere daha önce girmiş Profclinic satırlarını sil,
--        (2) trigger'ı Profclinic için bir daha hiç yazmayacak şekilde
--            güncelle. "Profclinic" değeri projede zaten kurulu bir
--            kural — bkz. admin.html DEALS_2026_Q: team=neq.Profclinic.
-- Supabase SQL Editor'e yapıştır, BİR KEZ çalıştır:
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================

-- 1) Deftere daha önce sızmış Profclinic satırlarını temizle
delete from public.deal_payment_history where team = 'Profclinic';

-- 2) Trigger fonksiyonunu güncelle: Profclinic için hiç yazma
create or replace function public.deals_log_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.team = 'Profclinic' then
    return NEW;
  end if;
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

-- ============================================================
-- Doğrulama
-- ============================================================
-- select count(*) from public.deal_payment_history where team = 'Profclinic';  -- 0 olmalı
-- select public.admin_payment_recovery();  -- rakamlar Profclinic'siz yeniden hesaplanır
