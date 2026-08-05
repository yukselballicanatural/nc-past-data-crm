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

  // ── Alarm TİPİ de donuyor ─────────────────────────────────────────────
  // alarms.alarm_type alarm ÜRETİLDİĞİ anda yazılıyor ve motor
  // ignore-duplicates ile yazdığı için (dedup_key eşik/tip içermiyor) bir daha
  // güncellenmiyor. Sonuç, canlı veride ölçüldü (2026-08-05):
  //
  //   reference_date == bugün olan aktif alarm      :  9
  //   alarm_type == 'today_patient' taşıyan aktif   : 47
  //   o 9 satırın TAŞIDIĞI etiket: arrival_approaching 8, visit_approaching 1
  //
  // Yani "Bugün Gelecek" tipine göre filtre atmak 38 yanlış satır getirip
  // bugün gelecek 9 hastanın HİÇBİRİNİ getirmiyordu. Etiket yalnızca alarmın
  // DOĞDUĞU gün doğru; sonra fosilleşiyor.
  //
  // Motora kalıcı düzeltme eklendi (AlarmEngine.syncAlarmTypes) ama panel
  // etiketi hiçbir zaman depolanan değere güvenmemeli — tarih bazlı tipler
  // her zaman reference_date'ten hesaplanır.
  const DATE_TYPES = new Set(['today_patient', 'arrival_approaching', 'visit_approaching']);

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(String(dateStr).split('T')[0] + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  }

  function isToday(a) {
    return !!(a && a.reference_date && daysUntil(a.reference_date) === 0);
  }

  // Alarmın GERÇEK tipi. arrival_missing tarihe bağlı değil, olduğu gibi kalır.
  function effectiveType(a) {
    const t = (a && a.alarm_type) || '';
    if (!DATE_TYPES.has(t)) return t;
    const d = daysUntil(a.reference_date);
    if (d === null) return t;
    if (d === 0) return 'today_patient';
    // Geçmiş tarihte de "yaklaşan" döner; iki panel de gecikmişi ayrıca
    // (isOverdue) tespit edip etiketi "Gecikmiş"e çeviriyor.
    return a.reference_field === 'arrival_date' ? 'arrival_approaching' : 'visit_approaching';
  }

  return {
    OPEN: OPEN, ACTIONED: ACTIONED, ACTIVE: ACTIVE, CLOSED: CLOSED,
    DATE_TYPES: DATE_TYPES,
    daysUntil: daysUntil, isToday: isToday, effectiveType: effectiveType,
    // Kümeler dışarıda mutasyona uğramasın diye kopya döner
    openSet: function () { return new Set(OPEN); },
    activeSet: function () { return new Set(ACTIVE); },
    isOpen: function (s) { return openSet.has(s); },
    isActioned: function (s) { return actionedSet.has(s); },
    isActive: function (s) { return activeSet.has(s); },
  };
})();
