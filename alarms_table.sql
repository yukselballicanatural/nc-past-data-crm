-- ============================================================
-- ALARMS TABLOSU - Natural Clinic Hasta Alarm Sistemi
-- Supabase SQL Editor'e yapıştır ve çalıştır
-- ============================================================

CREATE TABLE IF NOT EXISTS public.alarms (

    -- Kimlik
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Deal bilgileri (JOIN yapmadan hızlı okumak için)
    deal_id        text NOT NULL,
    deal_name      text,
    deal_owner     text,
    team           text,
    region         text,
    payment_or_flight_ticket text,

    -- Alarm tipi
    -- 'arrival_approaching' | 'visit_approaching' | 'arrival_missing'
    -- 'today_patient' | 'payment_tracking' | 'flight_ticket_tracking' | 'no_show'
    alarm_type     text NOT NULL,

    -- Hangi tarih alanından üretildi
    -- 'arrival_date' | 'visit_date_1' | 'visit_date_2' | 'visit_date_3' | 'last_activity_time'
    reference_field text,

    -- Alarm hesaplamasında kullanılan tarih
    reference_date  date,

    -- Eşik gün: 45 | 30 | 15 | 7 | 3 | NULL (eksik tarih / no-show için)
    threshold_days  integer,

    -- Alarm oluşturulduğunda kalan gün (bilgi amaçlı)
    days_remaining  integer,

    -- Durum
    -- 'open' | 'seen' | 'in_progress' | 'arrived' | 'examined'
    -- 'processing' | 'no_show' | 'closed' | 'escalated' | 'cancelled'
    status         text DEFAULT 'open' NOT NULL,

    -- Sorumlu Team Leader (username)
    assigned_to    text,

    -- TL'nin girdiği not
    note           text,

    -- Zaman damgaları
    created_at     timestamptz DEFAULT now() NOT NULL,
    seen_at        timestamptz,
    actioned_at    timestamptz,
    closed_at      timestamptz,
    closed_by      text,

    -- Kapatma sebebi
    -- 'completed' | 'no_show' | 'cancelled' | 'date_added' | 'manual'
    close_reason   text,

    -- Mükerrer alarm engelleme
    -- Format: {deal_id}_{reference_field}_{threshold_days}_{reference_date}
    -- Eksik tarih için: {deal_id}_arrival_missing (motor 3 günde bir kontrol eder)
    dedup_key      text UNIQUE
);

-- Row Level Security
ALTER TABLE public.alarms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access" ON public.alarms FOR ALL USING (true) WITH CHECK (true);

-- İndeksler (performans için)
CREATE INDEX IF NOT EXISTS alarms_deal_id_idx       ON public.alarms(deal_id);
CREATE INDEX IF NOT EXISTS alarms_status_idx         ON public.alarms(status);
CREATE INDEX IF NOT EXISTS alarms_team_idx           ON public.alarms(team);
CREATE INDEX IF NOT EXISTS alarms_alarm_type_idx     ON public.alarms(alarm_type);
CREATE INDEX IF NOT EXISTS alarms_reference_date_idx ON public.alarms(reference_date);
CREATE INDEX IF NOT EXISTS alarms_assigned_to_idx    ON public.alarms(assigned_to);
CREATE INDEX IF NOT EXISTS alarms_created_at_idx     ON public.alarms(created_at DESC);
