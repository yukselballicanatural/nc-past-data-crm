-- ============================================================
-- ALARM AKSİYON LOGU + SİSTEM PARAMETRELERİ
-- Supabase SQL Editor'e yapıştır ve çalıştır
-- (PDF Bölüm 13: Loglama, Bölüm 17: Parametreler)
-- ============================================================

-- 1. Alarm Aksiyon Log Tablosu — her alarm aksiyonunun izi
CREATE TABLE IF NOT EXISTS public.alarm_logs (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    alarm_id    uuid NOT NULL,
    deal_id     text,
    action_type text NOT NULL,   -- 'status_change' | 'note' | 'closed' | 'reopened' | 'created'
    old_status  text,
    new_status  text,
    note        text,
    action_by   text,            -- işlemi yapan kullanıcı
    action_role text,            -- team-leader | regional-manager | admin
    created_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.alarm_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access" ON public.alarm_logs FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS alarm_logs_alarm_id_idx   ON public.alarm_logs(alarm_id);
CREATE INDEX IF NOT EXISTS alarm_logs_created_at_idx ON public.alarm_logs(created_at DESC);

-- 2. Sistem Parametreleri — alarm eşikleri vb. admin tarafından yönetilir
CREATE TABLE IF NOT EXISTS public.app_settings (
    key        text PRIMARY KEY,
    value      text NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    updated_by text
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- Varsayılan parametreler
INSERT INTO public.app_settings (key, value) VALUES
  ('alarm_thresholds', '45,30,15,7,3'),
  ('missing_repeat_days', '3')
ON CONFLICT (key) DO NOTHING;
