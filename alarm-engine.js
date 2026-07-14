// alarm-engine.js — Natural Clinic Alarm Motor v1.0
// Supabase deals tablosundan otomatik alarm üretir, alarms tablosuna yazar.
window.AlarmEngine = (function () {
  'use strict';

  // Eşik gün pencereleri — her aralık bir öncekinin hemen üstünden başlar
  // Eşik listesi app_settings.alarm_thresholds parametresinden gelir (varsayılan 45,30,15,7,3)
  function buildThresholds(list) {
    const sorted = [...new Set(list)].filter(n => n > 0).sort((a, b) => b - a);
    return sorted.map((t, i) => ({
      t,
      min: (sorted[i + 1] || 0) + 1,
      max: t,
    }));
  }

  let THRESHOLDS = buildThresholds([45, 30, 15, 7, 3]);
  let MISSING_REPEAT_DAYS = 3;

  // app_settings tablosundan parametreleri yükle — tablo yoksa varsayılanlar kalır
  async function loadSettings(BASE, KEY) {
    try {
      const r = await fetch(`${BASE}/rest/v1/app_settings?select=key,value`, {
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
      });
      if (!r.ok) return;
      const rows = await r.json();
      for (const row of rows) {
        if (row.key === 'alarm_thresholds') {
          const nums = String(row.value).split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
          if (nums.length) THRESHOLDS = buildThresholds(nums);
        }
        if (row.key === 'missing_repeat_days') {
          const n = parseInt(row.value);
          if (!isNaN(n) && n > 0) MISSING_REPEAT_DAYS = n;
        }
      }
    } catch (e) { /* tablo henüz oluşturulmamış olabilir — varsayılanlarla devam */ }
  }

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

  // Epoch gününü periyoda böl → eksik tarih alarmı her N günde bir yenilenir
  function threeDayBucket() {
    return Math.floor(Math.floor(Date.now() / 86400000) / MISSING_REPEAT_DAYS);
  }

  // Takım adından bölge belirle — TeamMap varsa onu kullan
  function getRegion(team) {
    if (typeof window !== 'undefined' && window.TeamMap) return window.TeamMap.regionForTeam(team);
    return (team || '').toLowerCase().includes('morocco') ? 'Morocco' : 'Istanbul';
  }

  // deals.team varyantını kanonik takım adına çevir (TL panelindeki filtrelerle eşleşsin)
  function canonicalTeam(team) {
    if (typeof window !== 'undefined' && window.TeamMap) {
      return window.TeamMap.normalize(team) || team || '';
    }
    return team || '';
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
    // Zoho alan adları: Visit_Date = 1. vizit, Visit_Date1 = 2. vizit, Visit_Date2 = 3. vizit
    const pft          = raw.Payment_Or_Flight_Ticket || raw.payment_or_flight_ticket || null;
    const arrivalDate  = raw.Arrival_Date  || raw.arrival_date  || null;
    const lastActivity = raw.Last_Activity_Time || raw.last_activity_time || null;
    const v1 = raw.Visit_Date  || raw.Visit_Date_1 || null;
    const v2 = raw.Visit_Date1 || raw.Visit_Date_2 || null;
    const v3 = raw.Visit_Date2 || raw.Visit_Date_3 || null;

    const team   = canonicalTeam(deal.team);
    const region = getRegion(deal.team);
    const base = {
      deal_id:                  String(deal.id),
      deal_name:                deal.deal_name  || '',
      deal_owner:               deal.deal_owner || '',
      team,
      region,
      payment_or_flight_ticket: pft,
      status:                   'open',
      assigned_to:              team,
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
            // dedup_key'e ESIK (t) DAHIL EDILMEZ: aksi halde hasta eşikten
            // eşiğe (15g→7g→3g) geçtikçe her seferinde YENI bir alarm satırı
            // oluşup eskiler kapanmadan birikiyordu (tek hasta = 4 alarm).
            // Eşiği çıkarınca on_conflict=dedup_key aynı satırı bulur; upsert
            // merge-duplicates ile threshold/days_remaining güncellenir.
            dedup_key:       `${deal.id}_last_activity_${lastDate}`,
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
          // "Yaklaşıyor" (days>0) alarmıyla AYNI dedup_key kullanılır — aksi
          // halde hasta günü geldiğinde eski "Xg yaklaşıyor" alarmı kapanmadan
          // yeni bir "Bugün" alarmı daha açılıyor, aynı hasta için 2 kart
          // birden görünüyordu (bkz. ekran görüntüsü şikayeti).
          dedup_key:       `${deal.id}_${field}_${dateStr}`,
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
              // Eşik (t) dedup_key'e DAHIL EDILMEZ — bkz. yukarıdaki açıklama.
              // Her hasta/tarih için tek alarm; hasta yaklaştıkça güncellenir.
              dedup_key:       `${deal.id}_${field}_${dateStr}`,
            });
            break;
          }
        }
      }
    }

    return alarms;
  }

  // Supabase'den TÜM aktif dealleri çek — takım filtresi YOK, motor global çalışır
  async function fetchActiveDeals(BASE, KEY) {
    const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
    // encodeURIComponent ile tüm filtre değerini encode et — Supabase JS client da böyle yapar
    const stageParam = encodeURIComponent('in.(' + ACTIVE_STAGES.map(s => '"' + s + '"').join(',') + ')');
    let all = [], offset = 0;
    while (true) {
      const url = `${BASE}/rest/v1/deals?stage=${stageParam}` +
        `&select=id,deal_name,deal_owner,stage,team,raw` +
        `&limit=500&offset=${offset}`;
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

    const H   = { apikey: KEY, Authorization: 'Bearer ' + KEY };
    const now = new Date().toISOString();
    const PH  = { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
    let closed = 0;

    // URL uzunluğu sınırı nedeniyle 200'lük gruplar halinde işle
    for (let i = 0; i < filledIds.length; i += 200) {
      const idList = filledIds.slice(i, i + 200).join(',');
      const r = await fetch(
        `${BASE}/rest/v1/alarms?alarm_type=eq.arrival_missing&status=in.(open,seen,in_progress)&deal_id=in.(${idList})&select=id`,
        { headers: H }
      );
      if (!r.ok) continue;
      const toClose = await r.json();
      if (!toClose.length) continue;

      const idListAlarms = toClose.map(a => a.id).join(',');
      const pr = await fetch(
        `${BASE}/rest/v1/alarms?id=in.(${idListAlarms})`,
        { method: 'PATCH', headers: PH,
          body: JSON.stringify({ status: 'closed', close_reason: 'date_added', closed_at: now, closed_by: 'system' }) }
      );
      if (pr.ok) closed += toClose.length;
    }
    return closed;
  }

  // Stage'i "Cancelled" (veya iptal anlamına gelen bir varyant) olan deallerin
  // hâlâ açık kalmış alarmlarını iptal et — deal iptal olunca alarm da iptal sayılır
  async function closeAlarmsForCancelledDeals(BASE, KEY) {
    const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
    const stageParam = encodeURIComponent('ilike.*cancel*');
    let dealIds = [], offset = 0;
    while (true) {
      const url = `${BASE}/rest/v1/deals?stage=${stageParam}&select=id&limit=1000&offset=${offset}`;
      const r = await fetch(url, { headers: H });
      if (!r.ok) break;
      const batch = await r.json();
      if (!Array.isArray(batch) || !batch.length) break;
      dealIds.push(...batch.map(d => String(d.id)));
      if (batch.length < 1000) break;
      offset += 1000;
    }
    if (!dealIds.length) return 0;

    const now = new Date().toISOString();
    const PH  = { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
    let cancelled = 0;

    for (let i = 0; i < dealIds.length; i += 200) {
      const idList = dealIds.slice(i, i + 200).join(',');
      const r = await fetch(
        `${BASE}/rest/v1/alarms?status=in.(open,seen,in_progress,escalated,arrived,examined,processing)&deal_id=in.(${idList})&select=id`,
        { headers: H }
      );
      if (!r.ok) continue;
      const toCancel = await r.json();
      if (!toCancel.length) continue;

      const idListAlarms = toCancel.map(a => a.id).join(',');
      const pr = await fetch(
        `${BASE}/rest/v1/alarms?id=in.(${idListAlarms})`,
        { method: 'PATCH', headers: PH,
          body: JSON.stringify({ status: 'cancelled', close_reason: 'deal_cancelled', closed_at: now, closed_by: 'system' }) }
      );
      if (pr.ok) cancelled += toCancel.length;
    }
    return cancelled;
  }

  // ── Ana çalıştırma — her zaman TÜM takımlar için üretir ─────────
  const _t = (s) => (typeof I18N !== 'undefined' ? I18N.t(s) : s);
  async function run(BASE, KEY, opts = {}) {
    const { onProgress } = opts;
    if (onProgress) onProgress(_t('Parametreler yükleniyor...'));
    await loadSettings(BASE, KEY);
    if (onProgress) onProgress(_t('Aktif deallar alınıyor...'));
    const deals = await fetchActiveDeals(BASE, KEY);
    if (onProgress) onProgress(`${deals.length} ${_t('deal için alarm hesaplanıyor...')}`);
    const newAlarms = [];
    for (const deal of deals) newAlarms.push(...computeAlarms(deal));
    if (onProgress) onProgress(`${newAlarms.length} ${_t('alarm kaydediliyor (dedup aktif)...')}`);
    const result = await insertAlarms(BASE, KEY, newAlarms);
    // Arrival Date artık dolu olan deallerin eksik tarih alarmlarını kapat
    if (onProgress) onProgress(_t('Tarih girilen alarmlar kapatılıyor...'));
    const closedCount = await closeStaleArrivalMissing(BASE, KEY, deals);
    // Stage'i Cancelled olan deallerin açık kalan alarmlarını iptal et
    if (onProgress) onProgress(_t('İptal olan dealler için alarmlar kapatılıyor...'));
    const cancelledCount = await closeAlarmsForCancelledDeals(BASE, KEY);
    return { deals: deals.length, generated: newAlarms.length, closed: closedCount, cancelled: cancelledCount, ...result };
  }

  return { run, computeAlarms, daysUntil, getRegion, ACTIVE_STAGES, closeStaleArrivalMissing, closeAlarmsForCancelledDeals };
})();
