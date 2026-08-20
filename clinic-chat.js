// clinic-chat.js — Faz 3: deal bazlı Clinic sohbeti
// (CLINIC_PLANNING_ROADMAP.md · şema: clinic_messages.sql · stil: clinic-chat.css)
//
// NEDEN VAR
// Takım liderleri bir deal'de düzeltme gerektiğinde ekran görüntüsü alıp
// Zoho'daki deal'in "Notes" alanına yapıştırıp sohbeti ORADA yürütüyorlardı.
// Artık her deal'in kendi sohbet dizisi bizim sistemimizde.
//
// MUHATAP: rol seçimi YOK. Karşı taraf, Zoho'nun deal üzerindeki
// `Aftercare_Owner` alanından ({id, name}) otomatik okunuyor — canlı veride
// doğrulandı (2026-08-20). Alan boşsa sohbet yine açılır ama "Aftercare
// sorumlusu atanmamış" uyarısı gösterilir (mesaj kaybolmaz, sorumlu
// atandığında dizide durur).
//
// ÜÇ BİLEŞEN
//   renderDock()       alarm penceresindeki "Clinic'e Bildir" dock'u —
//                      composer YUKARI doğru, aynı kartın içinde açılır.
//   openThread()       deal penceresindeki ikondan açılan sohbet penceresi.
//   renderBell()       menüdeki bildirim çanı; paneli yukarı açılır.
//
// GÖRSEL EKLERİ: mevcut NCAttach (attach-util.js + api/alarm-files.js)
// yeniden kullanılıyor. O API dosyaları bir KİMLİK DİZESİNE göre saklıyor
// (safeId = /^[A-Za-z0-9_-]{1,64}$/), alarm id'si olmak zorunda değil —
// depoda deal id'siyle de çağrılan yerler zaten var. Burada MESAJ BAŞINA
// ayrı klasör gerektiği için (bir sohbette çok mesaj, her birinin kendi
// görselleri) mesajın uuid'si İSTEMCİDE üretilip hem ek klasörü hem de
// clinic_messages.id olarak kullanılıyor — böylece geçmişi çizerken her
// baloncuk yalnızca KENDİ eklerini yükler.
window.NCClinicChat = (function () {
  'use strict';

  let BASE = '', KEY = '';
  let _user = null;                 // { username, fullName, role, team }
  let _notify = (m) => alert(m);
  let _t = (s) => s;
  let _teamAliases = null;          // string[] | null (null = takım filtresi yok)

  const MAX_LEN = 1000;

  function init(opts) {
    opts = opts || {};
    if (opts.baseUrl) BASE = opts.baseUrl;
    if (opts.anonKey) KEY = opts.anonKey;
    if (opts.user) _user = opts.user;
    if (opts.notify) _notify = opts.notify;
    if (opts.t) _t = opts.t;
    if (Array.isArray(opts.teamAliases)) _teamAliases = opts.teamAliases;
    _ensureThreadModal();
  }

  function _h() { return { apikey: KEY, Authorization: 'Bearer ' + KEY }; }
  function _hj() { return { ..._h(), 'Content-Type': 'application/json' }; }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function attr(v) { return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

  // Zoho adından baş harfler — avatar için ("Mohammad Azzam" → "MA").
  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2);
    return (parts[0][0] || '') + (parts[parts.length - 1][0] || '');
  }

  function uuid() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    // Yedek: crypto.randomUUID yalnızca güvenli bağlamda var.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
    });
  }

  function timeShort(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return _t('şimdi');
    if (diffMin < 60) return diffMin + _t('dk');
    if (diffMin < 1440) return Math.floor(diffMin / 60) + _t('sa');
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  }
  function timeFull(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  function isMine(m) {
    return String(m.sent_by_username || '') === String((_user && _user.username) || '\u0000');
  }

  // ── Aftercare Owner — deal.raw'dan, deal başına bir kez ────────────────
  // Alarm penceresinde elimizde yalnızca alarm satırı var (alarms tablosunda
  // raw YOK), bu yüzden deal'in raw'ı istendiğinde tek satırlık hafif bir
  // sorguyla çekilip önbelleğe alınıyor.
  const _ownerCache = new Map();    // dealId → { id, name } | null

  async function aftercareOwner(dealId) {
    const k = String(dealId || '');
    if (!k) return null;
    if (_ownerCache.has(k)) return _ownerCache.get(k);
    let out = null;
    try {
      const r = await fetch(`${BASE}/rest/v1/deals?id=eq.${encodeURIComponent(k)}&select=raw&limit=1`, { headers: _h() });
      if (r.ok) {
        const rows = await r.json();
        const raw0 = Array.isArray(rows) && rows[0] ? rows[0].raw : null;
        const raw = typeof raw0 === 'string' ? (() => { try { return JSON.parse(raw0); } catch (e) { return {}; } })() : (raw0 || {});
        const ao = raw.Aftercare_Owner || raw.aftercare_owner || null;
        if (ao && typeof ao === 'object' && ao.name) out = { id: ao.id || '', name: ao.name };
        else if (typeof ao === 'string' && ao.trim()) out = { id: '', name: ao.trim() };
      }
    } catch (e) { /* sessiz — sohbet yine açılır, muhatap "atanmamış" görünür */ }
    _ownerCache.set(k, out);
    return out;
  }

  // ── Mesaj yazma (tek yol) ─────────────────────────────────────────────
  async function _insert(ctx, text, msgId, attachCount) {
    const owner = await aftercareOwner(ctx.dealId);
    const row = {
      id:               msgId,
      deal_id:          String(ctx.dealId),
      deal_name:        ctx.dealName || '',
      deal_team:        ctx.team || '',
      sent_by_username: (_user && _user.username) || '',
      sent_by_name:     (_user && _user.fullName) || '',
      sent_by_role:     (_user && _user.role) || '',
      sent_to_id:       owner ? owner.id : '',
      sent_to_name:     owner ? owner.name : '',
      sent_to_role:     'Aftercare Owner',
      message:          text,
      attachment_count: attachCount || 0,
      related_alarm_id: ctx.alarmId || null,
    };
    const r = await fetch(`${BASE}/rest/v1/clinic_messages`, {
      method: 'POST', headers: { ..._hj(), Prefer: 'return=minimal' }, body: JSON.stringify(row),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      if (/does not exist|PGRST205|schema cache/i.test(body)) {
        throw new Error(_t('clinic_messages tablosu henüz kurulmamış — clinic_messages.sql dosyasını çalıştırın.'));
      }
      throw new Error('HTTP ' + r.status);
    }
  }

  // Mesaja bağlı ek sayısı — sunucudan (DOM önizlemesine güvenmiyoruz,
  // yükleme sessizce başarısız olabilir; bkz. NCAttach.hasFiles notu).
  async function _attachCount(msgId) {
    try {
      if (!window.NCAttach) return 0;
      const fetchFn = window.NCNet ? NCNet.fetch : fetch;
      const tok = (_user && _user.token) || '';
      const r = await fetchFn(`/api/alarm-files?alarm_id=${encodeURIComponent(msgId)}`, {
        headers: { Authorization: 'Bearer ' + tok },
      });
      const d = await r.json().catch(() => ({}));
      return Array.isArray(d.files) ? d.files.length : 0;
    } catch (e) { return 0; }
  }

  /* ═══════════════════════ 1. DOCK ═══════════════════════ */
  // Alarm penceresine gömülür. Kapalıyken tek satır kimlik çubuğu; "Sohbet"e
  // basınca composer AYNI kartın içinde, çubuğun ÜSTÜNDE açılır.
  let _dock = null;   // { mountId, dealId, dealName, team, alarmId, draftId, open }

  function renderDock(mountId, ctx) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    _dock = {
      mountId,
      dealId:   String(ctx.dealId || ''),
      dealName: ctx.dealName || '',
      team:     ctx.team || '',
      alarmId:  ctx.alarmId || null,
      draftId:  uuid(),
      open:     false,
    };
    mount.innerHTML = `
      <div class="ncc-dock">
        <div class="ncc-dock-composer" id="nccDockComposer" data-open="false">
          <div class="ncc-dock-composer-inner">
            <textarea id="nccDockInput" maxlength="${MAX_LEN}"
              placeholder="${esc(_t('Aftercare sorumlusuna iletilecek mesaj... (görsel için Ctrl+V ile yapıştırabilirsiniz)'))}"></textarea>
            <button type="button" class="ncc-composer-x" onclick="NCClinicChat.closeComposer()"
              aria-label="${esc(_t('Kapat'))}">&times;</button>
          </div>
          <div class="ncc-composer-foot">
            <span id="nccDockAttachSlot"></span>
            <span class="ncc-composer-count" id="nccDockCount">0 / ${MAX_LEN}</span>
          </div>
        </div>
        <div class="ncc-dock-bar">
          <div class="ncc-avatar" id="nccDockAvatar" data-empty="true">?</div>
          <div class="ncc-dock-id">
            <p class="ncc-dock-name" id="nccDockName">${esc(_t('Yükleniyor...'))}</p>
            <p class="ncc-dock-status" id="nccDockStatus" data-empty="true">${esc(_t('Aftercare sorumlusu'))}</p>
          </div>
          <div class="ncc-dock-actions">
            <button type="button" class="ncc-dock-btn" onclick="NCClinicChat.openThreadFromDock()"
              title="${esc(_t('Sohbet geçmişi'))}">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h8M8 8h8m-8 8h5m7-4c0 4.418-4.03 8-9 8a9.8 9.8 0 01-4.15-.9L3 20l1.05-3.16A7.7 7.7 0 013 13c0-4.418 4.03-8 9-8s9 3.582 9 7z"/></svg>
              <span class="ncc-btn-label">${esc(_t('Geçmiş'))}</span>
            </button>
            <button type="button" class="ncc-dock-btn primary" id="nccDockGo" onclick="NCClinicChat.dockAction()">
              <svg id="nccDockGoIcon" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>
              <span class="ncc-btn-label" id="nccDockGoLabel">${esc(_t('Clinic\'e Bildir'))}</span>
            </button>
          </div>
        </div>
      </div>`;

    const input = document.getElementById('nccDockInput');
    if (input) {
      input.addEventListener('input', () => {
        const c = document.getElementById('nccDockCount');
        if (c) c.textContent = input.value.length + ' / ' + MAX_LEN;
      });
      // Enter gönderir, Shift+Enter yeni satır (agent-dock davranışı).
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); dockAction(); }
      });
    }
    _paintDockIdentity();
  }

  async function _paintDockIdentity() {
    if (!_dock) return;
    const owner = await aftercareOwner(_dock.dealId);
    if (!_dock) return;
    const av = document.getElementById('nccDockAvatar');
    const nm = document.getElementById('nccDockName');
    const st = document.getElementById('nccDockStatus');
    if (!av || !nm || !st) return;
    if (owner && owner.name) {
      av.textContent = initials(owner.name); av.dataset.empty = 'false';
      nm.textContent = owner.name;
      st.textContent = _t('Aftercare sorumlusu'); st.dataset.empty = 'false';
    } else {
      av.textContent = '?'; av.dataset.empty = 'true';
      nm.textContent = _t('Aftercare sorumlusu atanmamış');
      st.textContent = _t('Zoho\'da Aftercare Owner boş'); st.dataset.empty = 'true';
    }
  }

  function openComposer() {
    if (!_dock) return;
    _dock.open = true;
    const c = document.getElementById('nccDockComposer');
    if (c) c.dataset.open = 'true';
    const lbl = document.getElementById('nccDockGoLabel');
    if (lbl) lbl.textContent = _t('Gönder');
    const icon = document.getElementById('nccDockGoIcon');
    if (icon) icon.innerHTML = '<path d="M3.4 20.6l17.45-8.4a.6.6 0 000-1.08L3.4 2.72a.6.6 0 00-.85.66l1.7 6.8L14 12l-9.75 1.82-1.7 6.8a.6.6 0 00.85.66z"/>';
    // Ek widget'ı ilk açılışta bir kez basılır — mesaj başına ayrı klasör
    // (draftId) kullanıldığı için gönderimden sonra yenilenir.
    _mountDockAttach();
    const input = document.getElementById('nccDockInput');
    if (input) requestAnimationFrame(() => input.focus());
  }

  function closeComposer() {
    if (!_dock) return;
    _dock.open = false;
    const c = document.getElementById('nccDockComposer');
    if (c) c.dataset.open = 'false';
    const lbl = document.getElementById('nccDockGoLabel');
    if (lbl) lbl.textContent = _t('Clinic\'e Bildir');
    const icon = document.getElementById('nccDockGoIcon');
    if (icon) icon.innerHTML = '<path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/>';
  }

  function _mountDockAttach() {
    if (!_dock || !window.NCAttach) return;
    const slot = document.getElementById('nccDockAttachSlot');
    if (!slot) return;
    slot.innerHTML = NCAttach.renderWidget(`'${attr(_dock.draftId)}'`, 'nccDockFile', 'nccDockAttachMount');
    NCAttach.load(_dock.draftId, 'nccDockAttachMount');
    NCAttach.bindPaste('nccDockInput', _dock.draftId, 'nccDockAttachMount');
  }

  // Tek düğme iki iş yapar: kapalıyken composer'ı açar, açıkken gönderir.
  function dockAction() {
    if (!_dock) return;
    if (!_dock.open) { openComposer(); return; }
    _sendFromDock();
  }

  async function _sendFromDock() {
    if (!_dock) return;
    const input = document.getElementById('nccDockInput');
    const btn = document.getElementById('nccDockGo');
    const text = input ? input.value.trim() : '';
    const msgId = _dock.draftId;
    const nAttach = await _attachCount(msgId);
    if (!text && !nAttach) { _notify(_t('Mesaj boş olamaz.')); return; }
    if (btn) btn.disabled = true;
    try {
      await _insert(_dock, text, msgId, nAttach);
      if (input) input.value = '';
      const c = document.getElementById('nccDockCount');
      if (c) c.textContent = '0 / ' + MAX_LEN;
      // Sonraki mesaj için YENİ klasör — aksi halde eski görseller yeni
      // mesaja da bağlı görünürdü (NCAttach klasör başına en fazla 6 dosya).
      _dock.draftId = uuid();
      closeComposer();
      _notify(_t('Clinic\'e iletildi.'), 'success');
      if (_thread && _thread.dealId === _dock.dealId) _loadThread();
      refreshBell();
    } catch (e) {
      _notify(_t('Gönderilemedi: ') + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function openThreadFromDock() {
    if (!_dock) return;
    openThread({ dealId: _dock.dealId, dealName: _dock.dealName, team: _dock.team, alarmId: _dock.alarmId });
  }

  /* ═══════════════════════ 2. SOHBET PENCERESİ ═══════════════════════ */
  let _thread = null;   // { dealId, dealName, team, alarmId, draftId }

  function _ensureThreadModal() {
    if (document.getElementById('nccThreadModal')) return;
    const el = document.createElement('div');
    el.id = 'nccThreadModal';
    el.className = 'ncc-thread-modal';
    el.innerHTML = `
      <div class="ncc-thread-bg" onclick="NCClinicChat.closeThread()"></div>
      <div class="ncc-thread-box">
        <div class="ncc-thread-head">
          <div class="ncc-avatar" id="nccThreadAvatar" data-empty="true">?</div>
          <div class="ncc-thread-head-id">
            <p class="ncc-thread-title" id="nccThreadTitle">—</p>
            <p class="ncc-thread-sub" id="nccThreadSub">—</p>
          </div>
          <button type="button" class="ncc-thread-x" onclick="NCClinicChat.closeThread()" aria-label="Kapat">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="ncc-thread-body" id="nccThreadBody"></div>
        <div class="ncc-thread-foot">
          <div id="nccThreadWarnSlot"></div>
          <div class="ncc-thread-foot-row">
            <textarea id="nccThreadInput" maxlength="${MAX_LEN}" rows="1"
              placeholder="${esc(_t('Mesaj yaz...'))}"></textarea>
            <button type="button" class="ncc-send-btn" id="nccThreadSend" onclick="NCClinicChat.sendFromThread()"
              title="${esc(_t('Gönder'))}">
              <svg fill="currentColor" viewBox="0 0 24 24"><path d="M3.4 20.6l17.45-8.4a.6.6 0 000-1.08L3.4 2.72a.6.6 0 00-.85.66l1.7 6.8L14 12l-9.75 1.82-1.7 6.8a.6.6 0 00.85.66z"/></svg>
            </button>
          </div>
          <div id="nccThreadAttachSlot"></div>
        </div>
      </div>`;
    document.body.appendChild(el);

    const input = document.getElementById('nccThreadInput');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFromThread(); }
      });
      // Otomatik yükseklik — tek satırdan başlar, uzadıkça büyür.
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 110) + 'px';
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _thread) closeThread();
    });
  }

  function openThread(ctx) {
    _ensureThreadModal();
    _thread = {
      dealId:   String(ctx.dealId || ''),
      dealName: ctx.dealName || '',
      team:     ctx.team || '',
      alarmId:  ctx.alarmId || null,
      draftId:  uuid(),
    };
    document.getElementById('nccThreadTitle').textContent = _thread.dealName || _t('Deal');
    document.getElementById('nccThreadSub').textContent = _t('Yükleniyor...');
    document.getElementById('nccThreadBody').innerHTML = '';
    document.getElementById('nccThreadModal').classList.add('open');
    // Alarm penceresi de açıksa onun overflow kilidini BOZMA — kapanışta
    // geri verilecek değer zaten '' (bkz. closeThread).
    document.body.style.overflow = 'hidden';
    const slot = document.getElementById('nccThreadAttachSlot');
    if (slot && window.NCAttach) {
      slot.innerHTML = NCAttach.renderWidget(`'${attr(_thread.draftId)}'`, 'nccThreadFile', 'nccThreadAttachMount');
      NCAttach.load(_thread.draftId, 'nccThreadAttachMount');
      NCAttach.bindPaste('nccThreadInput', _thread.draftId, 'nccThreadAttachMount');
    }
    _paintThreadIdentity();
    _loadThread();
  }

  async function _paintThreadIdentity() {
    if (!_thread) return;
    const owner = await aftercareOwner(_thread.dealId);
    if (!_thread) return;
    const av = document.getElementById('nccThreadAvatar');
    const sub = document.getElementById('nccThreadSub');
    const warn = document.getElementById('nccThreadWarnSlot');
    if (owner && owner.name) {
      if (av) { av.textContent = initials(owner.name); av.dataset.empty = 'false'; }
      if (sub) sub.textContent = owner.name + ' · ' + _t('Aftercare sorumlusu');
      if (warn) warn.innerHTML = '';
    } else {
      if (av) { av.textContent = '?'; av.dataset.empty = 'true'; }
      if (sub) sub.textContent = _t('Aftercare sorumlusu atanmamış');
      if (warn) {
        warn.innerHTML = `<div class="ncc-thread-warn">${esc(_t('Bu deal\'de Zoho\'daki Aftercare Owner alanı boş. Mesajınız kaydedilir ve sorumlu atandığında dizide görünür.'))}</div>`;
      }
    }
  }

  function closeThread() {
    const el = document.getElementById('nccThreadModal');
    if (el) el.classList.remove('open');
    _thread = null;
    // Alarm penceresi hâlâ açıksa kilidi koru — yoksa arka plan kayardı.
    const alarmOpen = document.getElementById('alarmModal');
    const dealOpen = document.getElementById('dealModal');
    const stillOpen = (alarmOpen && alarmOpen.classList.contains('open')) ||
                      (dealOpen && dealOpen.classList.contains('open'));
    document.body.style.overflow = stillOpen ? 'hidden' : '';
  }

  async function _loadThread() {
    if (!_thread) return;
    const body = document.getElementById('nccThreadBody');
    try {
      const r = await fetch(
        `${BASE}/rest/v1/clinic_messages?deal_id=eq.${encodeURIComponent(_thread.dealId)}` +
        `&order=created_at.asc&limit=200`, { headers: _h() });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        body.innerHTML = `<div class="ncc-thread-empty">${esc(
          /does not exist|PGRST205|schema cache/i.test(txt)
            ? _t('clinic_messages tablosu henüz kurulmamış — clinic_messages.sql dosyasını çalıştırın.')
            : _t('Mesajlar yüklenemedi.'))}</div>`;
        return;
      }
      const rows = await r.json();
      _renderThread(Array.isArray(rows) ? rows : []);
      _markRead(_thread.dealId);
    } catch (e) {
      body.innerHTML = `<div class="ncc-thread-empty">${esc(_t('Mesajlar yüklenemedi.'))}</div>`;
    }
  }

  function _renderThread(rows) {
    const body = document.getElementById('nccThreadBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = `
        <div class="ncc-thread-empty">
          <svg fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h8M8 8h8m-8 8h5m7-4c0 4.418-4.03 8-9 8a9.8 9.8 0 01-4.15-.9L3 20l1.05-3.16A7.7 7.7 0 013 13c0-4.418 4.03-8 9-8s9 3.582 9 7z"/></svg>
          <div>${esc(_t('Bu deal için henüz mesaj yok.'))}</div>
        </div>`;
      return;
    }
    body.innerHTML = rows.map(m => {
      const mine = isMine(m);
      const who = mine ? (m.sent_by_name || _t('Ben')) : (m.sent_by_name || m.sent_to_name || _t('Clinic'));
      const mountId = 'nccMsgAtt_' + String(m.id).replace(/[^A-Za-z0-9_-]/g, '');
      return `
        <div class="ncc-msg-row" data-mine="${mine}">
          <div class="ncc-avatar sm" data-empty="${mine ? 'true' : 'false'}">${esc(initials(who))}</div>
          <div class="ncc-msg-col">
            ${m.message ? `<div class="ncc-bubble">${esc(m.message)}</div>` : ''}
            ${Number(m.attachment_count) > 0 ? `<div class="ncc-msg-attach" id="${esc(mountId)}"></div>` : ''}
            <div class="ncc-msg-meta">
              <span>${esc(who)}</span><span>·</span><span>${esc(timeFull(m.created_at))}</span>
            </div>
          </div>
        </div>`;
    }).join('');
    body.scrollTop = body.scrollHeight;
    // Ekler: her baloncuk KENDİ klasöründen yüklenir (mesaj id'si = klasör).
    // İmzalı URL'ler 1 saatte geçersiz olduğu için her çizimde yeniden alınır.
    if (window.NCAttach) {
      rows.filter(m => Number(m.attachment_count) > 0).forEach(m => {
        const mountId = 'nccMsgAtt_' + String(m.id).replace(/[^A-Za-z0-9_-]/g, '');
        if (document.getElementById(mountId)) NCAttach.load(m.id, mountId);
      });
    }
  }

  async function sendFromThread() {
    if (!_thread) return;
    const input = document.getElementById('nccThreadInput');
    const btn = document.getElementById('nccThreadSend');
    const text = input ? input.value.trim() : '';
    const msgId = _thread.draftId;
    const nAttach = await _attachCount(msgId);
    if (!text && !nAttach) { _notify(_t('Mesaj boş olamaz.')); return; }
    if (btn) btn.disabled = true;
    try {
      await _insert(_thread, text, msgId, nAttach);
      if (input) { input.value = ''; input.style.height = 'auto'; }
      _thread.draftId = uuid();
      const slot = document.getElementById('nccThreadAttachSlot');
      if (slot && window.NCAttach) {
        slot.innerHTML = NCAttach.renderWidget(`'${attr(_thread.draftId)}'`, 'nccThreadFile', 'nccThreadAttachMount');
        NCAttach.load(_thread.draftId, 'nccThreadAttachMount');
        NCAttach.bindPaste('nccThreadInput', _thread.draftId, 'nccThreadAttachMount');
      }
      _loadThread();
      refreshBell();
    } catch (e) {
      _notify(_t('Gönderilemedi: ') + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Bu deal'de BANA gelen okunmamış mesajları okundu işaretle.
  async function _markRead(dealId) {
    const me = (_user && _user.username) || '';
    if (!me) return;
    try {
      await fetch(
        `${BASE}/rest/v1/clinic_messages?deal_id=eq.${encodeURIComponent(dealId)}` +
        `&read_at=is.null&sent_by_username=neq.${encodeURIComponent(me)}`,
        { method: 'PATCH', headers: { ..._hj(), Prefer: 'return=minimal' },
          body: JSON.stringify({ read_at: new Date().toISOString(), read_by: me }) });
      refreshBell();
    } catch (e) { /* sessiz */ }
  }

  /* ═══════════════════════ 3. DEAL PENCERESİ İKONU ═══════════════════════ */
  // Metin yok, yalnızca ikon + okunmamış rozeti (kullanıcı talebi).
  //
  // Bağlam onclick'e JSON GÖMÜLEREK geçilmiyor: deal adlarında kesme
  // işareti/çift tırnak gerçekten oluyor (hasta adları) ve gömülü JSON o
  // durumda hem HTML attribute'unu hem JS dizesini bozuyor. data-* attribute
  // + dataset okuma bu soruna tamamen bağışık.
  function renderIconButton(ctx) {
    return `
      <button type="button" class="ncc-icon-btn" id="nccDealMsgBtn"
        data-deal-id="${esc(ctx.dealId || '')}"
        data-deal-name="${esc(ctx.dealName || '')}"
        data-team="${esc(ctx.team || '')}"
        onclick="NCClinicChat.openThreadFromEl(this)"
        title="${esc(_t('Clinic mesajları'))}" aria-label="${esc(_t('Clinic mesajları'))}">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h8M8 8h8m-8 8h5m7-4c0 4.418-4.03 8-9 8a9.8 9.8 0 01-4.15-.9L3 20l1.05-3.16A7.7 7.7 0 013 13c0-4.418 4.03-8 9-8s9 3.582 9 7z"/></svg>
        <span class="ncc-icon-badge" id="nccDealMsgBadge" style="display:none"></span>
      </button>`;
  }

  // data-* taşıyan herhangi bir tetikleyiciden sohbeti aç (ikon düğmesi,
  // bildirim satırı). Tek giriş noktası — kaçış sorunu yok.
  function openThreadFromEl(el) {
    if (!el) return;
    openThread({
      dealId:   el.dataset.dealId || '',
      dealName: el.dataset.dealName || '',
      team:     el.dataset.team || '',
    });
  }

  // Deal penceresi açıldığında rozeti doldur (toplam mesaj sayısı).
  async function refreshDealBadge(dealId) {
    const badge = document.getElementById('nccDealMsgBadge');
    if (!badge) return;
    try {
      const r = await fetch(
        `${BASE}/rest/v1/clinic_messages?deal_id=eq.${encodeURIComponent(dealId)}&select=id`,
        { headers: { ..._h(), Prefer: 'count=exact' } });
      if (!r.ok) { badge.style.display = 'none'; return; }
      const cr = r.headers.get('content-range') || '';
      const n = cr.includes('/') ? Number(cr.split('/')[1]) : 0;
      if (n > 0) { badge.textContent = n > 99 ? '99+' : String(n); badge.style.display = 'flex'; }
      else badge.style.display = 'none';
    } catch (e) { badge.style.display = 'none'; }
  }

  /* ═══════════════════════ 4. BİLDİRİM ÇANI ═══════════════════════ */
  let _bellMountId = null;
  let _bellItems = [];
  let _bellOpen = false;

  function renderBell(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    _bellMountId = mountId;
    mount.innerHTML = `
      <button type="button" class="ncc-bell" id="nccBellBtn" onclick="NCClinicChat.toggleBell(event)">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
        <span>${esc(_t('Bildirimler'))}</span>
        <span class="ncc-bell-dot" id="nccBellDot" data-has="false"></span>
        <span class="ncc-bell-count" id="nccBellCount" data-has="false">0</span>
      </button>`;
    if (!document.getElementById('nccBellPop')) {
      const pop = document.createElement('div');
      pop.id = 'nccBellPop';
      pop.className = 'ncc-bell-pop';
      pop.innerHTML = `
        <div class="ncc-bell-head">
          <h4>${esc(_t('Bildirimler'))}</h4>
          <button type="button" class="ncc-bell-clear" onclick="NCClinicChat.markAllRead()">${esc(_t('Tümünü okundu yap'))}</button>
        </div>
        <div class="ncc-bell-list" id="nccBellList"></div>`;
      document.body.appendChild(pop);
    }
    refreshBell();
  }

  // Okunmamış GELEN mesajlar: benim göndermediğim + okunmamış. Takım lideri
  // kapsamı için deal_team, init()'te verilen alias listesiyle sınırlanır
  // (bkz. TeamMap.aliasesFor) — admin/RM'de liste verilmezse filtre yok.
  async function refreshBell() {
    const me = (_user && _user.username) || '';
    try {
      let url = `${BASE}/rest/v1/clinic_messages?read_at=is.null` +
        `&select=id,deal_id,deal_name,message,created_at,sent_by_name,sent_by_username,deal_team` +
        `&order=created_at.desc&limit=30`;
      if (me) url += `&sent_by_username=neq.${encodeURIComponent(me)}`;
      if (_teamAliases && _teamAliases.length) {
        const list = _teamAliases.map(t => '"' + String(t).replace(/"/g, '\\"') + '"').join(',');
        url += `&deal_team=in.(${encodeURIComponent(list)})`;
      }
      const r = await fetch(url, { headers: _h() });
      if (!r.ok) { _bellItems = []; _paintBell(); return; }
      const rows = await r.json();
      _bellItems = Array.isArray(rows) ? rows : [];
    } catch (e) { _bellItems = []; }
    _paintBell();
  }

  function _paintBell() {
    const n = _bellItems.length;
    const dot = document.getElementById('nccBellDot');
    const cnt = document.getElementById('nccBellCount');
    if (dot) dot.dataset.has = n > 0 ? 'true' : 'false';
    if (cnt) { cnt.dataset.has = n > 0 ? 'true' : 'false'; cnt.textContent = n > 99 ? '99+' : String(n); }
    const list = document.getElementById('nccBellList');
    if (!list) return;
    if (!n) {
      list.innerHTML = `<div class="ncc-bell-empty">${esc(_t('Yeni mesaj yok'))}</div>`;
      return;
    }
    // Bağlam data-* ile taşınıyor (bkz. renderIconButton'daki kaçış notu).
    list.innerHTML = _bellItems.map(m => {
      return `
        <button type="button" class="ncc-bell-item"
          data-deal-id="${esc(m.deal_id || '')}"
          data-deal-name="${esc(m.deal_name || '')}"
          data-team="${esc(m.deal_team || '')}"
          onclick="NCClinicChat.openFromBell(this)">
          <div class="ncc-avatar sm">${esc(initials(m.sent_by_name || 'C'))}</div>
          <div class="ncc-bell-item-body">
            <div class="ncc-bell-item-top">
              <span class="ncc-bell-item-name">${esc(m.sent_by_name || _t('Clinic'))}</span>
              <span class="ncc-bell-item-time">${esc(timeShort(m.created_at))}</span>
            </div>
            <div class="ncc-bell-item-msg">${esc(m.message || _t('(görsel)'))}</div>
            <div class="ncc-bell-item-deal">${esc(m.deal_name || m.deal_id)}</div>
          </div>
        </button>`;
    }).join('');
  }

  // Panel YUKARI açılır: tetikleyicinin üstüne konumlanır, yer yoksa altına
  // düşer (bkz. team-leader.html positionNoteTip ile aynı yaklaşım).
  function toggleBell(ev) {
    if (ev) ev.stopPropagation();
    const pop = document.getElementById('nccBellPop');
    const btn = document.getElementById('nccBellBtn');
    if (!pop || !btn) return;
    if (_bellOpen) { closeBell(); return; }
    _bellOpen = true;
    pop.classList.add('open');
    const r = btn.getBoundingClientRect();
    const h = pop.offsetHeight || 320;
    const w = pop.offsetWidth || 320;
    let left = r.left;
    if (left + w > window.innerWidth - 10) left = window.innerWidth - w - 10;
    if (left < 10) left = 10;
    let top = r.top - h - 8;                       // YUKARI
    if (top < 10) top = Math.min(r.bottom + 8, window.innerHeight - h - 10);
    pop.style.left = left + 'px';
    pop.style.top = Math.max(10, top) + 'px';
    setTimeout(() => document.addEventListener('mousedown', _onDocDown, true), 0);
    refreshBell();
  }

  function closeBell() {
    _bellOpen = false;
    const pop = document.getElementById('nccBellPop');
    if (pop) pop.classList.remove('open');
    document.removeEventListener('mousedown', _onDocDown, true);
  }

  function _onDocDown(e) {
    const pop = document.getElementById('nccBellPop');
    const btn = document.getElementById('nccBellBtn');
    if (pop && pop.contains(e.target)) return;
    if (btn && btn.contains(e.target)) return;
    closeBell();
  }

  function openFromBell(el) {
    closeBell();
    openThreadFromEl(el);
  }

  async function markAllRead() {
    const me = (_user && _user.username) || '';
    if (!_bellItems.length) return;
    const ids = _bellItems.map(m => m.id).filter(Boolean);
    if (!ids.length) return;
    try {
      await fetch(`${BASE}/rest/v1/clinic_messages?id=in.(${ids.join(',')})`, {
        method: 'PATCH', headers: { ..._hj(), Prefer: 'return=minimal' },
        body: JSON.stringify({ read_at: new Date().toISOString(), read_by: me }),
      });
    } catch (e) { /* sessiz */ }
    refreshBell();
  }

  return {
    init, aftercareOwner,
    // dock
    renderDock, dockAction, openComposer, closeComposer, openThreadFromDock,
    // thread
    openThread, openThreadFromEl, closeThread, sendFromThread,
    // deal ikonu
    renderIconButton, refreshDealBadge,
    // çan
    renderBell, refreshBell, toggleBell, closeBell, openFromBell, markAllRead,
  };
})();
