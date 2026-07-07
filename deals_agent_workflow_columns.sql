-- ============================================================
-- DEALS TABLOSUNA AGENT SONUÇ TAKİBİ KOLONLARI
-- Supabase SQL Editor'e yapıştır ve çalıştır
-- Raw-Data tablosu artık hiçbir yerde kullanılmıyor — agent.html ve
-- admin.html'in sonuç kodu / kilit onay iş akışı deals tablosuna taşındı.
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS result_code text,
  ADD COLUMN IF NOT EXISTS sub_code text,
  ADD COLUMN IF NOT EXISTS agent_note text,
  ADD COLUMN IF NOT EXISTS deal_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS lock_approval_requested boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS deals_deal_owner_idx ON public.deals(deal_owner);
CREATE INDEX IF NOT EXISTS deals_deal_status_idx ON public.deals(deal_status);
