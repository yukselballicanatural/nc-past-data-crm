-- ============================================================
-- Faz 2 (Clinic Planning Reminder/Escalation) — CLINIC_PLANNING_ROADMAP.md
-- Supabase SQL Editor'de çalıştır (test/clinic-planning branch içindir,
-- main'e alınmadan ÖNCE de güvenle çalıştırılabilir — yalnızca yeni bir
-- kolon ekliyor, mevcut hiçbir satırı bozmuyor):
--   https://supabase.com/dashboard/project/aztxfncqanrodbttywrb/sql
-- ============================================================
--
-- escalation_level: 0 = yok, 1 = Hatırlatma (>24s açık), 2 = Takım Lideri
-- Eskalasyonu (>48s açık), 3 = Yönetim Eskalasyonu (>72s açık). Yalnızca
-- Faz 1'in 7 Clinic Planning alarm tipi için kullanılıyor (alarm-engine.js
-- escalateClinicPlanningAlarms) — genel alarm tiplerine dokunmuyor.
--
-- Eşik süreleri (saat) app_settings'te configurable, mevcut
-- 'alarm_thresholds' desenin AYNISI:
--   key='clinic_planning_escalation_hours', value='24,48,72'
-- Satır yoksa/tablo yoksa motor varsayılan 24,48,72 ile çalışır.

alter table public.alarms
  add column if not exists escalation_level smallint not null default 0;

comment on column public.alarms.escalation_level is
  'Faz 2 Clinic Planning otomatik eskalasyonu: 0=yok, 1=Hatırlatma, 2=TL Eskalasyonu, 3=Yönetim Eskalasyonu';

-- app_settings tablosu zaten varsa (alarm_thresholds.sql'den) bu satır
-- eşiği ayarlar; yoksa motor varsayılana düşer, hata vermez.
insert into public.app_settings (key, value)
values ('clinic_planning_escalation_hours', '24,48,72')
on conflict (key) do nothing;

-- ============================================================
-- Doğrulama
-- ============================================================
-- select column_name from information_schema.columns
-- where table_name = 'alarms' and column_name = 'escalation_level';
