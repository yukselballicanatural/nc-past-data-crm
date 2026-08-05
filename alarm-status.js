// alarm-status.js — Alarm durum kümelerinin TEK kaynağı.
//
// NEDEN VAR: aynı alarm kümesi iki panelde farklı sayılıyordu. Ahmed Anwar
// takımı için admin "Açık Alarm" 109, takım liderinin panelinde "Açık" 106
// gösteriyordu. Sebep senkron değil TANIM farkıydı — canlı veriyle ölçüldü:
//
//   open        106      <- takım liderinin "Açık" sekmesi (open + seen)
//   arrived       3      <- admin bunları da "Açık Alarm"a katıyordu
//   ------------------
//   toplam      109      <- adminin mk1 KPI'ı
//
// Üstelik admin içinde ÜÇ ayrı "açık" tanımı dolaşıyordu:
//   * mk1 KPI            : 7 aktif durumun tamamı
//   * Durum=Açık filtresi: yalnızca 'open' ('seen' düşüyordu)
//   * bölge paneli       : aktif eksi arrived/examined
// Bu yüzden kümeler artık burada tanımlı; her iki panel de buradan okur.
// Yeni bir durum eklenecekse SADECE burası değişir.
window.AlarmStatus = (function () {
  'use strict';

  // Henüz kimsenin dokunmadığı alarm: takip edilmesi gereken iş.
  const OPEN = ['open', 'seen'];

  // Üzerinde aksiyon alınmış ama kapanmamış: hasta geldi / muayenede /
  // işlemlerde. İş bitmedi ama "açık alarm" da değil.
  const ACTIONED = ['in_progress', 'arrived', 'examined', 'processing', 'escalated'];

  // Kapanmamış olan her şey. "Aktif" = OPEN + ACTIONED.
  const ACTIVE = OPEN.concat(ACTIONED);

  // Kapanmış durumlar — hiçbir aktif sayaca girmez.
  const CLOSED = ['closed', 'cancelled', 'no_show'];

  const openSet = new Set(OPEN);
  const activeSet = new Set(ACTIVE);
  const actionedSet = new Set(ACTIONED);

  return {
    OPEN: OPEN, ACTIONED: ACTIONED, ACTIVE: ACTIVE, CLOSED: CLOSED,
    // Kümeler dışarıda mutasyona uğramasın diye kopya döner
    openSet: function () { return new Set(OPEN); },
    activeSet: function () { return new Set(ACTIVE); },
    isOpen: function (s) { return openSet.has(s); },
    isActioned: function (s) { return actionedSet.has(s); },
    isActive: function (s) { return activeSet.has(s); },
  };
})();
