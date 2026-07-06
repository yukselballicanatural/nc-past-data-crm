// alarm-engine.js — Natural Clinic Alarm Motor v1.0
// Supabase deals tablosundan otomatik alarm üretir, alarms tablosuna yazar.
window.AlarmEngine = (function () {
  'use strict';

  // Eşik gün pencereleri — her aralık bir öncekinin hemen üstünden başlar
  const THRESHOLDS = [
    { t: 45, min: 31, max: 45 },
    { t: 30, min: 16, max: 30 },
    { t: 15, min: 8,  max: 15 },
    { t: 7,  min: 4,  max: 7  },
    { t: 3,  min: 1,  max: 3  },
  ];

  const ACTIVE_STAGES = [
    'Waiting appointment', 'Reservation Pending', 'Approval',
    'Appointment confirmed', 'Waiting next visit',
    'Waiting hotel confirmation', 'On Hold', 'Check in completed',
  ];
  const ACTIVE_SET = new Set(ACTIVE_STAGES);

  // Bir tarihe kaç gün kaldığını hesapla (negatif = geçmiş)
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const s = String(dateStr).split('T')[0];
    const d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  }

  // Epoch günü 3'e böl → eksik tarih alarmı her 3 günde bir yenilenir
  function threeDayBucket() {
    return Math.floor(Math.floor(Date.now() / 86400000) / 3);
  }

  // Takım adından bölge belirle
  function getRegion(team) {
    return (team || '').toLowerCase().includes('morocco') ? 'Morocco' : 'Istanbul';
  }

  // deal.raw alanını parse et
  function getRaw(deal) {
    const r = deal.raw;
    if (!r) return {};
    if (typeof r === 'string') { try { return JSON.parse(r); } catch (e) { return {}; } }
    return r;
  }

  const ACTIVE_SET_LOWER = new Set(ACTIVE_STAGES.map(s => s.toLowerCase().trim()));

  // Bir deal için üretilmesi gereken alarm listesini hesapla
  function computeAlarms(deal) {
    if (!ACTIVE_SET_LOWER.has((deal.stage || '').toLowerCase().trim())) return [];

    const raw = getRaw(deal);

    // Tüm tarih/ödeme alanları raw JSONB'den okunuyor (tablo kolonları yok)
    const pft          = raw.Payment_Or_Flight_Ticket || raw.payment_or_flight_ticket || null;
    const arrivalDate  = raw.Arrival_Date  || raw.arrival_date  || null;
    const lastActivity = raw.Last_Activity_Time || raw.last_activity_time || null;
    const v1 = raw.Visit_Date_1 || raw.visit_date_1 || null;
    const v2 = raw.Visit_Date_2 || raw.visit_date_2 || null;
    const v3 = raw.Visit_Date_3 || raw.visit_date_3 || null;

    const region = getRegion(deal.team);
    const base = {
      deal_id:                  String(deal.id),
      deal_name:                deal.deal_name  || '',
      deal_owner:               deal.deal_owner || '',
      team:                     deal.team       || '',
      region,
      payment_or_flight_ticket: pft,
      status:                   'open',
      assigned_to:              deal.team       || '',
    };

    const alarms    = [];
    const isPayment = pft === 'Payment';
    const isFlight  = pft === 'Flight Ticket';

    // ── Payment: Last Activity Time üzerinden takip ──────────────────
    if (isPayment && lastActivity) {
      const lastDate  = String(lastActivity).split('T')[0];
      const daysSince = -(daysUntil(lastDate) || 0);
      for (const { t, min, max } of THRESHOLDS) {
        if (daysSince >= min && daysSince <= max) {
          alarms.push({
            ...base,
            alarm_type:      'payment_tracking',
            reference_field: 'last_activity_time',
            reference_date:  lastDate,
            threshold_days:  t,
            days_remaining:  -daysSince,
            dedup_key:       `${deal.id}_last_activity_${t}_${lastDate}`,
          });
          break;
        }
      }
    }

    // ── Arrival + Visit tarihleri ────────────────────────────────────
    const dateFields = [];

    if (!isPayment) {
      if (arrivalDate) {
        dateFields.push({ field: 'arrival_date', date: arrivalDate });
      } else {
        // Arrival date eksik → 3 günde bir tekrar alarm
        alarms.push({
          ...base,
          alarm_type:      'arrival_missing',
          reference_field: 'arrival_date',
          reference_date:  null,
          threshold_days:  null,
          days_remaining:  null,
          dedup_key:       `${deal.id}_arrival_missing_${threeDayBucket()}`,
        });
      }
    }

    if (v1) dateFields.push({ field: 'visit_date_1', date: v1 });
    if (v2) dateFields.push({ field: 'visit_date_2', date: v2 });
    if (v3) dateFields.push({ field: 'visit_date_3', date: v3 });

    for (const { field, date } of dateFields) {
      const days    = daysUntil(date);
      if (days === null) continue;
      const dateStr = String(date).split('T')[0];
      const aType   = field === 'arrival_date' ? 'arrival_approaching' : 'visit_approaching';

      if (days === 0) {
        alarms.push({
          ...base,
          alarm_type:      'today_patient',
          reference_field: field,
          reference_date:  dateStr,
          threshold_days:  0,
          days_remaining:  0,
          dedup_key:       `${deal.id}_${field}_today_${dateStr}`,
        });
      } else if (days > 0) {
        for (const { t, min, max } of THRESHOLDS) {
          if (days >= min && days <= max) {
            alarms.push({
              ...base,
              alarm_type:      aType,
              reference_field: field,
              reference_date:  dateStr,
              threshold_days:  t,
              days_remaining:  days,
              dedup_key:       `${deal.id}_${field}_${t}_${dateStr}`,
            });
            break;
          }
        }
      }
    }

    return alarms;
  }

  // Supabase'den aktif dealleri çek
  async function fetchActiveDeals(BASE, KEY, teamFilter) {
    const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
    // encodeURIComponent ile tüm filtre değerini encode et — Supabase JS client da böyle yapar
    const stageParam = encodeURIComponent('in.(' + ACTIVE_STAGES.map(s => '"' + s + '"').join(',') + ')');
    let all = [], offset = 0;
    while (true) {
      let url = `${BASE}/rest/v1/deals?stage=${stageParam}` +
        `&select=id,deal_name,deal_owner,stage,team,raw` +
        `&limit=500&offset=${offset}`;
      if (teamFilter) url += `&team=eq.${encodeURIComponent(teamFilter)}`;
      const r = await fetch(url, { headers: H });
      if (!r.ok) {
        let detail = '';
        try { const j = await r.json(); detail = j.message || j.hint || ''; } catch(e) {}
        throw new Error(`Deals alınamadı: HTTP ${r.status}${detail ? ' — ' + detail : ''}`);
      }
      const batch = await r.json();
      if (!Array.isArray(batch) || !batch.length) break;
      all.push(...batch);
      if (batch.length < 500) break;
      offset += 500;
    }
    return all;
  }

  // Alarmları Supabase'e yaz — dedup_key UNIQUE constraint tekrarı engeller
  async function insertAlarms(BASE, KEY, list) {
    if (!list.length) return { inserted: 0, total: 0 };
    const H = {
      apikey:         KEY,
      Authorization:  'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer:         'return=minimal,resolution=ignore-duplicates',
    };
    let inserted = 0;
    for (let i = 0; i < list.length; i += 100) {
      const r = await fetch(`${BASE}/rest/v1/alarms?on_conflict=dedup_key`, {
        method: 'POST', headers: H,
        body:   JSON.stringify(list.slice(i, i + 100)),
      });
      if (r.ok) inserted += Math.min(100, list.length - i);
    }
    return { inserted, total: list.length };
  }

  // Arrival Date girilmiş deallerin açık arrival_missing alarmlarını kapat
  async function closeStaleArrivalMissing(BASE, KEY, deals) {
    // Arrival Date artık dolu olan deal ID'lerini topla
    const filledIds = [];
    for (const d of deals) {
      const raw = getRaw(d);
      const arrivalDate = raw.Arrival_Date || raw.arrival_date || null;
      if (arrivalDate) filledIds.push(String(d.id));
    }
    if (!filledIds.length) return 0;

    const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
    // Bu deallar için açık arrival_missing alarmları var mı?
    const idList = filledIds.slice(0, 200).join(','); // PostgREST IN limit
    const r = await fetch(
      `${BASE}/rest/v1/alarms?alarm_type=eq.arrival_missing&status=in.(open,seen,in_progress)&deal_id=in.(${idList})&select=id`,
      { headers: H }
    );
    if (!r.ok) return 0;
    const toClose = await r.json();
    if (!toClose.length) return 0;

    const now = new Date().toISOString();
    const PH  = { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
    let closed = 0;
    // Batch patch: tüm bu ID'leri tek seferde kapat
    const idListAlarms = toClose.map(a => a.id).join(',');
    const pr = await fetch(
      `${BASE}/rest/v1/alarms?id=in.(${idListAlarms})`,
      { method: 'PATCH', headers: PH,
        body: JSON.stringify({ status: 'closed', close_reason: 'date_added', closed_at: now, closed_by: 'system' }) }
    );
    if (pr.ok) closed = toClose.length;
    return closed;
  }

  // ── Ana çalıştırma ───────────────────────────────────────────────
  async function run(BASE, KEY, opts = {}) {
    const { teamFilter, onProgress } = opts;
    if (onProgress) onProgress('Aktif deallar alınıyor...');
    const deals = await fetchActiveDeals(BASE, KEY, teamFilter);
    if (onProgress) onProgress(`${deals.length} deal için alarm hesaplanıyor...`);
    const newAlarms = [];
    for (const deal of deals) newAlarms.push(...computeAlarms(deal));
    if (onProgress) onProgress(`${newAlarms.length} alarm kaydediliyor (dedup aktif)...`);
    const result = await insertAlarms(BASE, KEY, newAlarms);
    // Arrival Date artık dolu olan deallerin eksik tarih alarmlarını kapat
    if (onProgress) onProgress('Tarih girilen alarmlar kapatılıyor...');
    const closedCount = await closeStaleArrivalMissing(BASE, KEY, deals);
    return { deals: deals.length, generated: newAlarms.length, closed: closedCount, ...result };
  }

  return { run, computeAlarms, daysUntil, getRegion, ACTIVE_STAGES, closeStaleArrivalMissing };
})();
