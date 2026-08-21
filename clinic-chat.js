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

  // Sohbet kutusundaki sınır (deal'in kendi dizisi — uzun yazılabilir).
  const MAX_LEN = 1000;
  // İLK mesaj, yani "Clinic'e Bildir" dock'undan gönderilen bildirim:
  // 200 karakter (kullanıcı talebi). Burası bir bildirim/özet alanı, sohbet
  // değil — detay zaten sohbette devam ediyor.
  const DOCK_MAX_LEN = 200;

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

  // ── Klinik muhatabı — deal.raw'dan, deal başına bir kez ────────────────
  // Alarm penceresinde elimizde yalnızca alarm satırı var (alarms tablosunda
  // raw YOK), bu yüzden deal'in raw'ı istendiğinde tek satırlık hafif bir
  // sorguyla çekilip önbelleğe alınıyor.
  //
  // İKİ KAYNAK, sırayla (kullanıcı talebi: "aftercare owner yoksa WA Group'a
  // da bakalım, ikisi de aynı anlama geliyor"):
  //   1) Aftercare_Owner — {id, name}, Zoho'nun katı alanı.
  //   2) WA_Group        — "Team 1 (Habiba)" biçiminde serbest metin;
  //      parantez içindeki kişi muhatap, baştaki kısım grup adı.
  //
  // Canlı ölçüm (2026-08-20, 600 deal): yalnız Aftercare 17, yalnız WA_Group
  // 199, ikisi de dolu 143. Yani WA_Group yedeği kapsamı 160'tan 359'a
  // çıkarıyor (%27 → %60) — bu yüzden yedek şart, süs değil.
  const _contactCache = new Map();   // dealId → { id, name, group, source } | null

  // ── Klinik personeli dizini (zoho_users) ───────────────────────────────
  // WA_Group yalnızca İLK ADI veriyor ("Team 1 (Habiba)"), Aftercare_Owner
  // ise tam adı ("Habiba Layachi"). Dizin olmadan aynı kişi sistemde İKİ
  // AYRI muhatap gibi görünüyor: sohbet başlığı bir deal'de "Habiba", başka
  // bir deal'de "Habiba Layachi" yazıyor ve ileride yönlendirme de ikiye
  // bölünürdü.
  //
  // Eşleştirme TAHMİN DEĞİL, çift taraflı doğrulanıyor (canlı ölçüm,
  // 2026-08-21): WA_Group'un grup adı ile kişinin zoho_users'taki rolü
  // BİREBİR aynı —
  //     "Team 1 (Habiba)" → Habiba Layachi, rol "Team 1"
  //     "Team 2 (Nidal)"  → Nidal Türkmen,  rol "Team 2"
  //     "Team 3 (Khaled)" → Khaled Tabib,   rol "Team 3"
  //     "Team 4 (Mina)"   → Mina Horo,      rol "Team 4"
  // Bu yüzden yalnızca ilk ad DEĞİL, ilk ad + grup/rol birlikte aranıyor;
  // ikisi de tutmazsa birleştirme YAPILMIYOR (ham ad korunur).
  let _staffPromise = null;
  function _clinicStaff() {
    if (_staffPromise) return _staffPromise;
    _staffPromise = (async () => {
      try {
        const r = await fetch(
          `${BASE}/rest/v1/zoho_users?select=id,full_name,role,phone,mobile&limit=2000`,
          { headers: _h() });
        if (!r.ok) return [];
        const rows = await r.json();
        return Array.isArray(rows) ? rows : [];
      } catch (e) { return []; }
    })();
    return _staffPromise;
  }

  const _nk = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Dizinde kişiyi bul. wa ise {name: ilk ad, group: rol} ile, aftercare ise
  // tam adla aranır. Bulunamazsa null (çağıran ham adı kullanmaya devam eder).
  async function _findStaff({ fullName, firstName, group }) {
    const staff = await _clinicStaff();
    if (!staff.length) return null;
    if (fullName) {
      const hit = staff.find(z => _nk(z.full_name) === _nk(fullName));
      if (hit) return hit;
    }
    if (firstName) {
      const fk = _nk(firstName);
      let cands = staff.filter(z => _nk(z.full_name).split(' ')[0] === fk);
      // Grup adı verilmişse rolle de doğrula — tek başına ilk ad yetmez.
      if (group) {
        const gk = _nk(group);
        const byGroup = cands.filter(z => _nk(z.role) === gk);
        if (byGroup.length === 1) return byGroup[0];
      }
      // Grup eşleşmediyse ancak ilk ad TEKİLSE kabul et.
      if (cands.length === 1) return cands[0];
    }
    return null;
  }

  function _parseWaGroup(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return null;
    // "Team 1 (Habiba)" → { name: 'Habiba', group: 'Team 1' }
    const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(s);
    if (m && m[2].trim()) return { name: m[2].trim(), group: (m[1] || '').trim() };
    // Parantezsiz yazılmışsa metnin kendisi grup adı sayılır.
    return { name: '', group: s };
  }

  async function clinicContact(dealId) {
    const k = String(dealId || '');
    if (!k) return null;
    if (_contactCache.has(k)) return _contactCache.get(k);
    let out = null;
    try {
      const r = await fetch(`${BASE}/rest/v1/deals?id=eq.${encodeURIComponent(k)}&select=raw&limit=1`, { headers: _h() });
      if (r.ok) {
        const rows = await r.json();
        const raw0 = Array.isArray(rows) && rows[0] ? rows[0].raw : null;
        const raw = typeof raw0 === 'string' ? (() => { try { return JSON.parse(raw0); } catch (e) { return {}; } })() : (raw0 || {});

        const ao = raw.Aftercare_Owner || raw.aftercare_owner || null;
        if (ao && typeof ao === 'object' && ao.name) out = { id: ao.id || '', name: ao.name, group: '', source: 'aftercare' };
        else if (typeof ao === 'string' && ao.trim()) out = { id: '', name: ao.trim(), group: '', source: 'aftercare' };

        if (!out) {
          const wa = _parseWaGroup(raw.WA_Group || raw.wa_group || '');
          // Yalnızca grup adı çıktıysa (kişi yok) yine muhatap sayılır:
          // mesaj o WhatsApp grubuna ait ekibe gidiyor.
          if (wa && (wa.name || wa.group)) {
            out = { id: '', name: wa.name || wa.group, group: wa.group, source: 'wa' };
          }
        }

        // Dizinden TAM KİMLİĞE yükselt — bkz. _clinicStaff notu. Aynı kişinin
        // "Habiba" ve "Habiba Layachi" diye iki muhatap gibi görünmesini
        // engeller; telefonu da buradan geliyor (ileride teslimat için).
        if (out) {
          const z = await _findStaff(out.source === 'wa'
            ? { firstName: out.name, group: out.group }
            : { fullName: out.name });
          if (z) {
            out.name  = z.full_name || out.name;
            out.id    = out.id || String(z.id || '');
            out.phone = String(z.phone || z.mobile || '');
            if (!out.group && z.role) out.group = z.role;
          }
        }
      }
    } catch (e) { /* sessiz — sohbet yine açılır, muhatap "atanmamış" görünür */ }
    _contactCache.set(k, out);
    return out;
  }

  // Geriye dönük ad — dışarıdan aftercareOwner() diye çağıran yerler için.
  const aftercareOwner = clinicContact;

  // ── Mesaj yazma (tek yol) ─────────────────────────────────────────────
  async function _insert(ctx, text, msgId, attachCount) {
    const c = await clinicContact(ctx.dealId);
    const row = {
      id:               msgId,
      deal_id:          String(ctx.dealId),
      deal_name:        ctx.dealName || '',
      deal_team:        ctx.team || '',
      sent_by_username: (_user && _user.username) || '',
      sent_by_name:     (_user && _user.fullName) || '',
      sent_by_role:     (_user && _user.role) || '',
      sent_to_id:       c ? c.id : '',
      sent_to_name:     c ? c.name : '',
      // Muhatabın hangi kaynaktan çözüldüğü kayıtta kalıyor — Faz 6'da
      // yönlendirme buna bakacak:
      //   'Aftercare Owner' → Zoho'nun katı alanından çözüldü
      //   'WA Group'        → WhatsApp grubundan çözüldü
      //   'Unassigned'      → HİÇBİRİ yok. Bunu da 'Aftercare Owner' yazmak
      //     veriyi yanıltıcı yapıyordu: canlıda muhatabı boş 2 mesaj
      //     "Aftercare Owner'a gitti" görünüyordu (2026-08-21 ölçümü), oysa
      //     öyle bir kişi yok. Ayrı bir değer, bu mesajların sorumlu
      //     atandığında bulunup yönlendirilmesini de mümkün kılıyor.
      sent_to_role:     !c ? 'Unassigned' : (c.source === 'wa' ? 'WA Group' : 'Aftercare Owner'),
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

  // Mesaja bağlı ek sayısı — ÖNİZLEME ŞERİDİNDEN (DOM), sunucudan DEĞİL.
  //
  // NEDEN DOM: önceden her gönderimde /api/alarm-files'a sorulup YANIT
  // BEKLENİYORDU. O uç bu ortamda asılı kalabiliyor (aynı sebeple ek
  // şeridinde "Ekler yükleniyor..." metni takılı kalıyordu) ve gönderim o
  // isteğe kilitlendiği için Enter'a basınca HİÇBİR ŞEY OLMUYORDU
  // (kullanıcı ekran görüntüsü, 2026-08-21).
  //
  // DOM saymak güvenilir: şeritteki küçük resimler sunucudan gelen listeyle
  // çiziliyor (NCAttach.handleFiles yüklemeden SONRA load() ile yeniden
  // çiziyor), yani ekran zaten sunucu durumunu yansıtıyor. Ek yoksa şerit
  // boş → hiç ağ isteği yok, gönderim anında.
  function _attachCount(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return 0;
    return mount.querySelectorAll('.nc-attach-thumb').length;
  }

  /* ═══════════════════════ 1. DOCK ═══════════════════════ */
  // Alarm penceresine gömülür. Kapalıyken tek satır kimlik çubuğu; "Sohbet"e
  // basınca composer AYNI kartın içinde, çubuğun ÜSTÜNDE açılır.
  let _dock = null;   // { mountId, dealId, dealName, team, alarmId, draftId, open }

  function renderDock(mountId, ctx) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    // TEK DOCK KURALI: iskelet sabit id'ler kullanıyor (nccDock,
    // nccDockComposer, nccDockAttachMount...) ve _dock tek bir modül
    // değişkeni. Dock artık BİRDEN FAZLA pencerede (alarm, Won, İptal)
    // yaşıyor; önceki pencerenin bıraktığı iskelet DOM'da kalırsa id'ler
    // ikizlenir ve getElementById yanlış olanı bulur. Yeni dock'u kurmadan
    // önce bir öncekinin yuvası boşaltılıyor.
    if (_dock && _dock.mountId && _dock.mountId !== mountId) {
      const prev = document.getElementById(_dock.mountId);
      if (prev) prev.innerHTML = '';
    }
    _dock = {
      mountId,
      dealId:   String(ctx.dealId || ''),
      dealName: ctx.dealName || '',
      team:     ctx.team || '',
      alarmId:  ctx.alarmId || null,
      // Composer ilk açıldığında kutuya hazır gelen metin. Akış "alarmı gör →
      // clinic'e pushla" olduğu için her seferinde aynı cümleyi elle yazmak
      // gereksiz; kullanıcı silebilir/düzenleyebilir.
      suggest:  ctx.suggest || '',
      draftId:  uuid(),
      open:     false,
    };
    // Geçmiş ikonunun davranışı DIŞARIDAN veriliyor: barındıran pencere
    // bunu ayrı bir pencere açmak için DEĞİL, kendi içinde sohbet sayfasını
    // yükseltmek için kullanıyor (kullanıcı talebi: yeni popup açılmasın).
    const onHistory = ctx.onHistory || 'NCClinicChat.openThreadFromDock()';
    mount.innerHTML = `
      <div class="ncc-dock" id="nccDock">
        <span class="ncc-dock-aurora" aria-hidden="true"></span>
        <div class="ncc-dock-composer" id="nccDockComposer" data-open="false">
          <!-- Ek önizlemeleri kutunun ÜSTÜNDE; ek yokken :empty ile gizli. -->
          <span class="ncc-attach-mount" id="nccDockAttachMount"></span>
          <div class="ncc-dock-field">
            <textarea id="nccDockInput" maxlength="${DOCK_MAX_LEN}" rows="1"
              placeholder="${esc(_t('Klinik ekibine iletilecek mesaj...'))}"></textarea>
            <!-- Kutunun İÇİNDE yalnızca kapatma düğmesi var. Ataç aşağıdaki
                 şeride alındı: dock'un kutusu kısa (tek satır) olduğu için
                 sağ-üstteki çarpı ile sağ-alttaki ataç birbirine giriyordu
                 (kullanıcı ekran görüntüsü). Sohbette çarpı olmadığı için
                 orada ataç kutunun içinde kalıyor. -->
            <button type="button" class="ncc-composer-x" onclick="NCClinicChat.closeComposer()"
              title="${esc(_t('Kapat'))}" aria-label="${esc(_t('Kapat'))}">
              <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="ncc-composer-bar">
            <label class="ncc-attach-btn" for="nccDockFile"
              title="${esc(_t('Görsel ekle (JPG/PNG/GIF/WebP, en fazla 3 MB)'))}">
              <svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            </label>
            <input type="file" id="nccDockFile" accept="${_ACCEPT}" multiple style="display:none">
            <span class="ncc-composer-count" id="nccDockCount" data-warn="false"></span>
          </div>
        </div>
        <div class="ncc-dock-bar">
          <span class="ncc-avatar-wrap">
            <span class="ncc-avatar" id="nccDockAvatar" data-empty="true">?</span>
          </span>
          <div class="ncc-dock-id">
            <p class="ncc-dock-name" id="nccDockName">${esc(_t('Yükleniyor...'))}</p>
            <p class="ncc-dock-status" id="nccDockStatus" data-empty="true">&nbsp;</p>
          </div>
          <div class="ncc-dock-actions">
            <button type="button" class="ncc-ghost-btn" onclick="${esc(onHistory)}"
              title="${esc(_t('Sohbet geçmişi'))}" aria-label="${esc(_t('Sohbet geçmişi'))}">
              <svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h8M8 14h5m8-2c0 4.418-4.03 8-9 8a9.8 9.8 0 01-4.15-.9L3 20l1.05-3.16A7.7 7.7 0 013 13c0-4.418 4.03-8 9-8s9 3.582 9 7z"/></svg>
            </button>
            <button type="button" class="ncc-cta" id="nccDockGo" onclick="NCClinicChat.dockAction()">
              <span class="ncc-cta-sheen" aria-hidden="true"></span>
              <span class="ncc-cta-ico" id="nccDockGoIcon">
                <svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h8M8 14h5m8-2c0 4.418-4.03 8-9 8a9.8 9.8 0 01-4.15-.9L3 20l1.05-3.16A7.7 7.7 0 013 13c0-4.418 4.03-8 9-8s9 3.582 9 7z"/></svg>
              </span>
              <span class="ncc-cta-label" id="nccDockGoLabel">${esc(_t('Clinic\'e Bildir'))}</span>
            </button>
          </div>
        </div>
      </div>`;

    const input = document.getElementById('nccDockInput');
    if (input) {
      input.addEventListener('input', () => { _autoGrow(input); _paintCount(input); });
      // Enter gönderir, Shift+Enter yeni satır.
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); dockAction(); }
      });
      // Odak halkası: kartın tamamı vurgulanır (tek bir input değil) —
      // composer'ın aktif olduğu tek bakışta anlaşılsın.
      const card = document.getElementById('nccDock');
      input.addEventListener('focus', () => { if (card) card.dataset.focus = 'true'; });
      input.addEventListener('blur',  () => { if (card) card.dataset.focus = 'false'; });
    }
    _paintDockIdentity();
  }

  function _autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 148) + 'px';
  }

  // Sayaç yalnızca sınıra YAKLAŞINCA görünür (>%70) — boş bir "0 / 200"
  // her zaman ekranda durunca gürültü yapıyor, hiçbir şey söylemiyordu.
  // Sınır DOCK_MAX_LEN (200): bu fonksiyon yalnızca dock composer'ında
  // kullanılıyor, sohbet kutusunun sayacı yok.
  function _paintCount(input) {
    const c = document.getElementById('nccDockCount');
    if (!c) return;
    const n = input.value.length;
    const near = n > DOCK_MAX_LEN * 0.7;
    c.textContent = near ? `${n} / ${DOCK_MAX_LEN}` : '';
    c.dataset.warn = n > DOCK_MAX_LEN * 0.92 ? 'true' : 'false';
  }

  // Muhatabın nereden geldiğini kullanıcıya açıkça söyler — "Aftercare
  // sorumlusu" ile "WhatsApp grubu" farklı şeyler, hangisine yazdığını
  // bilmesi lazım.
  function _contactSub(c) {
    if (!c) return _t('Muhatap atanmamış');
    if (c.source === 'wa') return c.group ? `${_t('WhatsApp grubu')} · ${c.group}` : _t('WhatsApp grubu');
    return _t('Aftercare sorumlusu');
  }

  async function _paintDockIdentity() {
    if (!_dock) return;
    const c = await clinicContact(_dock.dealId);
    if (!_dock) return;
    const av = document.getElementById('nccDockAvatar');
    const nm = document.getElementById('nccDockName');
    const st = document.getElementById('nccDockStatus');
    if (!av || !nm || !st) return;
    // Gradient halka wrapper'da; durum ORAYA da yazılıyor (CSS :has()
    // bağımlılığı olmasın — bkz. clinic-chat.css'teki not).
    const wrap = av.parentElement;
    if (c && c.name) {
      av.textContent = initials(c.name); av.dataset.empty = 'false';
      if (wrap) { wrap.dataset.empty = 'false'; wrap.dataset.source = c.source || ''; }
      nm.textContent = c.name;
      st.textContent = _contactSub(c); st.dataset.empty = 'false';
    } else {
      av.textContent = '?'; av.dataset.empty = 'true';
      if (wrap) { wrap.dataset.empty = 'true'; wrap.dataset.source = ''; }
      nm.textContent = _t('Muhatap atanmamış');
      st.textContent = _t('Aftercare Owner ve WhatsApp grubu boş'); st.dataset.empty = 'true';
    }
  }

  // İki ikon: kapalıyken sohbet balonu, açıkken kağıt uçak. Düğme
  // "bildir" → "gönder"e dönüşürken ikon da dönüşüyor.
  const _ICO_CHAT = '<svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h8M8 14h5m8-2c0 4.418-4.03 8-9 8a9.8 9.8 0 01-4.15-.9L3 20l1.05-3.16A7.7 7.7 0 013 13c0-4.418 4.03-8 9-8s9 3.582 9 7z"/></svg>';
  const _ICO_SEND = '<svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 19.5l15-7.5-15-7.5v6l9 1.5-9 1.5v6z"/></svg>';

  function openComposer() {
    if (!_dock) return;
    _dock.open = true;
    const card = document.getElementById('nccDock');
    if (card) card.dataset.open = 'true';
    const c = document.getElementById('nccDockComposer');
    if (c) c.dataset.open = 'true';
    const lbl = document.getElementById('nccDockGoLabel');
    if (lbl) lbl.textContent = _t('Gönder');
    const icon = document.getElementById('nccDockGoIcon');
    if (icon) { icon.innerHTML = _ICO_SEND; icon.dataset.morph = 'send'; }
    // Ek widget'ı ilk açılışta bir kez basılır — mesaj başına ayrı klasör
    // (draftId) kullanıldığı için gönderimden sonra yenilenir.
    _mountDockAttach();
    const input = document.getElementById('nccDockInput');
    if (input) {
      // Hazır metin YALNIZCA kutu boşken basılır — kullanıcı bir şey yazıp
      // composer'ı kapatıp tekrar açtıysa yazdığını ezmeyiz.
      if (!input.value && _dock.suggest) input.value = _dock.suggest;
      _paintCount(input);
      requestAnimationFrame(() => {
        _autoGrow(input);
        input.focus();
        // İmleç sona: hazır metnin ARKASINA yazmaya devam edilsin.
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
      });
    }
  }

  function closeComposer() {
    if (!_dock) return;
    _dock.open = false;
    const card = document.getElementById('nccDock');
    if (card) { card.dataset.open = 'false'; card.dataset.focus = 'false'; }
    const c = document.getElementById('nccDockComposer');
    if (c) c.dataset.open = 'false';
    const lbl = document.getElementById('nccDockGoLabel');
    if (lbl) lbl.textContent = _t('Clinic\'e Bildir');
    const icon = document.getElementById('nccDockGoIcon');
    if (icon) { icon.innerHTML = _ICO_CHAT; icon.dataset.morph = 'chat'; }
  }

  // NCAttach.renderWidget yerine KOMPAKT ek düğmesi.
  //
  // NEDEN: attach-util.js'in kendi widget'ı üç parça basıyor — etiketli
  // düğme + "JPG/PNG/GIF/WebP, en fazla 3 MB" açıklaması + önizleme kabı.
  // Bu, alarm/deal penceresindeki dar araç çubuğuna sığmayıp klavye
  // ipucunun üzerine taşıyordu (kullanıcı ekran görüntüsü, 2026-08-20).
  // Yükleme/silme/önizlemenin KENDİSİ yine NCAttach'in API'siyle yapılıyor
  // (handleFiles/load/bindPaste); yalnızca tetikleyicinin görünümü bizim.
  //
  // accept listesi attach-util.js'teki ACCEPT ile AYNI olmalı — o sabit
  // dışa aktarılmadığı için burada tekrarlanıyor.
  const _ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';

  function _mountDockAttach() {
    if (!_dock || !window.NCAttach) return;
    const file = document.getElementById('nccDockFile');
    const draftId = _dock.draftId;
    if (file) {
      file.onchange = function () {
        NCAttach.handleFiles(draftId, 'nccDockAttachMount', file.files);
        file.value = '';
      };
    }
    // load() çağrılmıyor — bkz. _mountThreadAttach'teki aynı not.
    const mount = document.getElementById('nccDockAttachMount');
    if (mount) mount.innerHTML = '';
    NCAttach.bindPaste('nccDockInput', draftId, 'nccDockAttachMount');
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
    // Artik ag istegi YOK — onizleme seridinden sayiliyor (bkz. _attachCount).
    const nAttach = _attachCount('nccDockAttachMount');
    if (!text && !nAttach) { _notify(_t('Mesaj boş olamaz.')); return; }
    if (btn) btn.disabled = true;
    try {
      await _insert(_dock, text, msgId, nAttach);
      if (input) { input.value = ''; input.style.height = 'auto'; _paintCount(input); }
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

  /* ═══════════════════════ 2. SOHBET (tek render yolu) ═══════════════════════ */
  // Sohbet arayüzü TEK yerde üretiliyor (renderChat) ve İKİ yere basılabiliyor:
  //   a) deal penceresinin içindeki sohbet paneli  → mountInline()
  //   b) kendi başına açılan pencere (çan/dock)    → openThread()
  // Böylece iki ayrı kopya olmuyor; düzeltme bir yerde yapılıyor.
  //
  // Element id'leri host başına ÖNEKLENİYOR: iki host aynı anda DOM'da
  // olabilir (deal penceresi açıkken çandan pencere açılabilir) ve id
  // çakışması sessizce yanlış kutuya yazmaya yol açardı.
  let _thread = null;   // { dealId, dealName, team, alarmId, draftId, pfx, hostId }

  function _ids(pfx) {
    return {
      body:   pfx + 'Body',
      input:  pfx + 'Input',
      send:   pfx + 'Send',
      attach: pfx + 'AttachSlot',
      mount:  pfx + 'AttachMount',
      file:   pfx + 'File',
      warn:   pfx + 'WarnSlot',
      avatar: pfx + 'Avatar',
      title:  pfx + 'Title',
      sub:    pfx + 'Sub',
      wrap:   pfx + 'AvatarWrap',
    };
  }

  // Sohbet iskeletini verilen konteynere basar. `opts.header`:
  //   'back'  → sol üstte geri oku (deal penceresi içi)
  //   'close' → sağ üstte kapat (kendi penceresi)
  function renderChat(hostEl, ctx, opts) {
    if (!hostEl) return;
    opts = opts || {};
    const pfx = opts.prefix || 'nccChat';
    const id = _ids(pfx);
    const isBack = opts.header === 'back';

    _thread = {
      dealId:   String(ctx.dealId || ''),
      dealName: ctx.dealName || '',
      team:     ctx.team || '',
      alarmId:  ctx.alarmId || null,
      draftId:  uuid(),
      pfx,
      hostId:   hostEl.id || '',
    };

    const leadBtn = isBack
      ? `<button type="button" class="ncc-chat-back" onclick="${esc(opts.onBack || '')}"
           title="${esc(_t('Deal detayına dön'))}" aria-label="${esc(_t('Deal detayına dön'))}">
           <svg fill="none" stroke="currentColor" stroke-width="2.1" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
           <span>${esc(_t('Geri'))}</span>
         </button>`
      : '';
    const tailBtn = isBack
      ? ''
      : `<button type="button" class="ncc-chat-x" onclick="NCClinicChat.closeThread()" aria-label="${esc(_t('Kapat'))}">
           <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
         </button>`;

    hostEl.innerHTML = `
      <div class="ncc-chat">
        <div class="ncc-chat-head">
          ${leadBtn}
          <span class="ncc-avatar-wrap" id="${id.wrap}" data-empty="true">
            <span class="ncc-avatar" id="${id.avatar}" data-empty="true">?</span>
          </span>
          <div class="ncc-chat-head-id">
            <p class="ncc-chat-title" id="${id.title}">${esc(ctx.dealName || _t('Deal'))}</p>
            <p class="ncc-chat-sub" id="${id.sub}">${esc(_t('Yükleniyor...'))}</p>
          </div>
          ${tailBtn}
        </div>
        <div class="ncc-chat-body" id="${id.body}"></div>
        <div class="ncc-chat-foot">
          <!-- Ek önizlemeleri yazma kutusunun ÜSTÜNDE (WhatsApp deseni);
               ek yokken :empty ile tamamen gizleniyor, yer kaplamıyor. -->
          <span class="ncc-attach-mount" id="${id.mount}"></span>
          <div class="ncc-chat-foot-row">
            <div class="ncc-input-wrap">
              <textarea id="${id.input}" maxlength="${MAX_LEN}" rows="1"
                placeholder="${esc(_t('Mesaj yaz...'))}"></textarea>
              <!-- Ataç kutunun İÇİNDE, en sağda (kullanıcı talebi). -->
              <label class="ncc-attach-inline" for="${id.file}"
                title="${esc(_t('Görsel ekle (JPG/PNG/GIF/WebP, en fazla 3 MB)'))}">
                <svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
              </label>
              <input type="file" id="${id.file}" accept="${_ACCEPT}" multiple style="display:none">
            </div>
            <button type="button" class="ncc-send-btn" id="${id.send}" onclick="NCClinicChat.sendFromThread()"
              title="${esc(_t('Gönder'))}" aria-label="${esc(_t('Gönder'))}">
              <svg fill="none" stroke="currentColor" stroke-width="1.9" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 19.5l15-7.5-15-7.5v6l9 1.5-9 1.5v6z"/></svg>
            </button>
          </div>
        </div>
      </div>`;

    const input = document.getElementById(id.input);
    if (input) {
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 116) + 'px';
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFromThread(); }
      });
    }
    _mountThreadAttach();
    _paintThreadIdentity();
    _loadThread();
  }

  // Ataç etiketi ve dosya girdisi iskelette SABİT duruyor (yazma kutusunun
  // içinde); burada yalnızca hangi taslağa yükleneceği bağlanıyor. innerHTML
  // ile yeniden basmıyoruz: draftId her mesajdan sonra değiştiği için tek
  // değişmesi gereken şey onchange — böylece kaçış/yeniden bağlama derdi yok.
  function _mountThreadAttach() {
    if (!_thread || !window.NCAttach) return;
    const id = _ids(_thread.pfx);
    const file = document.getElementById(id.file);
    const draftId = _thread.draftId;
    if (file) {
      file.onchange = function () {
        NCAttach.handleFiles(draftId, id.mount, file.files);
        file.value = '';
      };
    }
    // NCAttach.load() BİLEREK çağrılmıyor: draftId her seferinde yeni bir
    // uuid, yani tanım gereği hiç eki olamaz. Çağırmak hem boşa bir istek
    // atıyor hem de yanıt gelene kadar "Ekler yükleniyor..." metnini
    // composer'ın üstünde bırakıyordu (kullanıcı ekran görüntüsü). Ek
    // eklendiğinde handleFiles zaten kendisi yeniliyor.
    const mount = document.getElementById(id.mount);
    if (mount) mount.innerHTML = '';
    NCAttach.bindPaste(id.input, draftId, id.mount);
  }

  async function _paintThreadIdentity() {
    if (!_thread) return;
    const want = _thread.dealId;
    const c = await clinicContact(want);
    // Arada başka bir sohbete geçilmiş olabilir — geç gelen yanıt yeni
    // sohbetin başlığını EZMEMELİ.
    if (!_thread || _thread.dealId !== want) return;
    const id = _ids(_thread.pfx);
    const av = document.getElementById(id.avatar);
    const wrap = document.getElementById(id.wrap);
    const sub = document.getElementById(id.sub);
    const warn = document.getElementById(id.warn);
    if (c && c.name) {
      if (av) { av.textContent = initials(c.name); av.dataset.empty = 'false'; }
      if (wrap) { wrap.dataset.empty = 'false'; wrap.dataset.source = c.source || ''; }
      if (sub) sub.textContent = c.name + ' · ' + _contactSub(c);
      if (warn) warn.innerHTML = '';
    } else {
      if (av) { av.textContent = '?'; av.dataset.empty = 'true'; }
      if (wrap) { wrap.dataset.empty = 'true'; wrap.dataset.source = ''; }
      if (sub) sub.textContent = _t('Muhatap atanmamış');
      // Ayrı bir uyarı satırı YOK (kullanıcı talebi): başlıktaki "Muhatap
      // atanmamış" bilgiyi zaten veriyor, ikinci bir şerit hem tekrar hem
      // composer'ın yerini yiyordu.
      if (warn) warn.innerHTML = '';
    }
  }

  async function _loadThread() {
    if (!_thread) return;
    const want = _thread.dealId;
    const id = _ids(_thread.pfx);
    const body = document.getElementById(id.body);
    if (!body) return;
    try {
      const r = await fetch(
        `${BASE}/rest/v1/clinic_messages?deal_id=eq.${encodeURIComponent(want)}` +
        `&order=created_at.asc&limit=200`, { headers: _h() });
      if (!_thread || _thread.dealId !== want) return;
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        body.innerHTML = `<div class="ncc-chat-empty">${esc(
          /does not exist|PGRST205|schema cache/i.test(txt)
            ? _t('clinic_messages tablosu henüz kurulmamış — clinic_messages.sql dosyasını çalıştırın.')
            : _t('Mesajlar yüklenemedi.'))}</div>`;
        return;
      }
      const rows = await r.json();
      if (!_thread || _thread.dealId !== want) return;
      _renderThread(Array.isArray(rows) ? rows : []);
      _markRead(want);
    } catch (e) {
      body.innerHTML = `<div class="ncc-chat-empty">${esc(_t('Mesajlar yüklenemedi.'))}</div>`;
    }
  }

  function _renderThread(rows) {
    if (!_thread) return;
    const id = _ids(_thread.pfx);
    const body = document.getElementById(id.body);
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = `
        <div class="ncc-chat-empty">
          <span class="ncc-empty-ico">
            <svg fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h8M8 14h5m8-2c0 4.418-4.03 8-9 8a9.8 9.8 0 01-4.15-.9L3 20l1.05-3.16A7.7 7.7 0 013 13c0-4.418 4.03-8 9-8s9 3.582 9 7z"/></svg>
          </span>
          <div class="ncc-empty-title">${esc(_t('Bu deal için henüz mesaj yok.'))}</div>
          <span class="ncc-empty-sub">${esc(_t('İlk mesajı yazarak sohbeti başlatın.'))}</span>
        </div>`;
      return;
    }
    // Gün ayırıcı: aynı güne ait mesajlar tek başlık altında toplanır.
    // lastWho: ardışık aynı gönderici gruplaması (aşağıda).
    let lastDay = '';
    let lastWho = '';
    const parts = [];
    for (const m of rows) {
      const day = String(m.created_at || '').slice(0, 10);
      if (day && day !== lastDay) {
        lastDay = day;
        lastWho = '';   // yeni gün → gruplama sıfırlanır, ad tekrar yazılır
        parts.push(`<div class="ncc-chat-day"><span>${esc(_dayLabel(day))}</span></div>`);
      }
      const mine = isMine(m);
      const who = mine ? (m.sent_by_name || _t('Ben')) : (m.sent_by_name || m.sent_to_name || _t('Clinic'));
      const mountId = _thread.pfx + 'Msg' + String(m.id).replace(/[^A-Za-z0-9_-]/g, '');
      // Aynı kişinin ARDIŞIK mesajlarında ad tekrar yazılmıyor ve kuyruk
      // yalnızca grubun İLK baloncuğunda çiziliyor (WhatsApp deseni).
      const grouped = lastWho === who;
      lastWho = who;
      // Okundu işareti yalnızca BENİM mesajlarımda: karşı taraf okuduysa
      // çift tik, okumadıysa tek tik.
      const ticks = mine
        ? `<span class="ncc-b-tick" data-read="${m.read_at ? 'true' : 'false'}">${m.read_at ? '✓✓' : '✓'}</span>`
        : '';
      parts.push(`
        <div class="ncc-msg-row" data-mine="${mine}" data-grouped="${grouped}">
          <span class="ncc-avatar sm" data-empty="${mine ? 'true' : 'false'}">${esc(initials(who))}</span>
          <div class="ncc-msg-col">
            <div class="ncc-bubble">
              ${grouped || mine ? '' : `<div class="ncc-b-who">${esc(who)}</div>`}
              ${Number(m.attachment_count) > 0 ? `<div class="ncc-msg-attach" id="${esc(mountId)}"></div>` : ''}
              ${m.message ? `<span class="ncc-b-text">${esc(m.message)}</span>` : ''}
              <span class="ncc-b-meta">${esc(timeHM(m.created_at))}${ticks}</span>
            </div>
          </div>
        </div>`);
    }
    body.innerHTML = parts.join('');
    body.scrollTop = body.scrollHeight;
    // Ekler: her baloncuk KENDİ klasöründen yüklenir (mesaj id'si = klasör).
    // İmzalı URL'ler 1 saatte geçersiz olduğu için her çizimde yeniden alınır.
    if (window.NCAttach) {
      rows.filter(m => Number(m.attachment_count) > 0).forEach(m => {
        const mountId = _thread.pfx + 'Msg' + String(m.id).replace(/[^A-Za-z0-9_-]/g, '');
        if (document.getElementById(mountId)) NCAttach.load(m.id, mountId);
      });
    }
  }

  function _dayLabel(day) {
    const d = new Date(day + 'T00:00:00');
    if (isNaN(d.getTime())) return day;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (diff === 0) return _t('Bugün');
    if (diff === 1) return _t('Dün');
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function timeHM(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  async function sendFromThread() {
    if (!_thread) return;
    const id = _ids(_thread.pfx);
    const input = document.getElementById(id.input);
    const btn = document.getElementById(id.send);
    const text = input ? input.value.trim() : '';
    const msgId = _thread.draftId;
    const nAttach = _attachCount(id.mount);
    if (!text && !nAttach) { _notify(_t('Mesaj boş olamaz.')); return; }
    if (btn) btn.disabled = true;
    try {
      await _insert(_thread, text, msgId, nAttach);
      if (input) { input.value = ''; input.style.height = 'auto'; }
      // Sonraki mesaj için YENİ ek klasörü — eski görseller yeni mesaja
      // bağlı görünmesin (NCAttach klasör başına en fazla 6 dosya).
      _thread.draftId = uuid();
      _mountThreadAttach();
      _loadThread();
      refreshBell();
      refreshDealBadge(_thread.dealId);
    } catch (e) {
      _notify(_t('Gönderilemedi: ') + e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── a) Deal penceresi içine gömülü sohbet ──────────────────────────────
  // Ayrı popup AÇILMIYOR: deal penceresinin kendisi sohbete dönüşüyor,
  // sol üstteki geri oku detaylara döndürüyor (kullanıcı talebi).
  function mountInline(hostId, ctx, onBackExpr) {
    const host = document.getElementById(hostId);
    if (!host) return;
    renderChat(host, ctx, { prefix: 'nccInline', header: 'back', onBack: onBackExpr || '' });
  }

  // ── b) Kendi başına açılan pencere (çan / dock "Geçmiş") ───────────────
  function _ensureThreadModal() {
    if (document.getElementById('nccThreadModal')) return;
    const el = document.createElement('div');
    el.id = 'nccThreadModal';
    el.className = 'ncc-thread-modal';
    el.innerHTML = `
      <div class="ncc-thread-bg" onclick="NCClinicChat.closeThread()"></div>
      <div class="ncc-thread-box" id="nccThreadHost"></div>`;
    document.body.appendChild(el);
    document.addEventListener('keydown', (e) => {
      const m = document.getElementById('nccThreadModal');
      if (e.key === 'Escape' && m && m.classList.contains('open')) closeThread();
    });
  }

  function openThread(ctx) {
    _ensureThreadModal();
    const host = document.getElementById('nccThreadHost');
    renderChat(host, ctx, { prefix: 'nccModal', header: 'close' });
    document.getElementById('nccThreadModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeThread() {
    const el = document.getElementById('nccThreadModal');
    if (el) el.classList.remove('open');
    _thread = null;
    // Alarm/deal penceresi hâlâ açıksa kilidi koru — yoksa arka plan kayardı.
    const alarmOpen = document.getElementById('alarmModal');
    const dealOpen = document.getElementById('dealModal');
    const stillOpen = (alarmOpen && alarmOpen.classList.contains('open')) ||
                      (dealOpen && dealOpen.classList.contains('open'));
    document.body.style.overflow = stillOpen ? 'hidden' : '';
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
  //
  // onclick DIŞARIDAN veriliyor (ctx.onClick): deal penceresi bunu ayrı bir
  // popup açmak için DEĞİL, kendi içinde sohbet paneline geçmek için
  // kullanıyor (kullanıcı talebi: üst üste popup açılmasın). Verilmezse
  // eskisi gibi kendi penceresini açar.
  function renderIconButton(ctx) {
    const onClick = ctx.onClick || 'NCClinicChat.openThreadFromEl(this)';
    return `
      <button type="button" class="ncc-icon-btn" id="nccDealMsgBtn"
        data-deal-id="${esc(ctx.dealId || '')}"
        data-deal-name="${esc(ctx.dealName || '')}"
        data-team="${esc(ctx.team || '')}"
        onclick="${esc(onClick)}"
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
    init, clinicContact, aftercareOwner,
    // dock
    renderDock, dockAction, openComposer, closeComposer, openThreadFromDock,
    // sohbet — tek render yolu, iki host (gömülü / kendi penceresi)
    renderChat, mountInline, openThread, openThreadFromEl, closeThread, sendFromThread,
    // deal ikonu
    renderIconButton, refreshDealBadge,
    // çan
    renderBell, refreshBell, toggleBell, closeBell, openFromBell, markAllRead,
  };
})();
