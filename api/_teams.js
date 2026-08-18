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

// ── Yönetici (takım lideri / sales master / RM / admin) rolü mü? ──────────
// admin.html'deki _isBoss ile aynı fikir, + \btl\b/\brm\b (Zoho'da bazı roller
// yalnızca "TL"/"RM" kısaltmasıyla geliyor) + master (dry-run'da yakalandı:
// "Sales Master - Burak" gibi roller "master" olmadan YÖNETİCİ sayılmıyordu,
// bu da liderin role'ünün kendi üyelerinden AYRI bir "takım" gibi
// çözülmesine yol açıyordu — Burak Kalkanoğlu/Danish Munir vakasının
// birebir aynısı).
const BOSS_ROLE_RE = /leader|lider|manager|master|müdür|mudur|admin|yönetici|yonetici|\btl\b|\brm\b/i;
export function isBossRole(role) { return BOSS_ROLE_RE.test(String(role || '')); }

// ══════════════════════════════════════════════════════════════════════════
// ── Rol → Takım çözümleme: KAPALI LİSTE değil, AÇIK UÇLU ──────────────────
//
// KÖK NEDEN (Ağustos 2026): Amin Connor West / Anthony Cross (Burak
// Kalkanoğlu) / Bradley Grant (Danish Munir) için Zoho'da yeni takım/lider
// kurulduğunda sistem bunu HİÇ tanımadı ve HİÇBİR uyarı çıkmadı. Sebep: takım
// tanıma üç ayrı dosyada (team-map.js, sync-user-teams.js, team-members.js)
// elle yazılmış AYNI kapalı listeye (LEGACY_TEAM_ALIASES) dayanıyordu — bu
// listeye girmeyen bir takım hiç var olmuyordu.
//
// YENİ TASARIM: bir ÇALIŞANIN (yönetici olmayan) role alanı Zoho'da ZATEN o
// kişinin kanonik takımının kendisi (bkz. team-members.js'teki eski not:
// "üyelerde kanonik ad"). Dolayısıyla ayrı bir whitelist'e hiç gerek yok —
// yalnızca "satış dışı" (isNonSalesRole, kapalı liste — YENİ birim eklendikçe
// büyütülür) ve "yönetici rolü" (isBossRole, açık uçlu regex) rolleri DIŞARIDA
// bırakılır; GERİ KALAN HER rol otomatik olarak kendi başına bir takımdır.
// Zoho'da yeni bir çalışan/takım kurulduğu AN, kod değişikliği gerekmeden
// tanınır.
//
// Yalnızca LİDER/SALES MASTER rolleri hâlâ çözümleme ister: onların role alanı
// üyelerinkinden FARKLI bir serbest metin taşır (ör. "Team Leader - Farah",
// üyeler "Farah Team - Morocco" yazar). Bunun için: önce eski elle yazılmış
// liste (hızlı/kesin yol, GERİYE DÖNÜK UYUMLULUK için hâlâ birinci tercih —
// mevcut 16 takımın kanonik yazımı bundan DEĞİŞMEZ), o da tanımıyorsa o an
// aktif kadrodan ÇIKARILMIŞ (discoverCanonicalTeams) kanonik takım kümesiyle
// bulanık (fuzzy) ad eşleştirmesi denenir. İkisi de sonuç vermezse kişi
// "yeni lider adayı" olarak İŞARETLENİR (sessizce kaybolmaz) — admin panelinde
// "Takımımdaki Kişiler" ekranında ayrı ve belirgin bir bölümde çıkar, tek
// tıkla (mevcut "Elle ata" / team_assignments akışıyla) çözülür.
// ══════════════════════════════════════════════════════════════════════════

// Eski elle yazılmış takım listesi. ARTIK TEK KAYNAK DEĞİL ama geriye dönük
// uyumluluk için BİRİNCİL tercih: buradaki 16 takımın kanonik yazımı
// (ör. çift boşluklu "Arij  Team") bu sayede aynen korunur, Users."Takim Adi"
// ve deals.team'deki mevcut milyonlarca satırla bire bir eşleşmeye devam eder.
// Yeni bir takım/lider için BURAYA elle eklemek ARTIK ZORUNLU DEĞİL — aşağıdaki
// açık uçlu çözümleme onu otomatik yakalar. Yine de admin isterse (ör. bir
// liderin serbest metni bulanık eşleştirmeyle bile çözülemiyorsa, iki takımın
// adı birbirine çok benziyorsa) buraya elle bir satır eklemek en kesin çözüm
// olarak kalır.
export const LEGACY_TEAM_ALIASES = {
  'Arij  Team': ['Arij  Team', 'Arij Team', 'Team Leader-Arij Mahjoubi'],
  'Askif Team': ['Askif Team', 'Team Leader - Abdulrahman Ziad Askif'],
  'Touma Team': ['Touma Team', 'Team Leader- Abdulkader Touma', 'Toumi Team'],
  'Mihoubi Team': ['Mihoubi Team', 'Team Leader - Mihoubi'],
  'Ahmed Anwar Team': ['Ahmed Anwar Team', 'Team Leader-Ahmed Anwar'],
  'Ghazal Team': ['Ghazal Team', 'Team Leader - Ahmad Ghazal'],
  'Ali Omer Team': ['Ali Omer Team', 'Team Leader - Ali Omer'],
  'Aamir Ali Team': ['Aamir Ali Team', 'Team Leader - Aamir Ali'],
  'Joel Team': ['Joel Team', 'Team Leader - Joel'],
  'SM- Mert Team': ['SM- Mert Team', 'Mert Jospeh - Sales Master'],
  'Sales Master - Amin Connor West': ['Sales Master - Amin Connor West', 'SM Amin Connor - Team'],
  'Farah Team - Morocco': ['Farah Team - Morocco', 'Team Leader - Farah'],
  'Sara Team - Morocco': ['Sara Team - Morocco', 'Team Leader - Sara'],
  'Selma Team - Morocco': ['Selma Team - Morocco', 'Team Leader - Selma'],
  'Ramadan Team - Morocco': ['Ramadan Team - Morocco', 'Team Leader - Abdelatif Ramadan'],
  'Moutaharrik Team - Morocco': ['Moutaharrik Team - Morocco', 'Team Leader - Moutaharrik Marco'],
};

