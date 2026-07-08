// ── Natural Clinic CRM — TR / EN dil sistemi ─────────────────────────
// Tüm panellerde (team-leader, admin, agent) ortak kullanılır.
// Statik HTML metni: sayfa yüklenince DOM'daki metin node'ları, placeholder
// ve title attribute'ları sözlükten eşleşen tam metinlerle değiştirilir.
// Dinamik metin (JS içinde üretilen etiket/rozet/bildirim): ilgili sayfanın
// kendi kodunda I18N.t('Türkçe metin') şeklinde sarmalanır.
(function (global) {
  var STORAGE_KEY = 'nc_lang';

  // Türkçe metin -> İngilizce çeviri. Anahtar bulunamazsa orijinal metin
  // aynen kullanılır (zaten İngilizce olan metinler için ekstra kayıt gerekmez).
  var DICT = {
    // ── Ortak / genel ──────────────────────────────────────────────
    'Navigation': 'Navigation',
    'Logout': 'Logout',
    'Takım': 'Team',
    'Tarih': 'Date',
    'Durum': 'Status',
    'Aksiyon': 'Action',
    'İşlem': 'Action',
    'İşlem Tipi': 'Action Type',
    'Tümü': 'All',
    'İptal': 'Cancel',
    'Kaydet': 'Save',
    'Kapat': 'Close',
    'Kapatıldı': 'Closed',
    'Açık': 'Open',
    'Gecikmiş': 'Overdue',
    'Görüldü': 'Seen',
    'Yaklaşan': 'Upcoming',
    'Tamamlandı': 'Completed',
    'Toplam': 'Total',
    'Kalan': 'Remaining',
    'Bölge': 'Region',
    'Danışman': 'Consultant',
    'Hasta': 'Patient',
    'Rol': 'Role',
    'Sayfa': 'Page',
    'Zaman': 'Time',
    'Arama': 'Search',
    'Payment': 'Payment',
    'Flight Ticket': 'Flight Ticket',
    'Export CSV': 'Export CSV',
    'Deal ID': 'Deal ID',
    'Stage': 'Stage',
    'Team Leader': 'Team Leader',
    'Yükleniyor...': 'Loading...',

    // ── team-leader.html ───────────────────────────────────────────
    '(isteğe bağlı)': '(optional)',
    '100 / sayfa': '100 / page',
    '1000 / sayfa': '1000 / page',
    '15 Gün': '15 Days',
    '3 Gün': '3 Days',
    '30 Gün': '30 Days',
    '45 Gün': '45 Days',
    '500 / sayfa': '500 / page',
    '7 Gün': '7 Days',
    'Aksiyon Geçmişi': 'Action History',
    'Aktif Alarmlar': 'Active Alarms',
    'Aktivite Yok': 'No Activity',
    'Alan': 'Field',
    'Alarm Eşiği': 'Alarm Threshold',
    'Alarm Tarihi': 'Alarm Date',
    'Alarm Tipi': 'Alarm Type',
    'Alarm bulunamadı.': 'No alarm found.',
    'Alarm Özeti': 'Alarm Summary',
    'Alarmlar': 'Alarms',
    'Alarmlar yükleniyor...': 'Loading alarms...',
    'Alarmları Güncelle': 'Refresh Alarms',
    'Açık Alarm': 'Open Alarm',
    'Bu deallar Payment türünde ancak henüz Last Activity Time girilmemiş. Takibe alınması önerilir.':
      'These deals are Payment type but Last Activity Time has not been entered yet. Follow-up is recommended.',
    'Bu sekmede alarm bulunamadı.': 'No alarms found in this tab.',
    'Bu takım için aktif alarm bulunamadı.': 'No active alarms found for this team.',
    'Bugün': 'Today',
    'Bugün Gelecek': 'Arriving Today',
    'Bugün Gelecek Hastalar': 'Patients Arriving Today',
    'Bugün Gelecekler': "Today's Arrivals",
    'Bugün için programlanmış hasta bulunamadı.': 'No patients scheduled for today.',
    'Danışman Bazlı Alarmlar': 'Alarms by Consultant',
    'Danışman filtrele...': 'Filter by consultant...',
    'Deal Listesi': 'Deal List',
    'Deal bulunamadı.': 'No deals found.',
    'Deallar': 'Deals',
    'Deallar yükleniyor...': 'Loading deals...',
    'Eksik Tarih': 'Missing Date',
    'En Yeni Önce': 'Newest First',
    'Eskale': 'Escalated',
    'Eskale (Yöneticiye İlet)': 'Escalate (Forward to Manager)',
    'Eşik: Tümü': 'Threshold: All',
    'Gecikmiş Önce': 'Overdue First',
    'Gelemedi (No-show)': 'No-show',
    'Gelemedi Tarihi': 'No-show Date',
    'Gelemedi olarak işaretlenen hastalar': 'Patients marked as no-show',
    'Hasta / Danışman': 'Patient / Consultant',
    'Hasta / danışman ara...': 'Search patient / consultant...',
    'Hasta Adı': 'Patient Name',
    'Hasta Geldi': 'Patient Arrived',
    'Hasta durumu, arama sonucu, notlar...': 'Patient status, call result, notes...',
    'Hasta veya danışman ara...': 'Search patient or consultant...',
    'Hasta, danışman ara...': 'Search patient, consultant...',
    'Kalan Gün': 'Days Left',
    'Kalan Gün (Acil Önce)': 'Days Left (Urgent First)',
    'Kapatma Sebebi': 'Close Reason',
    'Manuel Kapatma': 'Manual Close',
    'Mevcut Not': 'Existing Note',
    'Muayene Oldu': 'Examined',
    'No-show Raporu': 'No-show Report',
    'No-show kaydı bulunamadı.': 'No no-show record found.',
    'Not': 'Note',
    'P / FT: Tümü': 'P / FT: All',
    'P/F': 'P/F',
    'P/FT': 'P/FT',
    'Payment türünde aktivitesiz deal bulunamadı.': 'No inactive Payment-type deals found.',
    'Planlanan Tarih': 'Planned Date',
    'Ref Alan': 'Ref Field',
    'Referans Alan': 'Reference Field',
    'Referans Tarih': 'Reference Date',
    'Son Aktivite': 'Last Activity',
    'Sonraki →': 'Next →',
    'Takipte': 'In Progress',
    'Takım Performansı': 'Team Performance',
    'Takımın aktif dealleri': "Team's active deals",
    'Takımın açık alarm kayıtları': "Team's open alarm records",
    'Tarih Eklendi': 'Date Added',
    'Danışman: Tümü': 'Consultant: All',
    'Eklenme Tarihi': 'Date Added',
    'Danışman Notu': 'Consultant Note',
    'Lead Kaynağı': 'Lead Source',
    'Sonuç Kodu': 'Result Code',
    'Onay Durumu': 'Approval Status',
    'Kişi Bilgileri': 'Contact Info',
    'İletişim': 'Contact',
    'E-posta': 'Email',
    'Pasaport': 'Passport',
    'Ülke': 'Country',
    'Dil': 'Language',
    'Yetişkin / Çocuk': 'Adults / Children',
    'Yolcu Sayısı': 'Passenger Count',
    'Tarihler': 'Dates',
    'Seyahat / Otel': 'Travel / Hotel',
    'Otel': 'Hotel',
    'Oda Tipi': 'Room Type',
    'Check-in / Check-out': 'Check-in / Check-out',
    'Varış Uçuşu': 'Arrival Flight',
    'Dönüş Uçuşu': 'Return Flight',
    'Varış Havalimanı': 'Arrival Airport',
    'Dönüş Havalimanı': 'Return Airport',
    'Transfer Tipi': 'Transfer Type',
    'Doktor': 'Doctor',
    'Finans': 'Finance',
    'Ekip': 'Team',
    'Süpervizör': 'Supervisor',
    'Tercüman': 'Translator',
    'Notlar': 'Notes',
    'Var': 'Yes',
    'Yok': 'No',
    'Toplamlar hesaplanıyor...': 'Calculating totals...',
    'Toplam Deal': 'Total Deals',
    'Toplam Tutar': 'Total Amount',
    'Toplamlar yüklenemedi: ': 'Failed to load totals: ',
    '1. Vizit': '1st Visit',
    '2. Vizit': '2nd Visit',
    '3. Vizit': '3rd Visit',
    'Tutar': 'Amount',
    'Tüm Bölge Alarmları': 'All Region Alarms',
    'Tüm Durumlar': 'All Statuses',
    'Tüm Stageler': 'All Stages',
    'Tüm Takımlar': 'All Teams',
    'Tümü (Payment / FT)': 'All (Payment / FT)',
    'Tür': 'Type',
    'Yeni Durum': 'New Status',
    'Yenile': 'Refresh',
    'Yönetim Özeti': 'Management Overview',
    'Ödeme': 'Payment',
    'Ödenen': 'Paid',
    'İptal / Geçersiz': 'Cancel / Invalid',
    'İsme Göre A-Z': 'Name A-Z',
    'İşlemleri Yapılıyor': 'Being Processed',
    '— Durum seçin —': '— Select status —',
    '← Önceki': '← Previous',
    '↻ Yenile': '↻ Refresh',
    'İşlemlerde': 'Processing',

    // ── team-leader.html dinamik etiket/rozet/bildirimler ──────────
    'Geri Al': 'Undo',
    'İptal Edilenler': 'Cancelled',
    'İptal edilmiş alarm kayıtları': 'Cancelled alarm records',
    'İptal edilmiş kayıt bulunamadı.': 'No cancelled records found.',
    'İptal Tarihi': 'Cancellation Date',
    'Sebep': 'Reason',
    'Güncelle': 'Update',
    'Eksik Tarih:': 'Missing Date:',
    'Vizit Yaklaşıyor': 'Visit Approaching',
    'Arrival Yaklaşıyor': 'Arrival Approaching',
    'Tarih Eksik': 'Missing Date',
    'Payment Takip': 'Payment Tracking',
    'gün': 'days',
    'GECİKMİŞ': 'OVERDUE',
    'BUGÜN': 'TODAY',
    'Muayene': 'Examination',
    'İşlemlerde': 'Processing',
    'Gelemedi': 'No-show',
    'Aksiyon geri alındı.': 'Action undone.',
    'Alarm güncellendi.': 'Alarm updated.',
    'Alarmlar yüklenemedi: ': 'Failed to load alarms: ',
    'Hata: ': 'Error: ',
    'Uyarı: Kullanıcı kayıtında Takim Adi alanı boş. Tüm alarmlar gösterilecek.':
      'Warning: The Team Name field is empty on this user record. All alarms will be shown.',
    'Alarm motoru hatası: ': 'Alarm engine error: ',
    'Durum seçin veya not girin.': 'Select a status or enter a note.',
    'Kayıt hatası: ': 'Save error: ',
    'Güncellendi.': 'Updated.',
    'Deallar yüklenemedi: ': 'Failed to load deals: ',
    'Aktivite Yok listesi yüklenemedi: ': 'Failed to load No Activity list: ',
    'Alarm eskale edildi.': 'Alarm escalated.',
    'Eskale hatası: ': 'Escalation error: ',
    'yeni alarm oluştu': 'new alarm(s) created',
    'Motor tamamlandı:': 'Engine finished:',
    'deal,': 'deals,',
    'alarm kontrol edildi': 'alarms checked',
    'Motor hatası: ': 'Engine error: ',
    'Parametreler yükleniyor...': 'Loading parameters...',
    'Aktif deallar alınıyor...': 'Fetching active deals...',
    'deal için alarm hesaplanıyor...': 'deals — calculating alarms...',
    'alarm kaydediliyor (dedup aktif)...': 'alarms — saving (dedup active)...',
    'Tarih girilen alarmlar kapatılıyor...': 'Closing alarms with dates now entered...',
    'İptal olan dealler için alarmlar kapatılıyor...': 'Cancelling alarms for cancelled deals...',
    'Son çalıştırma:': 'Last run:',
    'deal gösteriliyor': 'deals shown',
    'alarm gösteriliyor': 'alarms shown',
    'kayıt': 'records',
    'takımı alarmları': "team's alarms",
    'bölgesi alarmları': 'region alarms',
    'alarmları': 'alarms',
    'Kalan Kalan': 'Remaining',
    'Won ama ödeme %': 'Won but payment only %',
    ' — tamamlanmadı': ' — not complete',
    'Ödeme %100 ama stage Won değil': 'Payment 100% but stage is not Won',
    'Ödeme %100 ve deal Won — otomatik kapatıldı': 'Payment 100% and deal Won — auto-closed',
    'gün eşiği': 'day threshold',
    'gün sonra tetiklendi': 'days after it was triggered',
    'gün kala alarm üretildi': 'days before, alarm was generated',
    'Son aktiviteden': 'Since last activity,',

    // ── admin.html ──────────────────────────────────────────────────
    'Natural Clinic Takım Lideri Alarm Takip Sistemi': 'Natural Clinic Team Leader Alarm Tracking System',
    'Aktif (kapalı hariç)': 'Active (excluding closed)',
    'Alarm Listesi': 'Alarm List',
    'Alarm Parametreleri': 'Alarm Parameters',
    'Bugün Gelemeyen': 'Not Arriving Today',
    'Bölge / Takım': 'Region / Team',
    'Bölge Performans CSV': 'Region Performance CSV',
    'Data Görüntüleme': 'Data View',
    'Deal Görüntüleme': 'Deal View',
    'Deal adı, detay...': 'Deal name, detail...',
    'Eksik tarih tekrarı (gün):': 'Missing-date repeat (days):',
    'Eşik günleri ve eksik tarih tekrar periyodu — motor bir sonraki çalışmada uygular':
      'Threshold days and missing-date repeat period — the engine applies these on its next run',
    'Eşikler (gün):': 'Thresholds (days):',
    'FT Takip': 'FT Tracking',
    'Hasta, danışman...': 'Patient, consultant...',
    'Istanbul Bölgesi': 'Istanbul Region',
    'Kayıt / Kilitle': 'Record / Lock',
    'Kullanıcı': 'User',
    'Kullanıcı Düzenle': 'Edit User',
    'Kullanıcı Ekle': 'Add User',
    'Log bulunamadı.': 'No log found.',
    'Loglar yükleniyor...': 'Loading logs...',
    'Morocco Bölgesi': 'Morocco Region',
    'Onayla': 'Approve',
    'Referans tarih başlangıç': 'Reference date start',
    'Referans tarih bitiş': 'Reference date end',
    'Sistem Logları': 'System Logs',
    'Takım ara...': 'Search team...',
    'Takım seçin veya yazın...': 'Select or type team...',
    'TL Notu': 'TL Note',
    'TL Performans CSV': 'TL Performance CSV',
    'Tüm Bölgeler': 'All Regions',
    "Tüm Deal Owner'lar": 'All Deal Owners',
    'Tüm Sistemi Güncelle': 'Refresh Entire System',
    "Tüm Team Leader'lar": 'All Team Leaders',
    'Tüm Tipler': 'All Types',
    'Tüm bölgeler — sistem geneli alarm durumu': 'All regions — system-wide alarm status',
    'Unlock Onay': 'Unlock Approve',
    'Unlock Red': 'Unlock Reject',
    'Unlock Talebi': 'Unlock Request',
    'app_settings tablosu bulunamadı — alarm_logs_and_settings.sql dosyasını Supabase SQL Editor\'de çalıştırın.':
      'app_settings table not found — run the alarm_logs_and_settings.sql file in the Supabase SQL Editor.',
    'Eşik': 'Threshold',
    'Kapatma Oranı %': 'Close Rate %',
    'Kapatılan': 'Closed Count',
    'Oluşturma': 'Created',
    'Yükleme hatası:': 'Load error:',
    'alarm-engine.js yüklenmemiş': 'alarm-engine.js is not loaded',
    'İşlem başarısız:': 'Action failed:',
    'adlı kullanıcı kalıcı olarak silinecek. Bu işlem geri alınamaz.':
      'will be permanently deleted. This action cannot be undone.',
    'Kullanıcı silindi:': 'User deleted:',
    'silindi.': 'deleted.',
    'Unlock onaylandı:': 'Unlock approved:',
    'Admin deal görüntüledi:': 'Admin viewed deal:',
    'Önceki kapanış:': 'Previous closure:',
    'Admin kullanıcıları yalnızca Super Admin silebilir.': 'Only a Super Admin can delete admin users.',
    'Kullanıcıyı Sil': 'Delete User',
    'adlı kullanıcı kalıcı olarak silinecek. Bu işlem geri alınamaz.':
      'will be permanently deleted. This action cannot be undone.',
    'Sil': 'Delete',
    'silindi.': 'deleted.',
    'Silme başarısız: ': 'Delete failed: ',
    'Bu log için geri alınacak veri yok.': 'No data to restore for this log.',
    'Geri alma başarısız: ': 'Restore failed: ',
    'Logu Geri Al': 'Undo Log',
    'için': 'for',
    'işlemi geri alınacak.': 'action will be undone.',
    'Geri yüklenecek değerler:': 'Values to be restored:',
    '(boş)': '(empty)',
    'Deal Görüntüle': 'View Deal',
    'Kayıt/Kilitle': 'Save/Lock',
    'Unlock Talep': 'Unlock Request',
    'Data Görüntüle': 'View Data',
    'GEÇ': 'LATE',
    'Yeniden Aç': 'Reopen',
    'Yalnızca Super Admin silebilir': 'Only a Super Admin can delete',
    'Geri Alındı': 'Undone',
    'alarm yüklendi': 'alarms loaded',
    'Tamamlandı:': 'Completed:',
    'İptal Alarmları': 'Cancelled Alarms',
    'No-show Hastalar': 'No-show Patients',
    'Bölge Performans': 'Region Performance',
    'Eşik Filtresi': 'Threshold Filter',
    '⚙️ Motor Ayarları': '⚙️ Engine Settings',
    'Motor eşikleri:': 'Engine thresholds:',
    'Eksik tarih tekrarı:': 'Missing-date repeat:',
    'İptal edilmiş alarm bulunamadı.': 'No cancelled alarms found.',
    'Durum Zaman Çizelgesi': 'Status Timeline',
    'Açık (Yeniden Aç)': 'Open (Reopen)',
    'Alarm Kapatma': 'Alarm Close',
    'Alarm Güncelleme': 'Alarm Update',
    'Alarm Hızlı Aksiyon': 'Alarm Quick Action',
    'Alarm Yeniden Aç': 'Alarm Reopen',
    'Alarm Eskale': 'Alarm Escalate',
    'Takım bulunamadı': 'No team found',

    // ── agent.html ──────────────────────────────────────────────────
    'Kaydedildi. (Not Reached — tekrar düzenlenebilir)': 'Saved. (Not Reached — can be edited again)',
    'Bu deal için aktif alarm yok.': 'No active alarm for this deal.',
    'kayıt gösteriliyor': 'records shown',
    'Son aktivite girilmemiş': 'No last activity entered',
    'Eskale Et': 'Escalate',
    'ESKALE': 'ESCALATED',
    'Toplam Aktif': 'Total Active',
    'Oluşturuldu': 'Created',
    'Aksiyon Alındı': 'Action Taken',
    'Henüz aksiyon yok.': 'No action yet.',
    'Durum Değişti': 'Status Changed',
    'Not Eklendi': 'Note Added',
    'Yeniden Açıldı': 'Reopened',
    'Otomatik Kapatıldı': 'Auto-closed',
    'Kaydediliyor...': 'Saving...',
    'Bölgesi — Tüm Alarm Özeti': 'Region — Full Alarm Summary',
    'Güncellendi:': 'Updated:',
    'Bölgede takım bulunamadı.': 'No team found in this region.',
    'aktif alarm': 'active alarms',
    'Kapatılan:': 'Closed:',
    'Kapatma oranı %': 'Close rate %',
    'AÇIK': 'OPEN',
    'EKSİK': 'MISSING',
    'TAKİP': 'TRACKING',
  };

  function getLang() {
    try { return global.localStorage.getItem(STORAGE_KEY) || 'tr'; }
    catch (e) { return 'tr'; }
  }

  function setLang(lang) {
    try { global.localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  }

  function t(str) {
    if (getLang() !== 'en') return str;
    if (str == null) return str;
    var key = String(str);
    if (Object.prototype.hasOwnProperty.call(DICT, key)) return DICT[key];
    var trimmed = key.trim();
    if (trimmed !== key && Object.prototype.hasOwnProperty.call(DICT, trimmed)) {
      return key.replace(trimmed, DICT[trimmed]);
    }
    // "Sabit önek: " + dinamik değer şeklindeki mesajlar için önek eşleşmesi
    for (var k in DICT) {
      if ((k.slice(-2) === ': ' || k.slice(-1) === ':') && key.indexOf(k) === 0) {
        return DICT[k] + key.slice(k.length);
      }
    }
    return str;
  }

  // Statik DOM metnini çevir: text node'lar + placeholder/title attribute'ları.
  function translateDOM(root) {
    if (getLang() !== 'en') return;
    root = root || global.document.body;
    var walker = global.document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    var toChange = [];
    while ((node = walker.nextNode())) {
      var raw = node.nodeValue;
      var trimmed = raw.trim();
      if (!trimmed) continue;
      if (Object.prototype.hasOwnProperty.call(DICT, trimmed)) {
        toChange.push([node, raw.replace(trimmed, DICT[trimmed])]);
      }
    }
    toChange.forEach(function (pair) { pair[0].nodeValue = pair[1]; });

    ['placeholder', 'title'].forEach(function (attr) {
      var els = root.querySelectorAll('[' + attr + ']');
      els.forEach(function (el) {
        var v = el.getAttribute(attr);
        if (v && Object.prototype.hasOwnProperty.call(DICT, v)) {
          el.setAttribute(attr, DICT[v]);
        }
      });
    });
  }

  function toggle() {
    setLang(getLang() === 'en' ? 'tr' : 'en');
    global.location.reload();
  }

  function renderToggleButton() {
    var lang = getLang();
    return '' +
      '<div style="display:flex;gap:4px;padding:2px;background:#1e293b;border:1px solid #334155;border-radius:9999px">' +
      '<button onclick="I18N.setLangAndReload(\'tr\')" style="flex:1;padding:6px 0;border:none;border-radius:9999px;font-size:10px;font-weight:800;cursor:pointer;background:' + (lang === 'tr' ? '#0d9488' : 'transparent') + ';color:' + (lang === 'tr' ? '#fff' : '#64748b') + '">TR</button>' +
      '<button onclick="I18N.setLangAndReload(\'en\')" style="flex:1;padding:6px 0;border:none;border-radius:9999px;font-size:10px;font-weight:800;cursor:pointer;background:' + (lang === 'en' ? '#0d9488' : 'transparent') + ';color:' + (lang === 'en' ? '#fff' : '#64748b') + '">EN</button>' +
      '</div>';
  }

  function setLangAndReload(lang) {
    if (lang === getLang()) return;
    setLang(lang);
    global.location.reload();
  }

  function init() {
    if (getLang() === 'en') translateDOM(global.document.body);
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.I18N = {
    getLang: getLang,
    setLang: setLang,
    t: t,
    translateDOM: translateDOM,
    toggle: toggle,
    setLangAndReload: setLangAndReload,
    renderToggleButton: renderToggleButton
  };
})(window);
