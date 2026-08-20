// Users."Takim Adi" ← deals.team senkronu (Zoho gerçeği tek kaynak).
//
// NEDEN
// Bir danışman Zoho'da takım değiştirdiğinde bu değişiklik yalnızca deals
// tablosuna yansıyordu; Users."Takim Adi" elle bakımlı olduğu için kişi ESKİ
// liderinin altında görünmeye devam ediyordu (ör. Adam Naciri Moutaharrik
// Team'e geçtiği hâlde Sara/Giulia takımında, Edward Blake Joel Team'e geçtiği
// hâlde Ali Omer Team'de). "Takımımdaki Kişiler", Günlük Ekip Girişi ve takım
// lideri veri kapsamı hep bu alandan besleniyor.
//
// KURAL: kişinin EN SON deal'inin takımı = güncel takımı.
// Bu kural canlı veriyle doğrulandı (49.937 deal / 337 deal sahibi):
//   - 334 sahip tek takımda, hiç geçiş yok
//   - 2 sahipte geçiş var ve TEMİZ/kronolojik (Marco Rahimi: Moutaharrik 2024 →
//     Farah 2025+; Edward Blake: Ali Omer → Joel, Tem 2026) — yani deals.team
//     "o andaki takım"ı doğru tutuyor, en son kayıt güncel takımı veriyor
//   - 1 sahip (Arij Mahjoubi) kendi takımı ile 'Executive Board - CEO' arasında
//     gidip geliyor; satış takımı olmayan birimler aşağıda ELENDİĞİ için sorun
//     değil, son 83 deal'i tutarlı
//
// GÜVENLİK: Users."Takim Adi" bir takım liderinin HANGİ takımın verisini
// gördüğünü belirliyor. Bu yüzden yalnızca TeamMap'te TANINAN satış takımları
// yazılabilir — Profclinic, Finance, VIP Team, Executive Board, Aftercare gibi
// birimler ya da hiç tanınmayan bir ad asla Users'a yazılmaz.
import { verifyToken, bearerToken } from './_auth.js';
import { isBlocked } from './_blocked-users.js';
import {
  fetchTeamAssignments, isBossRole, teamNameKey, isLeaver,
  legacyNormalizeTeam, legacyLooseTeam, resolveMemberTeam,
  discoverCanonicalTeams, matchLeaderToCanonicalTeam,
} from './_teams.js';

const FALLBACK_URL = 'https://aztxfncqanrodbttywrb.supabase.co';

// Takım tanıma mantığı ARTIK _teams.js'te MERKEZİ ve AÇIK UÇLU (bkz. o
// dosyadaki uzun not — kök neden: Ağustos 2026, Zoho'da kurulan yeni
// takımlar/liderler bu dosyanın kendi kopyasındaki kapalı listeye
// girmediği için hiç tanınmıyor, hiçbir uyarı çıkmıyordu). Burada ayrı bir
// liste TUTULMUYOR.
function tkey(s) { return teamNameKey(s); }

// zoho_users satırının söylediği takım. Canlı tabloda `team` kolonu YOK
// (bkz. handler içindeki select notu) — takım bilgisi `role` alanında:
// üyelerde kanonik ad ("Farah Team - Morocco"), liderlerde alias
// ("Team Leader - Farah"). Üye rolü eski listede yoksa KENDİSİ kanonik takım
// sayılır (resolveMemberTeam); lider rolü eski listede yoksa canlı kadrodan
// çıkarılan kanonik kümeyle bulanık eşleştirilir (canonicalTeams parametresi).
function zohoTeamOf(z, canonicalTeams) {
  if (!z) return null;
  const legacy = legacyNormalizeTeam(z.role) || legacyLooseTeam(z.role);
  if (legacy) return legacy;
  if (!isBossRole(z.role)) return resolveMemberTeam(z.role);
  return matchLeaderToCanonicalTeam(z.role, canonicalTeams) || null;
}

