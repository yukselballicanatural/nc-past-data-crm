// ── Sahip → güncel takım ──────────────────────────────────────────────
// Bir deal/alarm satırının HANGİ TAKIMA AİT olduğunu artık satırdaki `team`
// alanı değil, SAHİBİNİN GÜNCEL TAKIMI belirliyor.
//
// NEDEN
// deals.team ve alarms.team, kaydın oluştuğu ANDAKİ takımı taşıyor ve bir
// daha güncellenmiyor. Kişi takım değiştirdiğinde (danışmanken başka bir
// takıma lider olmak gibi) tüm geçmişi eski takımın adıyla kalıyor:
//   * kişi kendi müşterilerini kendi panelinde göremiyor,
//   * eski takım lideri artık kendisine ait olmayan kayıtları görüyor,
//   * admin'de sayılar eski takıma yazılıyor.
// Canlı vaka: Marco Rahimi Farah Team'de danışmanken Moutaharrik Team'in
// lideri oldu; 56 deal'inin 55'i ve 43 alarmının tamamı "Farah Team - Morocco"
// diyordu.
//
// Dizin api/team-members.js'ten geliyor (yalnızca ad + kanonik takım; telefon/
// e-posta yok) ve KAPSAMDAN BAĞIMSIZ: Farah'ın paneli de Marco'nun artık
// Moutaharrik'te olduğunu bilmek zorunda, yoksa onun satırlarını listesinden
// düşüremez.
window.NCOwnerTeam = (function () {
  const SS_KEY = 'nc_owner_team_dir_v1';
  const TTL = 10 * 60 * 1000;

  let _map = null;          // nameKey -> kanonik takım
  let _loadedAt = 0;
  let _inflight = null;

  function nameKey(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function _apply(list) {
    const m = new Map();
    for (const row of (list || [])) {
      const k = nameKey(row && row.name);
      if (k && row.team) m.set(k, row.team);
    }
    _map = m;
    _loadedAt = Date.now();
    return m;
  }

  // Oturum deposundan anında ısın — ilk render ağı beklemesin.
  (function bootFromSession() {
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (o && Array.isArray(o.list) && (Date.now() - (o.at || 0)) < TTL) {
        _apply(o.list);
        _loadedAt = o.at;
      }
    } catch (e) {}
  })();

  function isFresh() { return !!_map && (Date.now() - _loadedAt) < TTL; }

  // Dizini yükler. Aynı anda birden çok çağrı gelirse tek istek yapılır.
  function load(token, force) {
    if (!force && isFresh()) return Promise.resolve(_map);
    if (_inflight) return _inflight;
    _inflight = (async () => {
      try {
        const r = await fetch('/api/team-members', {
          headers: { Authorization: 'Bearer ' + (token || '') },
          cache: 'no-store',
        });
        if (!r.ok) return _map;           // eldeki (varsa) korunur
        const data = await r.json().catch(() => null);
        if (!data || !Array.isArray(data.directory)) return _map;
        const m = _apply(data.directory);
        try {
          sessionStorage.setItem(SS_KEY, JSON.stringify({ at: _loadedAt, list: data.directory }));
        } catch (e) {}
        return m;
      } catch (e) {
        return _map;
      } finally {
        _inflight = null;
      }
    })();
    return _inflight;
  }

  // Kişinin güncel takımı — bilinmiyorsa null.
  function teamOf(ownerName) {
    if (!_map) return null;
    return _map.get(nameKey(ownerName)) || null;
  }

  // Satırın ait olduğu takım. Dizin yüklenmediyse ya da sahip tanınmıyorsa
  // satırdaki `team` değerine düşer — yani dizin yoksa DAVRANIŞ ESKİSİ GİBİ.
  // Bu bilinçli: dizin gelmediği için kimsenin verisi kaybolmasın.
  function effectiveTeam(row, canonicalize) {
    if (!row) return '';
    const own = teamOf(row.deal_owner);
    if (own) return own;
    const raw = row.team || '';
    return canonicalize ? (canonicalize(raw) || raw) : raw;
  }

  function ready() { return !!_map; }
  function size() { return _map ? _map.size : 0; }

  return { load, teamOf, effectiveTeam, ready, size, isFresh, nameKey };
})();
