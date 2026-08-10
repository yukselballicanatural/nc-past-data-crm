// Takım eşleştirmesinin sunucu tarafındaki ORTAK kuralları.
//
// api/team-members.js (kadroyu listeler) ve api/sync-user-teams.js ("Zoho'ya
// göre eşleştir") aynı iki soruya aynı cevabı vermek ZORUNDA:
//   1. Bu kişi bir satış takımına ait olmalı mı? (satış dışı birimler)
//   2. Yönetici bu kişi için elle bir takım belirledi mi? (kalıcı atama)
// Bu kurallar iki dosyada kopyalanınca biri güncellenip diğeri kalıyor ve
// kadro ile senkron önerileri birbirinden ayrışıyordu. Bu yüzden tek yerde.
//
// nameKey KASITLI olarak burada da tanımlı ve çağıranlar kendi kopyasını
// kullanmaya devam ediyor: bu modül bir Map DEĞİL, ham satır döndürüyor —
// böylece çağıran anahtarı kendi nameKey'iyle kurar ve iki taraf arasında
// gizli bir kural bağı oluşmaz. Kural yine de aynı olmalı (bkz. team_assignments.sql).

// Adı karşılaştırılabilir hâle getirir: küçük harf, ardışık boşluk → tek
// boşluk, baş/son trim. team_assignments.person_key ile BİREBİR aynı kural.
export function teamNameKey(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Satış dışı birimler ────────────────────────────────────────────────
// Zoho'daki rol hiyerarşisinde satış takımı OLMAYAN düğümler. Bu rollerdeki
// kişilerin bir danışman takımına bağlanması zaten beklenmiyor — dolayısıyla
// "hiçbir takıma bağlanamadı" uyarısı onlar için bir HATA değil, gürültüydü
// (48 kişilik uyarının neredeyse tamamı bunlardı ve gerçek sorunları
// görünmez kılıyordu). Bu kişiler kadro listesinde de görünmez.
//
// Liste KAPALI uçlu tutuluyor (yalnızca bilinen birimler): Zoho'ya yeni ve
// gerçekten satış olan bir takım eklendiğinde uyarıda çıkmaya DEVAM etmeli,
// sessizce gizlenmemeli. Yeni bir satış dışı birim eklendiğinde buraya
// yazılır — ya da admin panelinden kişiye "Satış dışı" ataması yapılır.
const NON_SALES_ROLE_KEYS = new Set([
  'executive board - ceo',
  'finance',
  'quality / reports',
  'planning',
  'data entry',
  'profclinic',
  'profclinic supervisor',
  'software development',
  'information technology',
  'digital marketing',
  // Bölge müdürlerinin kendi rol düğümleri — bir takımın üyesi değiller.
  'region istanbul - benmamar',
  'regional manager morocco - yassin',
  // Hasta danışmanları (Patient Consultants) — satış danışmanı değil.
  'team 1', 'team 2', 'team 3', 'team 4',
  'team 1 consultants', 'team 2 consultants', 'team 3 consultants', 'team 4 consultants',
  // VIP birimi satış takımı olarak yönetilmiyor.
  'vip team', 'vip - team leader',
]);

// Öneki eşleşen roller (kişi adı içerdiği için tam liste tutulamaz).
const NON_SALES_ROLE_PREFIXES = [
  'translators manager',
];

// Bu rol bir satış takımına ait DEĞİL mi? (rol = zoho_users.role)
export function isNonSalesRole(role) {
  const k = teamNameKey(role);
  if (!k) return false;                       // boş rol → bilinmiyor, gizlemeyiz
  if (NON_SALES_ROLE_KEYS.has(k)) return true;
  return NON_SALES_ROLE_PREFIXES.some(p => k.startsWith(p));
}

// ── Kalıcı takım atamaları (team_assignments) ──────────────────────────
// Tablo henüz kurulmadıysa (SQL çalıştırılmadıysa) 404 döner — bu durumda
// SESSİZCE boş liste ile devam ediyoruz ki panel çalışmaya devam etsin.
// Bu, "kolon yok → sorgu 400 → ayna boş → yanlış takım" hatasının aksine
// güvenli: atama yoksa eski (tahmin) davranış geçerli olur, yanlış bir
// eşleştirme ÜRETİLMEZ. Ayrıntı için team_assignments.sql'e bakınız.
//
// Dönüş: { ok, installed, rows } — `installed:false` ise tablo yok.
export async function fetchTeamAssignments(supabaseUrl, headers) {
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/team_assignments?select=*&limit=1000`,
      { headers }
    );
    if (r.status === 404) return { ok: true, installed: false, rows: [] };
    if (!r.ok) return { ok: false, installed: true, rows: [] };
    const rows = await r.json();
    return { ok: true, installed: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (e) {
    return { ok: false, installed: true, rows: [] };
  }
}

// ── Atama dizini ve ETKİN takım ────────────────────────────────────────
// Aynı üç soruyu api/login.js, api/team-members.js ve api/sync-user-teams.js
// soruyor; üçünün AYNI cevabı vermesi şart, yoksa kişi bir ekranda görünüp
// diğerinde kaybolur. Bu yüzden tek yerde.
export function buildAssignmentIndex(rows) {
  const byKey = new Map();      // person nameKey → atama satırı
  const leaderOf = new Map();   // person nameKey → lideri olduğu takım
  for (const a of (rows || [])) {
    const k = teamNameKey(a.full_name) || String(a.person_key || '');
    if (!k) continue;
    byKey.set(k, a);
    if (a.is_leader && a.team) leaderOf.set(k, a.team);
  }
  return { byKey, leaderOf };
}

// Kişiyi hem tam adıyla hem kullanıcı adıyla arar: atamalar ADA göre
// tutuluyor (person_key) ama çağıranların bir kısmının elinde yalnızca
// Username var.
function lookup(idx, fullName, username) {
  const a = idx.byKey.get(teamNameKey(fullName));
  if (a) return { row: a, key: teamNameKey(fullName) };
  const b = idx.byKey.get(teamNameKey(username));
  if (b) return { row: b, key: teamNameKey(username) };
  return { row: null, key: null };
}

// Kişinin ETKİN takımı — sıra: lider ataması > kişisel atama > mevcut değer.
//
// Lider ataması NEDEN en üstte: bir takımın Zoho'daki lideri ayrıldığında
// (somut vaka: Touma Team, lideri Abdulkader Touma pasif) o takımın alarmları
// ve kadrosu sahipsiz kalıyor. Admin başka birini o takımın lideri yaptığında
// bu kişinin ETKİN takımı o takım olmalı ki panelindeki TÜM sorgular
// (alarmlar, deal'ler, kadro, günlük ekip girişi) oraya kapsanabilsin.
export function effectiveTeam(idx, fullName, username, fallbackTeam) {
  const { row, key } = lookup(idx, fullName, username);
  if (key && idx.leaderOf.has(key)) return idx.leaderOf.get(key);
  if (row && row.team) return row.team;
  // row.team === null bilinçli bir karar ("satış dışı"): mevcut değere
  // DÖNÜLMEZ, aksi halde yönetici kararı sessizce geri alınırdı.
  if (row && Object.prototype.hasOwnProperty.call(row, 'team') && row.team === null) return '';
  return fallbackTeam || '';
}

// Yönetici bu kişiyi pasife aldı mı? (team_assignments.is_active === false)
// Users.is_active'den AYRI: bir danışmanın Users satırı hiç olmayabilir,
// dolayısıyla "pasife alma" yalnızca Users'a yazılarak yapılamıyordu.
export function isDeactivated(idx, fullName, username) {
  const { row } = lookup(idx, fullName, username);
  return !!(row && row.is_active === false);
}

// ── Users tablosuna PK çakışmasına dayanıklı INSERT ────────────────────
// Users.id "GENERATED BY DEFAULT AS IDENTITY" ama tablo Excel'den yüklenirken
// satırlar AÇIK id ile geldi (Zoho'nun 18 haneli id'leri) — identity dizisi
// hiç ilerlemedi, hâlâ 1, 2, 3... veriyor. id belirtmeden POST etmek bu düşük
// değerlerden birine (daha önce dolu) çarpıp 23505 (duplicate key) ile
// SESSİZCE başarısız olabiliyordu (bkz. api/admin-users.js insertUser — aynı
// kök neden, orada zaten çözülmüştü). team-members.js "Users'ta hiç satırı
// olmayan danışmana telefon/e-posta ata" akışı bu korumadan YOKSUNDU: bir
// takım liderinin defalarca kaydettiği telefon numarası hiç kalıcı olmuyor,
// GET her seferinde Zoho'daki (bazen tamamen başka bir kişiye ait) numarayı
// göstermeye devam ediyordu — "numara sürekli eskisine/başkasınınkine geri
// dönüyor" şikâyetinin kök nedeni buydu.
function pgErr(text) {
  try {
    const j = JSON.parse(text);
    return { code: j.code || '', message: j.message || '', details: j.details || '' };
  } catch (e) { return { code: '', message: String(text || ''), details: '' }; }
}

async function maxUserId(SUPABASE_URL, H) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/Users?select=id_text:id::text&order=id.desc&limit=1`, { headers: H });
  if (!r.ok) return null;
  const rows = await r.json();
  const t = Array.isArray(rows) && rows[0] && rows[0].id_text;
  return t ? String(t) : null;
}

function plusOne(idText) {
  try { return (BigInt(idText) + 1n).toString(); } catch (e) { return null; }
}

// En fazla 5 deneme: her deneme ya bir kolonu düşürür (şema eksikse) ya da
// açık id atar (PK çakışmasında) — ikisi de sonlu, sonsuz döngü olamaz.
export async function insertUserRow(SUPABASE_URL, H, HJ, payloadIn) {
  const payload = { ...payloadIn };
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/Users`, {
      method: 'POST',
      headers: { ...HJ, Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
    if (r.ok) return { ok: true };
    const err = pgErr(await r.text());
    const isDup = err.code === '23505';
    const onPk  = /Users_pkey|\bid\b/i.test(err.message + ' ' + err.details);
    if (isDup && onPk && !payload.id) {
      const mx = await maxUserId(SUPABASE_URL, H);
      const next = mx && plusOne(mx);
      if (next) { payload.id = next; continue; }
    }
    return { ok: false, status: isDup ? 409 : 502, error: err.message || 'Veritabanı hatası.' };
  }
  return { ok: false, status: 502, error: 'Kayıt oluşturulamadı: birden fazla deneme başarısız oldu.' };
}