function nameKey(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

// Takım lideri / bölge yöneticisi / admin rollerinin takımı, sahip oldukları
// deallerden TÜRETİLEMEZ — göreve göre atanır ve elle yönetilir.
//
// Somut vaka: Marco Rahimi, Farah Team'de danışmanken Moutaharrik Team'in
// lideri oldu. En son deal'i (May 2026) hâlâ "Farah Team - Morocco" diyor;
// "en son deal kazanır" kuralı onu Moutaharrik liderliğinden alıp Farah'a
// geri atardı ve kendi takımının verisini göremez, Farah'ın verisini görürdü.
// Bu yüzden yönetici rolleri senkronun DIŞINDA. (isBossRole artık _teams.js'te
// merkezi — bkz. üstteki import.)

// isLeaver artık _teams.js'te merkezi (bkz. üstteki import) — burada ayrı
// bir kopya TUTULMUYOR (bu dosya ve team-members.js'teki iki kopya
// ayrışabiliyordu: biri kadroyu gösteriyor, diğeri is_active=false YAZIYOR).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const SUPABASE_URL = process.env.SUPABASE_URL || FALLBACK_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    res.status(500).json({ error: 'Sunucu yapılandırma hatası: SUPABASE_SERVICE_ROLE_KEY eksik.' });
    return;
  }
  const AUTH_SECRET = process.env.AUTH_TOKEN_SECRET;
  if (!AUTH_SECRET) {
    res.status(500).json({ error: 'Sunucu yapılandırma hatası: AUTH_TOKEN_SECRET eksik.' });
    return;
  }
  // Users."Takim Adi" yetkilendirme kapsamını belirlediği için bu uç yalnızca
  // admin/super-admin'e açık.
  const claims = verifyToken(bearerToken(req), AUTH_SECRET);
  if (!claims || !['admin', 'super-admin'].includes(claims.r)) {
    res.status(401).json({ error: 'Yetkisiz erişim.' });
    return;
  }

  const H  = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY };
  const HJ = { ...H, 'Content-Type': 'application/json; charset=utf-8' };

  // PostgREST yanıtları 1000 satırda KESİLİYOR (db-max-rows) — "limit=2000"
  // yazmak bunu değiştirmiyor, fazlası sessizce düşer. Bu yüzden sayfalı çek.
  async function fetchAllPaged(path) {
    const out = [];
    let offset = 0;
    while (true) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}&limit=1000&offset=${offset}`, { headers: H });
      if (!r.ok) return { ok: false, rows: out };
      const batch = await r.json();
      if (!Array.isArray(batch) || !batch.length) break;
      out.push(...batch);
      if (batch.length < 1000) break;
      offset += 1000;
    }
    return { ok: true, rows: out };
  }

  try {
    // ── 0. Zoho kullanıcı aynası (varsa BİRİNCİL kaynak) ──────────────
    // zoho_users, Zoho'nun Users modülünün aynası (bkz. zoho_users_sync.sql):
    // takımı DOĞRUDAN söyler ve aktif/pasif durumu taşır — "en son deal'in
    // takımı" ise yalnızca bir VEKİL göstergeydi (deal sahibi olmayanları hiç
    // görmez, ayrılanları anlamaz). Tablo henüz kurulmadıysa (404) sessizce
    // eski vekil kurala düşülür.
    // NOT: takım bilgisi `role` alanında — Zoho'da ayrı bir "team" alanı yok.
    // Üyelerde kanonik ad ("Farah Team - Morocco"), takım liderlerinde alias
    // ("Team Leader - Farah") geliyor; ikisi de normalizeTeam ile aynı kanonik
    // ada iniyor. Bu sayede liderin takımı da doğru çıkıyor ve deals tabanlı
    // vekil kuralda gereken "yönetici rolünü atla" istisnası burada GEREKMİYOR.
    const zoho = new Map();      // nameKey → zoho_users satırı
    {
      // DİKKAT — buraya `team` kolonu EKLEMEYİN. Canlı zoho_users tablosu dış
      // Zoho senkronu tarafından oluşturuluyor ve `team`/`is_confirmed`
      // kolonları YOK (zoho_users_sync.sql'deki DDL hiç çalıştırılmadı).
      // Var olmayan bir kolon istendiğinde PostgREST tüm sorguya 400 dönüyor;
      // eskiden bu hata sessizce yutulup ayna BOŞ kalıyordu, sistem de 50 bin
      // satırlık "en son deal" vekil taramasına düşüyordu. Sonuç: takımlar
      // Zoho'ya değil bayat deal geçmişine göre atanıyor (yanlış takım) ve
      // POST tarafında tarama + seri PATCH'ler fonksiyon zaman aşımına
      // (504) yol açıyordu. Takım bilgisi `role` alanında — bkz. üstteki not.
      const zr = await fetchAllPaged(
        'zoho_users?select=id,full_name,original_agent_name,email,role,region,status,exit_date,phone,mobile&order=id.asc');
      if (!zr.ok) {
        // Sessizce vekil kurala DÜŞMÜYORUZ: ayna okunamıyorsa öneriler yanlış
        // olur. Hatayı açıkça bildir ki bir daha sessizce bozulmasın.
        res.status(502).json({
          error: 'Zoho kullanıcı aynası (zoho_users) okunamadı — takım eşleştirmesi ' +
                 'yanlış sonuç vermemesi için işlem durduruldu. Şema değişmiş olabilir.',
        });
        return;
      }
      for (const z of zr.rows) {
        const k = nameKey(z.full_name);
        if (k) zoho.set(k, z);
      }
    }
    // DİKKAT: "ayna kullanılabilir" ölçütü tablonun VARLIĞI değil, DOLU olması.
    // Tablo oluşturulup dış senkron henüz yazmamışsa (boş tablo) sorgu 200
    // dönüyor; yalnızca varlığa bakılsaydı deal taraması atlanır ve takım
    // eşitlemesi sessizce hiçbir şey önermez hâle gelirdi.
    const zohoAvailable = zoho.size > 0;

    // ── 1. Vekil kural: her deal sahibinin EN SON deal'indeki takım ──────
    // Yalnızca zoho_users YOKSA gerekli — ayna varsa takımı doğrudan biliyoruz,
    // 50 bin satırı taramanın anlamı yok (Vercel fonksiyon süresini yakardı).
    //
    // AZALAN sırada gidip her sahibi İLK görüldüğünde kaydediyoruz: azalan
    // sırada bir sahibin ilk kaydı = en son deal'i. Böylece tüm tabloyu
    // taramaya gerek kalmıyor, sayfa sayısı üstten sınırlı.
    const latest = new Map();   // nameKey → { team, date, count }
    let scannedDeals = 0, scanTruncated = false;
    if (!zohoAvailable) {
      const PAGE = 1000;
      const MAX_PAGES = 12;          // ~12k deal — pratikte son ~1.5 yılı kapsıyor
      const DEADLINE = Date.now() + 8000;   // sn cinsinden bütçe: fonksiyon zaman aşımına düşmesin
      for (let page = 0; page < MAX_PAGES; page++) {
        if (Date.now() > DEADLINE) { scanTruncated = true; break; }
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/deals?select=deal_owner,team,created_time` +
          `&order=created_time.desc.nullslast&limit=${PAGE}&offset=${page * PAGE}`,
          { headers: H }
        );
        if (!r.ok) { res.status(502).json({ error: 'Veritabanı hatası (deals).' }); return; }
        const batch = await r.json();
        if (!Array.isArray(batch) || !batch.length) break;
        scannedDeals += batch.length;
        for (const row of batch) {
          const k = nameKey(row.deal_owner);
          if (!k) continue;
          const canonical = legacyNormalizeTeam(row.team);
          if (!canonical) continue;        // satış dışı birim / tanınmayan ad → yok say
          const prev = latest.get(k);
          if (prev) { prev.count++; continue; }   // ilk görülen (= en son) kalır
          latest.set(k, { team: canonical, date: row.created_time || null, count: 1 });
        }
        if (batch.length < PAGE) break;
        if (page === MAX_PAGES - 1) scanTruncated = true;
      }
    }

    // ── 2. Users ile karşılaştır ──
    const uRes = await fetchAllPaged('Users?select=*&order=id.asc');
    if (!uRes.ok) { res.status(502).json({ error: 'Veritabanı hatası (Users).' }); return; }
    const users = uRes.rows;

    // ── Yönetici atamaları — senkron bunları ASLA ezmez ────────────────
    // Kullanıcının açık talebi: "admin panelinden atadığım takım öyle kalsın,
    // değişmesin." Bu kişiler öneri listesine hiç girmez; aksi hâlde her
    // "Zoho'ya göre eşleştir" tıklaması yöneticinin kararını geri alırdı.
    const manualKeys = new Set();
    {
      const ar = await fetchTeamAssignments(SUPABASE_URL, H);
      for (const a of ar.rows) {
        const k = nameKey(a.full_name) || String(a.person_key || '');
        if (k) manualKeys.add(k);
      }
    }

    // o an aktif kadrodan çıkarılan kanonik takım kümesi — yönetici (lider/
    // sales master) rollerini bulanık eşleştirmek için (bkz. zohoTeamOf).
    const canonicalTeams = discoverCanonicalTeams([...zoho.values()].filter(z => !isLeaver(z)));

    const changes = [];     // takım değişiklikleri
    const leavers = [];     // Zoho'da artık aktif olmayanlar
    let skippedBoss = 0, skippedManual = 0;
    for (const u of users) {
      const ownerName = u['Deal Owner Name'] || u['Username'] || '';

      // Sistemden ÇIKARILMIŞ kişiler (bkz. _blocked-users.js) bu taramaya HİÇ
      // GİRMEMELİ. Somut vaka (2026-08-20, Jamari West): Users satırı silinmez,
      // yalnızca gizlenir (admin-users.js isBlocked filtresi) — bu yüzden bu
      // dosyanın kendi Users taramasında hâlâ görünüyordu. Kişi zaten Zoho'da
      // da yok olduğu için üstteki "kayıp kullanıcı" kontrolü onu yanlışlıkla
      // "ayrılan" sayıp uyarıya soktu; "Pasife Al" da satırdaki Username alanı
      // artık kullanılabilir olmadığı için hata verdi. Engellenmiş kişiler
      // zaten kalıcı olarak çıkarılmış sayılır — bu taramanın konusu değil.
      if (isBlocked(ownerName, u['Username'])) continue;

      const z = zoho.get(nameKey(ownerName));

      // ── KAYIP KULLANICILAR — Zoho aynasında ARTIK HİÇ YOK ──────────────
      // Kök neden (2026-08-19, Farah/Yasser Raji + Ali Nkairi vakası): dış
      // Zoho senkronu, işten ayrılan birini status=inactive yaparak
      // BIRAKMIYOR — satırı zoho_users'tan TAMAMEN SİLİYOR. isLeaver()
      // yalnızca `z` (satır) VARSA çalışabiliyor; satır yoksa aşağıdaki
      // "z && isLeaver(z)" kontrolü hiç tetiklenmiyor VE bu kişi zTeam=null
      // olduğu için (zohoAvailable=true olduğundan "en son deal" yedek
      // taraması da atlanıyor) "hiç sinyal yok" sayılıp SESSİZCE continue
      // ediliyordu — ne ayrılan listesine giriyordu ne de Users."Takim Adi"
      // güncelleniyordu. Sonuç: kişi hem hiçbir uyarı üretmiyor hem de eski
      // takım kaydı SONSUZA KADAR donuk kalıyordu. Zoho'dan tamamen kaybolmuş
      // olmak, status=inactive'den daha güçlü bir "ayrıldı" sinyali — kadroda
      // daha önce yer almış (bir takımı olan) biri artık ayna listesinde HİÇ
      // yoksa doğrudan ayrılan sayılır.
      if (!z && zohoAvailable && ownerName && String(u['Takim Adi'] || '').trim() && u['is_active'] !== false) {
        leavers.push({
          username: u['Username'] || '',
          fullName: ownerName,
          role: u['Role'] || '',
          team: String(u['Takim Adi'] || '').trim(),
          zohoStatus: 'Zoho kullanıcı aynasında bulunamadı (muhtemelen ayrıldı/silindi)',
          exitDate: null,
          zohoStatusRaw: null,
          zohoRole: '',
          email: '',
          vanished: true,
        });
        continue;
      }

      // ── Ayrılanlar ──
      // Kayıt silinmiyor, yalnızca is_active=false (geçmiş veriye bağlı).
      // Yönetici rolleri de dahil: ayrılan bir takım lideri de girmemiş.
      if (z && isLeaver(z) && u['is_active'] !== false) {
        leavers.push({
          username: u['Username'] || '',
          fullName: ownerName,
          role: u['Role'] || '',
          team: String(u['Takim Adi'] || '').trim(),
          zohoStatus: z.exit_date
            ? `exit_date ${String(z.exit_date).slice(0, 10)}`
            : (z.status || '(bilinmiyor)'),
          // Panelde "neden aktif değil" sorusunu cevaplayabilmek için ham
          // alanlar da gidiyor: exit_date ve status BAĞIMSIZ iki gerekçe
          // (isLeaver notuna bakınız — exit_date geçmişte olup status hâlâ
          // 'active' görünen kişiler var). Tek bir birleşik metin bunları
          // ayırt edilemez hâle getiriyordu.
          exitDate: z.exit_date ? String(z.exit_date).slice(0, 10) : null,
          zohoStatusRaw: z.status || null,
          zohoRole: z.role || '',
          email: z.email || '',
        });
        continue;   // ayrılan biri için takım güncellemesi anlamsız
      }

      // ── Takım ──
      // Elle atanmışsa dokunulmaz (bkz. manualKeys notu). Ayrılan kontrolü
      // BİLEREK bunun ÜSTÜNDE: elle takım atanmış biri Zoho'dan ayrıldıysa
      // girişinin kapatılması gerekir — atama, ayrılmayı gizlememeli.
      if (manualKeys.has(nameKey(ownerName))) { skippedManual++; continue; }

      // Kaynak tercihi: zoho_users.role (doğrudan bilgi) > en son deal (vekil).
      let target = null, source = null, dealCount = null, lastDealDate = null;
      const zTeam = zohoTeamOf(z, canonicalTeams);
      if (zTeam) {
        // Zoho doğrudan söylüyor — yönetici rolü istisnasına GEREK YOK, çünkü
        // liderin role'ü de ("Team Leader - X") kendi takımına iniyor.
        target = zTeam;
        source = 'zoho_users';
      } else {
        // Vekil kural: burada yönetici rolleri ATLANIR. Somut vaka — Marco
        // Rahimi Farah Team'de danışmanken Moutaharrik lideri oldu; en son
        // deal'i hâlâ "Farah Team" diyor, bu koruma olmasa liderliğinden
        // alınıp Farah'a geri atılırdı.
        if (isBossRole(u['Role'])) { skippedBoss++; continue; }
        const info = latest.get(nameKey(ownerName));
        if (!info) continue;                                 // hiç sinyal yok
        target = info.team;
        source = 'latest_deal';
        dealCount = info.count;
        lastDealDate = info.date;
      }

      const current = String(u['Takim Adi'] || '').trim();
      // Users'taki mevcut değeri de kanonize et — yalnızca yazım varyantı
      // farkıysa (ör. "Arij Team" ↔ "Arij  Team") gereksiz yazma yapmayalım.
      if ((legacyNormalizeTeam(current) || current) === target) continue;
      changes.push({
        username: u['Username'] || '',
        fullName: ownerName,
        role: u['Role'] || '',
        from: current,
        to: target,
        source,
        dealCount,
        lastDealDate,
      });
    }

    if (req.method === 'GET') {
      res.status(200).json({
        scanned: users.length,
        owners: latest.size,
        zohoAvailable,          // false → zoho_users kurulmamış, vekil kural kullanılıyor
        zohoUsers: zoho.size,
        scannedDeals,
        // true → deal taraması sınıra/süreye takıldı; uzun süre deal'i olmayan
        // kişiler için sinyal alınamamış olabilir (yanlış öneri DEĞİL, eksik öneri).
        scanTruncated,
        skippedBoss,
        // Elle atandığı için önerilmeyen kişi sayısı — panelde "N kişi elle
        // atanmış, dokunulmadı" olarak gösterilir ki sessiz bir atlama gibi
        // durmasın.
        skippedManual,
        changes,
        leavers,
      });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      // Belirli kullanıcı(lar) istenirse yalnızca onlar uygulanır; verilmezse tümü.
      const only = Array.isArray(body?.usernames) ? new Set(body.usernames.map(String)) : null;
      // Ayrılanların girişini kapatmak AYRI ve açık bir onay gerektiriyor —
      // takım güncellemesiyle birlikte sessizce olmasın.
      const doDeactivate = body?.deactivateLeavers === true;

      // Users.id bigint JS safe-integer sınırını aşabiliyor — Username ile
      // hedefle (bkz. api/team-members.js'deki aynı not).
      // Users tablosunda BAZI KOLONLAR YOK: canlı şemada updated_at, is_active,
      // deactivated_at, deactivation_reason, created_at, zoho_user_id
      // bulunmuyor (bu kolonları ekleyen zoho_users_sync.sql hiç
      // çalıştırılmadı). Payload'a olmayan bir kolon konursa PostgREST tüm
      // PATCH'e 400 döner ve panelde "0 takım atandı, 1 başarısız" görünür —
      // takım gerçekten yazılabilecekken.
      //
      // Bu yüzden api/admin-users.js'teki desenin aynısı: veritabanının
      // reddettiği kolon payload'dan DÜŞÜRÜLÜP yeniden denenir. Böylece takım
      // ataması migration gerektirmeden çalışır; düşürülen kolonlar yanıtta
      // `droppedColumns` olarak bildirilir (sessizce yok sayılmaz).
      const droppedCols = new Set();

      function pgErr(text) {
        try {
          const j = JSON.parse(text);
          return { code: j.code || '', message: j.message || '', details: j.details || '' };
        } catch (e) { return { code: '', message: String(text || ''), details: '' }; }
      }
      // Eksik kolonun adını hata metninden çıkarır. Postgres/PostgREST bunu
      // İKİ AYRI biçimde söylüyor ve ikisi de karşılanmak zorunda:
      //   42703  : column Users.updated_at does not exist      ← tablo ÖNEKLİ
      //   PGRST204: Could not find the 'updated_at' column of 'Users' ...
      // Önek soyulmazsa aday ad "Users.updated_at" olur, payload'da böyle bir
      // anahtar bulunmadığı için kolon "eksik" sayılmaz ve yeniden deneme hiç
      // tetiklenmez — testte tam olarak bu yakalandı.
      function missingColumn(err, payload) {
        const hay = err.message + ' ' + err.details;
        const cands = [];
        // Tırnaklı: column "Takim Adi" of relation "Users" ... — kolon adında
        // BOŞLUK olabilir ('Takim Adi'), bu yüzden tırnak içi ayrı ele alınıyor.
        let m = /column\s+"([^"]+)"/i.exec(hay);
        if (m) cands.push(m[1]);
        // Tırnaksız: column Users.updated_at does not exist
        m = /column\s+([^\s"']+)\s+(?:of relation|does not exist)/i.exec(hay);
        if (m) cands.push(m[1]);
        // PGRST204: Could not find the 'updated_at' column of 'Users' ...
        m = /could not find the '([^']+)' column/i.exec(hay);
        if (m) cands.push(m[1]);
        for (const raw of cands) {
          if (Object.prototype.hasOwnProperty.call(payload, raw)) return raw;
          // "Users.updated_at" → "updated_at" (tablo/şema öneki soyulur)
          const bare = String(raw).split('.').pop();
          if (bare && Object.prototype.hasOwnProperty.call(payload, bare)) return bare;
        }
        return null;
      }

      // Dönüş: { ok, status, error }. Şemada olmayan kolonları atarak dener;
      // ZORUNLU alanların (`required`) düşmesi gerekiyorsa başarısız sayar —
      // örneğin is_active olmadan "girişi kapat" işlemi ANLAMSIZ olurdu ve
      // sessizce "başarılı" demek yanlış bilgi verirdi.
      async function patchUser(username, payloadIn, required) {
        const payload = { ...payloadIn };
        // Baştan bilinen eksik kolonları hiç gönderme (gereksiz tur atmasın).
        for (const c of droppedCols) delete payload[c];
        for (let attempt = 0; attempt < 6; attempt++) {
          if (!Object.keys(payload).length) {
            return { ok: false, status: 400, error: 'Yazılacak alan kalmadı (şemada kolon yok).' };
          }
          const r = await fetch(
            `${SUPABASE_URL}/rest/v1/Users?Username=eq.${encodeURIComponent(username)}`,
            { method: 'PATCH', headers: { ...HJ, Prefer: 'return=minimal' }, body: JSON.stringify(payload) }
          );
          if (r.ok) return { ok: true, status: r.status };

          const err = pgErr(await r.text());
          const col = missingColumn(err, payload);
          if (col) {
            droppedCols.add(col);
            delete payload[col];
            if (required && required.includes(col)) {
              return {
                ok: false, status: 400,
                error: `Veritabanında "${col}" kolonu yok — bu işlem için gerekli. ` +
                       'Depodaki team_assignments.sql dosyasını Supabase SQL Editor\'de çalıştırın.',
              };
            }
            continue;
          }
          return { ok: false, status: r.status, error: err.message || ('HTTP ' + r.status) };
        }
        return { ok: false, status: 502, error: 'Birden fazla deneme başarısız oldu.' };
      }

      const applied = [], failed = [];
      for (const c of (only ? changes.filter(x => only.has(x.username)) : changes)) {
        if (!c.username) { failed.push({ ...c, error: 'Username boş' }); continue; }
        // 'Takim Adi' ZORUNLU: bu işlemin tek amacı o. updated_at yalnızca
        // izlenebilirlik için, şemada yoksa düşürülüp devam edilir.
        const pR = await patchUser(
          c.username,
          { 'Takim Adi': c.to, updated_at: new Date().toISOString() },
          ['Takim Adi']
        );
        if (pR.ok) applied.push(c);
        else failed.push({ ...c, error: pR.error || ('HTTP ' + pR.status) });
      }

      const deactivated = [];
      if (doDeactivate) {
        for (const l of (only ? leavers.filter(x => only.has(x.username)) : leavers)) {
          if (!l.username) { failed.push({ ...l, error: 'Username boş' }); continue; }
          // is_active ZORUNLU: o kolon yoksa "girişi kapat" hiçbir şey yapmaz,
          // başarılı demek yanlış bilgi olurdu.
          const pR = await patchUser(l.username, {
            is_active: false,
            deactivated_at: new Date().toISOString(),
            deactivation_reason: `Zoho status: ${l.zohoStatus}`,
            updated_at: new Date().toISOString(),
          }, ['is_active']);
          if (pR.ok) deactivated.push(l);
          else failed.push({ ...l, error: pR.error || ('HTTP ' + pR.status) });
        }
      }

      res.status(200).json({
        applied, deactivated, failed,
        appliedCount: applied.length,
        deactivatedCount: deactivated.length,
        failedCount: failed.length,
        // Şemada bulunmadığı için yazılamayan kolonlar — panel bunu gösterir ki
        // "yazdı ama izleme alanı boş kaldı" durumu görünmez kalmasın.
        droppedColumns: [...droppedCols],
      });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası: ' + e.message });
  }
}
