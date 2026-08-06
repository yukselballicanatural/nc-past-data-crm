// Sistemden ÇIKARILMIŞ kişiler — tek doğruluk kaynağı.
//
// Neden bir liste, neden satır silmek değil:
//   * Users satırını silmek geçmiş veriye (daily_performance, alarm_logs,
//     deals.deal_owner) bağlı kayıtları yetim bırakır; silmek yerine
//     GÖRÜNMEZ + GİRİŞ YAPAMAZ hâle getiriyoruz.
//   * Kadro Zoho aynasından (zoho_users) besleniyor ve dış senkron bu kişileri
//     tekrar yazabilir. Panelde elle silmek kalıcı çözüm DEĞİL: bir sonraki
//     senkronda geri gelirler. Bu liste sunucu tarafında olduğu için geri
//     gelemezler.
//
// Bu dosyayı kullanan uçlar:
//   api/admin-users.js    → Users listesinden düşer, yeniden oluşturulamaz
//   api/login.js          → giriş reddedilir (satır dursa bile)
//   api/team-members.js   → kadro/Günlük Ekip Girişi listelerinde görünmez
//
// Eşleştirme AD üzerinden yapılır çünkü aynı kişi Users'ta "Jamari.West",
// zoho_users'ta "Jamari West" olarak duruyor; id'ler iki tabloda tutmuyor.

// Ad karşılaştırma anahtarı — panellerdeki/uçlardaki nameKey ile AYNI kural,
// ek olarak nokta/alt çizgi boşluğa çevrilir ("Jamari.West" → "jamari west").
export function blockKey(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Çıkarılan kişiler. Yeni bir ad eklemek için buraya yazmak YETER.
export const BLOCKED_NAMES = [
  'Jamari West',
  'Juan Garcia',
  'Rim El Amrani',
];

const BLOCKED = new Set(BLOCKED_NAMES.map(blockKey));

// Verilen adlardan HERHANGİ BİRİ engelliyse true. Çağıranlar hem görünen adı
// hem kullanıcı adını geçirir; ikisinden biri tutarsa kişi engellidir.
export function isBlocked(...names) {
  for (const n of names) {
    const k = blockKey(n);
    if (k && BLOCKED.has(k)) return true;
  }
  return false;
}
