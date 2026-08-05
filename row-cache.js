// ── Satır önbelleği (IndexedDB) ───────────────────────────────────────
// Büyük ve BÜYÜK ÖLÇÜDE DEĞİŞMEYEN satır kümeleri için kalıcı depo.
//
// NEDEN
// "Kapatılan Alarmlar" sayfası her açılışta ~21.000 satırı 21 ayrı sayfalı
// istekle yeniden indiriyordu. Kapanmış bir alarm bir daha değişmiyor —
// aynı veriyi her oturumda yeniden çekmek saf israf. Sayfa "çok çok çok
// sonra" açılıyordu ve menü rozeti de bu indirmeye bağlı olduğu için
// sayfaya girilmeden hiç görünmüyordu.
//
// NEDEN localStorage DEĞİL
// 21.000 satır ~4-5 MB; localStorage'ın ~5 MB kotasına sığmıyor ve
// senkron olduğu için yazarken ana iş parçacığını kilitliyor.
//
// NEDEN "sonsuza kadar güven" DEĞİL
// Önbellek sessizce gerçeklikten kopabilir (satır silinmiş, kapalı alarm
// yeniden açılmış). Bu yüzden çağıran taraf her senkronda sunucudaki TOPLAM
// SAYIYI kontrol eder ve uyuşmazsa sıfırdan indirir — bkz. admin.html
// _amEnsureClosedAlarms. Önbellek bir hız katmanı, doğruluk kaynağı değil.
window.NCRowCache = (function () {
  const DB_NAME = 'nc_row_cache';
  const DB_VERSION = 1;
  const STORE = 'sets';

  // Kullanılamıyorsa (gizli sekme, kota reddi, eski tarayıcı) her çağrı
  // sessizce "önbellek yok" döner ve çağıran eski davranışa düşer.
  const supported = (() => {
    try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (e) { return false; }
  })();

  let _dbPromise = null;
  function open() {
    if (!supported) return Promise.resolve(null);
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(resolve => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { resolve(null); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      // Başka bir sekme sürüm yükseltmesini bloklarsa süresiz beklemeyelim.
      req.onblocked = () => resolve(null);
    });
    return _dbPromise;
  }

  function tx(mode, fn) {
    return open().then(db => {
      if (!db) return null;
      return new Promise(resolve => {
        let t;
        try { t = db.transaction(STORE, mode); }
        catch (e) { resolve(null); return; }
        const store = t.objectStore(STORE);
        let result = null;
        try { fn(store, v => { result = v; }); }
        catch (e) { resolve(null); return; }
        t.oncomplete = () => resolve(result);
        t.onerror = () => resolve(null);
        t.onabort = () => resolve(null);   // kota aşımı buraya düşer
      });
    }).catch(() => null);
  }

  // { rows, meta } veya null
  function get(key) {
    return tx('readonly', (store, done) => {
      const r = store.get(key);
      r.onsuccess = () => {
        const v = r.result;
        done(v && Array.isArray(v.rows) ? v : null);
      };
    });
  }

  // true = yazıldı. Kota aşımında false — çağıran çalışmaya devam eder.
  function put(key, rows, meta) {
    return tx('readwrite', (store, done) => {
      const r = store.put({ rows, meta: meta || {}, savedAt: Date.now() }, key);
      r.onsuccess = () => done(true);
    }).then(v => v === true);
  }

  function clear(key) {
    return tx('readwrite', (store, done) => {
      const r = store.delete(key);
      r.onsuccess = () => done(true);
    }).then(v => v === true);
  }

  return { supported, get, put, clear };
})();