const LEGACY_ALIAS_INDEX = {};
for (const [canonical, aliases] of Object.entries(LEGACY_TEAM_ALIASES)) {
  for (const a of aliases) LEGACY_ALIAS_INDEX[teamNameKey(a)] = canonical;
}
export function legacyNormalizeTeam(t) { return LEGACY_ALIAS_INDEX[teamNameKey(t)] || null; }

const LEGACY_ALIAS_KEYS = Object.keys(LEGACY_ALIAS_INDEX).sort((a, b) => b.length - a.length);
// Serbest metnin İÇİNDE bilinen bir alias geçiyor mu (ör. "Sales Agent - Farah
// Team - Morocco (Junior)"). Belirsizse (iki farklı kanonikle eşleşirse) null.
export function legacyLooseTeam(t) {
  const k = teamNameKey(t);
  if (k.length < 4) return null;
  let hit = null;
  for (const ak of LEGACY_ALIAS_KEYS) {
    if (ak.length < 4 || !k.includes(ak)) continue;
    const c = LEGACY_ALIAS_INDEX[ak];
    if (!hit) hit = c;
    else if (hit !== c) return null;
  }
  return hit;
}

// Bir ÜYE (yönetici olmayan) rolünün kanonik takımı. Eski listede varsa onu
// kullanır (yazım aynen korunur); yoksa rolün KENDİSİ (boşluk normalize
// edilmiş) kanonik takım olur — bu satır YENİ takımların üyelerini kod
// değişikliği gerekmeden tanır.
export function resolveMemberTeam(role) {
  if (!role) return null;
  if (isNonSalesRole(role)) return null;
  if (isBossRole(role)) return null;
  return legacyNormalizeTeam(role) || legacyLooseTeam(role) || String(role).replace(/\s+/g, ' ').trim();
}

// Bölge tahmini: isimde "morocco" geçiyorsa Morocco, yoksa Istanbul —
// team-map.js / team-members.js'deki mevcut fallback ile AYNI kural.
export function guessRegion(teamName) {
  return String(teamName || '').toLowerCase().includes('morocco') ? 'Morocco' : 'Istanbul';
}

// Aktif (ayrılmamış, satış dışı olmayan, yönetici olmayan) kadrodan o anki
// GEÇERLİ kanonik takım kümesini çıkarır. Statik DEĞİL — her çağrıda Zoho'nun
// o anki hâlinden yeniden hesaplanır. Lider adı çözümlemesi (aşağıda) ve
// admin panelindeki "Takıma Ata" dropdown'unu YENİ takımlarla beslemek için
// kullanılır (bkz. team-members.js `teamCatalog` alanı).
export function discoverCanonicalTeams(activeZohoRows) {
  const byCanonical = new Map();   // canonical → { canonical, region, memberCount }
  for (const z of (activeZohoRows || [])) {
    const canonical = resolveMemberTeam(z.role);
    if (!canonical) continue;
    let e = byCanonical.get(canonical);
    if (!e) { e = { canonical, region: guessRegion(canonical), memberCount: 0 }; byCanonical.set(canonical, e); }
    e.memberCount++;
  }
  return [...byCanonical.values()];
}

// Genel/kısa kelimeleri (rol unvanı, "team", "-" gibi doldurma sözcükleri)
// eleyip anlamlı isim token'larını çıkarır. Karşılaştırma bunların üzerinden
// yapılır ("Team Leader - Farah" → ['farah']).
const STOP_TOKENS = new Set([
  'team', 'leader', 'lider', 'sales', 'master', 'manager', 'sm', 'tl', 'rm',
  'morocco', 'istanbul', 'region', 'the', 'of', 'a', 've', 'and',
]);
function nameTokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-zçğıöşü0-9]+/i)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !STOP_TOKENS.has(t));
}

// Bir LİDER/SALES MASTER rolünü (ör. "Sales Master - Anthony Cross"), o an
// aktif kadrodan çıkarılmış kanonik takım kümesiyle (discoverCanonicalTeams)
// bulanık ad eşleştirmesiyle bağlar. Tam olarak TEK bir kanonik takımla ortak
// anlamlı token'ı varsa eşleşir; hiç ya da birden fazla takımla eşleşiyorsa
// (belirsiz) null döner — yanlış takıma bağlamak, bağlamamaktan daha kötü.
export function matchLeaderToCanonicalTeam(leaderRole, canonicalTeams) {
  const leaderTokens = nameTokens(leaderRole);
  if (!leaderTokens.length) return null;
  let hit = null;
  for (const entry of (canonicalTeams || [])) {
    const teamTokens = nameTokens(entry.canonical);
    if (leaderTokens.some(t => teamTokens.includes(t))) {
      if (hit && hit !== entry.canonical) return null;   // belirsiz: 2 farklı takımla eşleşti
      hit = entry.canonical;
    }
  }
  return hit;
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
