// "Takımımdaki Kişiler" sayfasının (team-leader.html + admin.html) Users
// tablosu erişimi buradan geçer — service_role key ile, sunucu tarafında.
// Users tablosu anon key'e tamamen kapalı (bkz. users_rls_lockdown.sql /
// rls_hardening.sql), bu yüzden tarayıcı bu tabloya asla doğrudan dokunmuyor.
//
// Auth: çağıranın api/login.js'te üretilen, süresi dolmamış ve
// team-leader/regional-manager/admin/super-admin rolüne ait bir token'ı
// Authorization: Bearer başlığında göndermesi ZORUNLU.
//
// Kapsam GÜVENLİĞİ (rol bazlı, İSTEMCİDEN GELEN parametreye değil, token'daki
// kullanıcı adıyla Users tablosunda TEKRAR sorgulanan güncel role/takıma göre):
//   - team-leader: sadece KENDİ takımının üyeleri.
//   - regional-manager: KENDİ bölgesindeki (Istanbul/Morocco) tüm takımların üyeleri.
//   - admin / super-admin: TÜM takımların TÜM üyeleri.
import { verifyToken, bearerToken } from './_auth.js';
import { isBlocked } from './_blocked-users.js';
import {
  isNonSalesRole, fetchTeamAssignments, isBossRole,
  buildAssignmentIndex, effectiveTeam, isDeactivated, insertUserRow,
  legacyNormalizeTeam, legacyLooseTeam, resolveMemberTeam,
  discoverCanonicalTeams, matchLeaderToCanonicalTeam,
  isLeaver, resolveOwnTeamFromZoho,
} from './_teams.js';

const FALLBACK_URL = 'https://aztxfncqanrodbttywrb.supabase.co';

// team-map.js'deki (tarayıcı tarafı) bölge eşlemesinin sunucu tarafı kopyası —
// Users."Takim Adi" değeri zaten kanonik geldiği için burada sadece
// kanonik ad → bölge eşlemesi yeterli (alias çözümlemeye gerek yok).
const REGION_BY_TEAM = {
  'Arij  Team': 'Istanbul',
  'Askif Team': 'Istanbul',
  'Touma Team': 'Istanbul',
  'Mihoubi Team': 'Istanbul',
  'Ahmed Anwar Team': 'Istanbul',
  'Ghazal Team': 'Istanbul',
  'Ali Omer Team': 'Istanbul',
  'Aamir Ali Team': 'Istanbul',
  'Joel Team': 'Istanbul',
  'SM- Mert Team': 'Istanbul',
  'Sales Master - Amin Connor West': 'Istanbul',
  'Farah Team - Morocco': 'Morocco',
  'Sara Team - Morocco': 'Morocco',
  'Selma Team - Morocco': 'Morocco',
  'Ramadan Team - Morocco': 'Morocco',
  'Moutaharrik Team - Morocco': 'Morocco',
};

function regionForTeam(team) {
  const t = String(team || '').trim();
  if (REGION_BY_TEAM[t]) return REGION_BY_TEAM[t];
  return t.toLowerCase().includes('morocco') ? 'Morocco' : 'Istanbul';
}

// ── zoho_users desteği ────────────────────────────────────────────────
// Kadro artık Zoho'nun Users modülünden geliyor. Orada takım bilgisi `role`
// alanında duruyor ve deals.team ile AYNI yazım uzayında: üyelerde kanonik ad
// ("Farah Team - Morocco"), takım liderlerinde alias ("Team Leader - Farah").
//
// Takım tanıma mantığı ARTIK _teams.js'te MERKEZİ ve AÇIK UÇLU (bkz. o
// dosyadaki uzun not — kök neden: Ağustos 2026, yeni takımlar hiç
// tanınmıyordu). Burada yalnızca legacy tablo + yeni açık-uçlu çözümleyiciler
// import ediliyor, ayrı bir kopya TUTULMUYOR.

// Karşılaştırma anahtarı — team-map.js'deki key() ile AYNI olmalı
// ("Arij  Team" gibi çift boşluklu varyantlar eşleşsin).
function nameKey(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

// Bir zoho_users satırının takımı — sırayla, ilk kesin sinyal kazanır.
//
// SIRA ÖNEMLİ ve BİLİNÇLİ: gerçeğin kaynağı ZOHO. Users."Takim Adi" ve deals.team
// bizim kendi aynalarımız ve BAYATLAYABİLİR (deals.team satır oluşturulduğunda
// donuyor, hiç güncellenmiyor). Eskiden Users, Zoho'nun serbest metninden ÖNCE
// geliyordu; sonuç: Zoho'da "Sales Agent - Sara Team - Morocco" yazan biri,
// Users'ta bayat "Farah Team" durduğu için Farah'ın listesinde çıkıyordu.
// Artık Zoho'nun hem katı hem serbest metni, bizim aynalarımızı YENER.
// assignByKey: nameKey → team_assignments satırı (yönetici kararı). Bkz.
// team_assignments.sql — bu, tahmin zincirinin TAMAMINI yener ve bir sonraki
// senkronda geri alınmaz.
//
// canonicalTeams: discoverCanonicalTeams() ile o an aktif kadrodan çıkarılmış
// kanonik takım kümesi — yalnızca YÖNETİCİ rollerini bulanık eşleştirmek için
// kullanılır (bkz. _teams.js matchLeaderToCanonicalTeam).
function resolveZohoTeam(z, usersRow, dealTeamByName, assignByKey, canonicalTeams) {
  // 0) YÖNETİCİ ATAMASI — her şeyin üstünde. `team === null` kaydı da geçerli
  //    bir karardır ("satış dışı"): kişi kadroda görünmez ve uyarıya girmez.
  const ov = assignByKey && assignByKey.get(nameKey(z.full_name));
  if (ov) return { team: ov.team || null, source: 'manual', manual: true };
  // 1-2) Zoho'nun kendi alanları, eski (elle yazılmış) listeyle birebir eşleşme.
  //    NOT: zoho_users tablosunda `team` kolonu YOK (canlı şema dış Zoho
  //    senkronundan geliyor); bu satır bilerek duruyor — kolon sonradan
  //    eklenirse otomatik devreye girer, yokken zararsızca null döner.
  if (legacyNormalizeTeam(z.team)) return { team: legacyNormalizeTeam(z.team), source: 'zoho.team' };
  if (legacyNormalizeTeam(z.role)) return { team: legacyNormalizeTeam(z.role), source: 'zoho.role' };
  // 3-4) Zoho'nun serbest metni ("Sales Agent - Farah Team - Morocco (Junior)")
  const looseT = legacyLooseTeam(z.team);
  if (looseT) return { team: looseT, source: 'zoho.team~' };
  const looseR = legacyLooseTeam(z.role);
  if (looseR) return { team: looseR, source: 'zoho.role~' };
  // 4.5) YENİ — eski liste bu rolü tanımıyor. Yönetici rolü DEĞİLSE, rolün
  //    kendisi otomatik olarak bir takımdır (kod değişikliği gerekmez — yeni
  //    kurulan bir takımın üyeleri ilk andan itibaren tanınır).
  //    Yönetici rolüyse (Team Leader / Sales Master), o an aktif kadrodan
  //    çıkarılan kanonik takım kümesiyle bulanık ad eşleştirmesi denenir.
  if (!isBossRole(z.role)) {
    const literal = resolveMemberTeam(z.role);
    if (literal) return { team: literal, source: 'zoho.role.literal' };
  } else {
    const fuzzy = matchLeaderToCanonicalTeam(z.role, canonicalTeams);
    if (fuzzy) return { team: fuzzy, source: 'leader.fuzzy' };
  }
  // 5) Kendi aynamız: Users."Takim Adi" (api/sync-user-teams.js yazıyor).
  //    Yetkilendirme buna dayandığı için hâlâ değerli, ama Zoho konuştuysa
  //    Zoho kazanır.
  const fromUsers = usersRow && legacyNormalizeTeam(usersRow['Takim Adi']);
  if (fromUsers) return { team: fromUsers, source: 'Users' };
  // 6) En son çare: bu kişinin en son deal'indeki takım. EN BAYAT sinyal —
  //    yanıt içinde teamSource='deals' olarak işaretlenir ve panelde
  //    "tahmin" rozetiyle gösterilir.
  const fromDeals = dealTeamByName && dealTeamByName.get(nameKey(z.full_name));
  if (fromDeals) return { team: fromDeals, source: 'deals' };
  // Hiçbir sinyal yok. isBoss: çağıran bunu "yeni lider/sales master adayı"
  // (newLeaderCandidates) ile genel "yerleşemedi" (unplaced) arasında ayırmak
  // için kullanır — ikisi FARKLI aciliyette, admin panelinde ayrı gösterilir.
  return { team: null, source: null, isBoss: isBossRole(z.role) };
}

// isLeaver artık _teams.js'te merkezi (bkz. üstteki import) — burada ayrı
// bir kopya TUTULMUYOR (team-members.js ve sync-user-teams.js'teki iki kopya
// ayrışabiliyordu).

// ── Zoho hesap devri (bkz. zoho_account_handover.sql) ──────────────────
// Ajanslar Zoho'da GERÇEK adlarıyla değil, hesabın takma adıyla (persona)
// çalışıyor: biri ayrılınca (exit_date geçmişe düşer) aynı hesabı bir süre
// sonra yeni işe giren biri devralabiliyor. Bu durumda hesabın start_date'i
// eski sahibinin exit_date'inden SONRAdır — yani "ayrılmış" görünen hesap
// aslında hâlâ (başka biri tarafından) kullanılıyordur. Somut vaka: hesap
// "Nicholas Parker", exit_date 06.05, start_date 15.06 — 15 Haziran'dan beri
// hesabı kullanan kişi hâlâ aktif ama isLeaver() onu ayrılmış sayıyordu.
//
// Otomatik "aktif say" YAPILMIYOR — Zoho verisi hatalı/eksik olabilir, admin
// onayı şart (bkz. account_handover_approvals). Onaylanana kadar kişi
// "Hesap Devri Onayı Bekliyor" listesinde bekler, kadroda görünmez.
function parseDateSafe(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
function isHandoverCandidate(z) {
  const ex = parseDateSafe(z.exit_date), st = parseDateSafe(z.start_date);
  return !!(ex && st && st > ex);
}
// zoho_users.exit_date/start_date tam ISO zaman damgası olarak gelebilir
// ("2026-05-06T00:00:00+00:00"), account_handover_approvals'taki `date`
// tipi kolonlar ise geri okunduğunda sade "2026-05-06" döner. İkisi FARKLI
// dize olduğu için anahtar hiç eşleşmiyordu — admin onayladığı hâlde kişi
// hep "onaysız" görünüyordu. İlk 10 karaktere (YYYY-MM-DD) indirgeyerek
// karşılaştırma format farkından bağımsız hâle getirildi.
function dateOnly(v) { return String(v || '').slice(0, 10); }
function handoverKey(zohoUserId, exitDate, startDate) {
  return String(zohoUserId || '') + '|' + dateOnly(exitDate) + '|' + dateOnly(startDate);
}

// Danışmanlar panele GİRMİYOR — onlara login açılmıyor. Ama Günlük Ekip Girişi
// kayıtları daily_performance'ta (entry_date, username) benzersiz kısıtıyla
// tutuluyor, yani her kişi için kararlı bir anahtar şart.
//
// Users satırı varsa onun Username'i kullanılır (geçmiş kayıtlar bağlı kalsın).
// Yoksa Zoho görünen adından türetilir: mevcut Users kayıtları da tam olarak bu
// düzende ("Adam Naciri" → "Adam.Naciri", "Marco Rahimi" → "Marco.Rahimi"),
// dolayısıyla biri sonradan Users'a eklenirse anahtar değişmez ve geçmiş bölünmez.
function derivedUsername(fullName) {
  return String(fullName || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .join('.');
}

// admin.html'deki _rmGetRegion ile aynı mantık: bazı RM hesapları adına göre
// sabitlenmiş, diğerleri kendi "Takim Adi" alanından türetilir.
function regionForRm(me) {
  const n = String(me['Deal Owner Name'] || me['Username'] || '').toLowerCase();
  if (n.includes('benmamar') || n.includes('abderrahim')) return 'Istanbul';
  if (n.includes('gazzini') || n.includes('yassin')) return 'Morocco';
  return regionForTeam(me['Takim Adi'] || '');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Kadro her zaman Supabase'in O ANKİ hâli olmalı: ne tarayıcı ne Vercel
  // kenarı bu yanıtı saklamasın. Zoho→Supabase senkronu bir kişiyi taşıdığı
  // anda panel bir sonraki istekte yeni hâli görür.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

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
  const claims = verifyToken(bearerToken(req), AUTH_SECRET);
  if (!claims || !['team-leader', 'regional-manager', 'admin', 'super-admin'].includes(claims.r)) {
    res.status(401).json({ error: 'Yetkisiz erişim.' });
    return;
  }
  const isAdmin = ['admin', 'super-admin'].includes(claims.r);

  const H  = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY };
  const HJ = { ...H, 'Content-Type': 'application/json; charset=utf-8' };

  try {
    // Çağıranın GÜNCEL satırını kendi Username'inden çek — client'tan gelen
    // hiçbir "team" parametresine güvenilmez.
    const meR = await fetch(`${SUPABASE_URL}/rest/v1/Users?Username=eq.${encodeURIComponent(claims.u)}&select=*`, { headers: H });
    if (!meR.ok) { res.status(502).json({ error: 'Veritabanı hatası.' }); return; }
    const meRows = await meR.json();
    const me = meRows[0];
    if (!me) { res.status(401).json({ error: 'Kullanıcı bulunamadı.' }); return; }
    const myTeamRaw = String(me['Takim Adi'] || '').trim();

    // ── Yönetici atamaları (team_assignments) ─────────────────────────────
    // Kapsam hesabından ÖNCE okunuyor: çağıranın kendi takımı da elle
    // atanmış olabilir. Tablo kurulmamışsa boş Map ile devam edilir (eski
    // otomatik davranış) — bkz. api/_teams.js / team_assignments.sql.
    let assignmentsInstalled = true;   // team_assignments.sql çalıştırıldı mı
    let assignIdx = { byKey: new Map(), leaderOf: new Map() };
    {
      const ar = await fetchTeamAssignments(SUPABASE_URL, H);
      assignmentsInstalled = ar.installed !== false;
      assignIdx = buildAssignmentIndex(ar.rows);
    }
    const assignByKey = assignIdx.byKey;   // aşağıdaki çözümlemede kullanılıyor

    // Çağıranın ETKİN takımı — api/login.js ile AYNI kural (bkz. _teams.js
    // effectiveTeam). Eskiden yalnızca Users."Takim Adi" okunuyordu; o alan
    // bayat kaldığında takım lideri BAŞKA bir takımın kadrosunu görüyordu.
    let myTeam = effectiveTeam(
      assignIdx, me['Deal Owner Name'] || me['Username'] || '', me['Username'], myTeamRaw);

    // SON ÇARE — Zoho'da YENİ kurulmuş bir takım/lider için ne elle atama ne
    // Users."Takim Adi" henüz doğru olabilir: bu durumda kişi giriş yapar ama
    // hiçbir veri göremez (somut vaka: Bradley Grant/Anthony Cross, Ağustos
    // 2026 — "Kullanıcılar"dan doğru Zoho adıyla hesap açılıp Rol="Takım
    // Lideri" yapılmıştı ama myTeam hâlâ boş çıkıyordu). Yalnızca myTeam boşsa
    // VE gerçekten bir takım kapsamı gerektiren rol ise (team-leader) devreye
    // girer — normal isteklerde ek bir sorgu maliyeti YOK.
    if (!myTeam && claims.r === 'team-leader') {
      try {
        const who = me['Deal Owner Name'] || me['Username'] || '';
        const zr = await fetch(
          `${SUPABASE_URL}/rest/v1/zoho_users?select=full_name,role,status,exit_date&limit=2000`, { headers: H });
        if (zr.ok) {
          const zRows = await zr.json().catch(() => []);
          const meZoho = Array.isArray(zRows) ? zRows.find(z => nameKey(z.full_name) === nameKey(who)) : null;
          const zTeam = resolveOwnTeamFromZoho(meZoho, zRows);
          if (zTeam) myTeam = zTeam;
        }
      } catch (e) {}
    }

    function scopeRows(rows) {
      if (claims.r === 'team-leader') {
        // Yazım varyantı ("Arij Team" ↔ "Arij  Team") kişiyi listeden
        // düşürmesin — iki tarafı da kanonikleştirip karşılaştır.
        const mine = legacyNormalizeTeam(myTeam) || nameKey(myTeam);
        return {
          rows: rows.filter(u => {
            const t = String(u['Takim Adi'] || '').trim();
            return (legacyNormalizeTeam(t) || nameKey(t)) === mine;
          }),
          scopeLabel: myTeam,
        };
      }
      if (claims.r === 'regional-manager') {
        const region = regionForRm(me);
        return { rows: rows.filter(u => regionForTeam(u['Takim Adi']) === region), scopeLabel: region };
      }
      // admin / super-admin — tüm takımlar
      return { rows, scopeLabel: 'Tümü' };
    }

    // Çözümlenmiş takımı taşıyan zoho kayıtları için rol bazlı kapsam.
    // GÜVENLİK: kapsam yine İSTEMCİDEN GELEN parametreye değil, token'daki
    // kullanıcı adıyla Users'ta tekrar sorgulanan güncel role/takıma göre.
    function scopeZoho(items) {
      if (claims.r === 'team-leader') {
        // scopeRows ile AYNI kural olmak zorunda: iki tarafı da kanonikleştir,
        // kanonik yoksa nameKey'e düş. Eskiden burada ham `myTeam` ile katı
        // eşitlik vardı — "Arij Team" ↔ "Arij  Team" gibi tek bir yazım farkı
        // liderin kadrosunu TAMAMEN boşaltıyordu (aynı sayfada scopeRows
        // fallback'i vardı, burada yoktu: iki farklı sonuç).
        const mine = legacyNormalizeTeam(myTeam) || nameKey(myTeam);
        return {
          rows: items.filter(p => p.team && (legacyNormalizeTeam(p.team) || nameKey(p.team)) === mine),
          scopeLabel: myTeam,
        };
      }
      if (claims.r === 'regional-manager') {
        const region = regionForRm(me);
        return {
          rows: items.filter(p => {
            // Satış takımı olmayan birimler (Finance, Profclinic, Executive
            // Board...) bölge listesine girmesin — RM yalnızca kendi satış
            // takımlarını yönetiyor.
            if (!p.team) return false;
            return regionForTeam(p.team) === region;
          }),
          scopeLabel: region,
        };
      }
      // admin / super-admin — tüm kadro (satış dışı birimler dahil)
      return { rows: items, scopeLabel: 'Tümü' };
    }

    if (req.method === 'GET') {
      if (claims.r === 'team-leader' && !myTeam) { res.status(200).json({ team: '', members: [] }); return; }

      // DİKKAT: PostgREST yanıtları 1000 satırda KESİLİYOR (db-max-rows).
      // "limit=2000" yazmak bunu değiştirmiyor, yalnızca yanlış bir güven
      // veriyordu — tablo 1000 satırı geçince fazlası SESSİZCE düşerdi ve
      // kadronun bir kısmı kaybolurdu. Bu yüzden sayfalı çekiliyor.
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

      const [uRes, zRes] = await Promise.all([
        fetchAllPaged('Users?select=*&order=id.asc'),
        // zoho_users: Zoho org kullanıcılarının aynası. Tablo yoksa (404) ok:false
        // döner ve eski davranışa (yalnız Users) düşülür.
        fetchAllPaged('zoho_users?select=*&order=id.asc'),
      ]);
      if (!uRes.ok) { res.status(502).json({ error: 'Veritabanı hatası.' }); return; }
      const userRows = uRes.rows;
      const zohoRows = zRes.ok ? zRes.rows : [];

      // Onaylanmış hesap devirleri — tablo kurulmamışsa (zoho_account_handover.sql
      // henüz çalıştırılmadı) YA DA PostgREST şema önbelleği tabloyu az önce
      // eklendiği için henüz görmüyorsa (Supabase'de yeni tablo oluşturunca
      // şema önbelleğinin yenilenmesi birkaç dakika sürebilir) hoR.ok false
      // döner. Bu durum ESKİDEN sessizce yutulup boş Set ile devam ediliyordu
      // — admin onayladığı hâlde kişi hep "onaysız" gibi davranıyordu ve
      // kimse bunun sebebini göremiyordu. Artık durum admin'e açıkça bildirilir.
      const approvedHandovers = new Set();
      let handoverTableReady = true;
      {
        const hoR = await fetch(
          `${SUPABASE_URL}/rest/v1/account_handover_approvals?select=zoho_user_id,exit_date,start_date`,
          { headers: H });
        if (hoR.ok) {
          const hoRows = await hoR.json().catch(() => []);
          for (const h of (Array.isArray(hoRows) ? hoRows : [])) {
            approvedHandovers.add(handoverKey(h.zoho_user_id, h.exit_date, h.start_date));
          }
        } else {
          handoverTableReady = false;
        }
      }

      // Users tarafını isimle indeksle — Users."Deal Owner Name" ile
      // zoho_users.full_name aynı değer uzayında (Zoho görünen adı).
      const usersByName = new Map();
      for (const u of userRows) {
        const k = nameKey(u['Deal Owner Name'] || u['Username']);
        if (k && !usersByName.has(k)) usersByName.set(k, u);
      }

      // ── Kadro kaynağı: zoho_users (varsa) ─────────────────────────────
      // Önceden liste Users tablosundan geliyordu; Users yalnızca GİRİŞİ OLAN
      // kişileri tutuyor, dolayısıyla Zoho'da takımda olup henüz hesabı
      // açılmamış kişiler hiç görünmüyordu (Moutaharrik: Zoho'da 10 kişi,
      // Users'ta 1). Artık kadro Zoho'dan, giriş bilgisi Users'tan geliyor.
      let members;
      let scopeLabel;
      let unplaced = [];
      // Yönetici (takım lideri / sales master) rolünde olup hiçbir takıma
      // bağlanamayanlar — "unplaced"tan AYRI: bkz. _teams.js'teki büyük not
      // (Ağustos 2026 kök nedeni). Admin panelinde ayrı ve belirgin gösterilir.
      let newLeaderCandidates = [];
      let conflicts = [];
      let manualEmptyTeam = [];
      let handoverCandidates = [];
      let departedEmployees = [];
      // O an aktif kadrodan çıkarılan kanonik takım kümesi — admin panelindeki
      // "Takıma Ata" dropdown'unu yeni (henüz koda hiç eklenmemiş) takımlarla
      // beslemek için kullanılır (bkz. _teams.js discoverCanonicalTeams).
      let teamCatalog = [];
      // Dizin, kapsamlanmış listeyle AYNI çözümlemeyi kullansın diye dışarıda
      // tutuluyor — ikinci kez resolveZohoTeam çağırmak (deal yedeği olmadan)
      // iki yerde farklı takım üretebilirdi.
      let resolvedAll = null;
      if (zohoRows.length) {
        // ── Takım çözümlemesi ───────────────────────────────────────────
        // Kadroda kalan (ayrılmamış) herkes için takımı ÖNCE belirle, kapsamı
        // sonra uygula. Eskiden kapsam doğrudan legacyNormalizeTeam(z.role) ile
        // yapılıyordu; role tanınmayan bir yazımdaysa kişi takım liderinin
        // listesinden sessizce düşüyordu (somut vaka: Farah Team'deki
        // Salvatore De Luca — Zoho'da ve zoho_users'ta aktif, panelde yok).
        // Sistemden CIKARILMIS kisiler kadroda da gorunmez (bkz. _blocked-users.js) --
        // Takimimdaki Kisiler ve Gunluk Ekip Girisi ayni listeden besleniyor.
        //
        // isDeactivated: yöneticinin panelden "pasife aldığı" kişiler. Zoho
        // hâlâ aktif dese bile kadrodan düşer — danışmanların çoğunun Users
        // satırı olmadığı için bu karar team_assignments'ta tutuluyor
        // (Users.is_active yalnızca panele GİRİŞİ olan rolleri kapsıyor).
        const active = zohoRows.filter(z => {
          if (isBlocked(z.full_name) || isDeactivated(assignIdx, z.full_name, null)) return false;
          if (!isLeaver(z)) return true;
          // "Ayrılmış" görünüyor ama hesap sonradan devralınmış olabilir —
          // yalnızca admin onayladıysa kadroya dahil edilir (bkz. yukarıdaki
          // isHandoverCandidate notu).
          return isHandoverCandidate(z) &&
            approvedHandovers.has(handoverKey(z.id, z.exit_date, z.start_date));
        });

        // o an aktif kadrodan çıkarılan kanonik takım kümesi — yönetici
        // rollerini bulanık eşleştirmek (matchLeaderToCanonicalTeam) VE
        // admin panelindeki dinamik "Takıma Ata" dropdown'unu (teamCatalog)
        // beslemek için kullanılır. Statik DEĞİL, her istekte yeniden çıkarılır.
        const canonicalTeams = discoverCanonicalTeams(active);
        teamCatalog = canonicalTeams;

        // Katı sinyallerle (team / role / Users) yerleşemeyenler için son çare
        // deal taraması — YALNIZCA gerekliyse ve yalnızca o isimler için.
        // DİKKAT: bu koşul resolveZohoTeam'in adımlarının AYNISI olmalı,
        // yoksa deals taraması gereksiz çalışır ya da (daha kötüsü) gerekliyken
        // çalışmaz. Users tarafında legacyNormalizeTeam kullanılıyor: tanınmayan
        // bir yazım "takım var" sayılıp kişiyi yerleştirmesiz bırakmasın.
        const needDeals = active.filter(z => {
          // Yönetici ataması olan ya da satış dışı birimde olan kişi için deal
          // taramasına gerek yok — takımı zaten belli (ya da hiç olmamalı).
          if (assignByKey.has(nameKey(z.full_name))) return false;
          if (isNonSalesRole(z.role)) return false;
          if (legacyNormalizeTeam(z.team) || legacyNormalizeTeam(z.role)) return false;
          if (legacyLooseTeam(z.team) || legacyLooseTeam(z.role)) return false;
          // YENİ açık uçlu yollar: üye rolü kendi başına takımdır, yönetici
          // rolü canlı kümeyle bulanık eşleşiyor olabilir.
          if (!isBossRole(z.role)) { if (resolveMemberTeam(z.role)) return false; }
          else if (matchLeaderToCanonicalTeam(z.role, canonicalTeams)) return false;
          const u = usersByName.get(nameKey(z.full_name));
          if (u && legacyNormalizeTeam(u['Takim Adi'])) return false;
          return true;
        });
        const dealTeamByName = new Map();
        // 25'lik gruplar: tek büyük in.(...) hem URL'i şişirir hem de
        // limit=1000 penceresine çok sahip sığdığında eski deal'i olan kişinin
        // hiç satırı gelmez (en yeni 1000 deal genel olarak taranıyor).
        // Üst sınır bilinçli: en fazla 12 grup (300 kişi) sorgulanır; ötesi
        // bir veri bakımı sorunudur ve `unplaced` dökümünde görünür.
        for (let i = 0; i < needDeals.length && i < 25 * 12; i += 25) {
          const chunk = needDeals.slice(i, i + 25);
          // PostgREST in.(...) — isimlerde virgül/parantez olabilir, tırnakla.
          const list = chunk
            .map(z => '"' + String(z.full_name || '').replace(/"/g, '\\"') + '"')
            .join(',');
          const dr = await fetch(
            `${SUPABASE_URL}/rest/v1/deals?deal_owner=in.(${encodeURIComponent(list)})` +
            `&select=deal_owner,team&order=created_time.desc.nullslast&limit=1000`,
            { headers: H });
          if (!dr.ok) continue;
          const rows = await dr.json().catch(() => []);
          // Azalan sırada ilk görülen = en son deal'i.
          for (const row of (Array.isArray(rows) ? rows : [])) {
            const k = nameKey(row.deal_owner);
            if (!k || dealTeamByName.has(k)) continue;
            const c = legacyNormalizeTeam(row.team);
            if (c) dealTeamByName.set(k, c);
          }
        }

        const resolved = active.map(z => {
          const u = usersByName.get(nameKey(z.full_name)) || null;
          const rt = resolveZohoTeam(z, u, dealTeamByName, assignByKey, canonicalTeams);
          return {
            z, u, team: rt.team, teamSource: rt.source, manual: rt.manual === true,
            // Satış dışı birim: Finance, Executive Board, IT, Quality... Bu
            // kişilerin bir danışman takımına bağlanması ZATEN beklenmiyor.
            nonSales: rt.manual ? !rt.team : isNonSalesRole(z.role),
          };
        });

        // Hiçbir sinyalle takıma bağlanamayanlar SESSİZCE yutulmuyor —
        // admin panelinde "kimler?" dökümünde ham alanlarıyla listelenir.
        //
        // Satış dışı birimler bu dökümden ÇIKARILDI: uyarı 48 kişiyi
        // sayıyordu ve neredeyse tamamı Finance/Executive Board/IT gibi zaten
        // takımı olmaması gereken kişilerdi — gerçek sorunlar bu gürültünün
        // içinde görünmez hâle geliyordu. Artık uyarı yalnızca GERÇEKTEN
        // yerleştirilmesi gereken ama yerleştirilemeyen kişileri gösterir.
        //
        // YÖNETİCİ (lider/sales master) rolündeki yerleşemeyenler AYRI bir
        // döküm: bunlar "Yeni Takım/Lider Adayı" — Ağustos 2026'daki kök
        // sorunun ta kendisi (yeni bir sales master Zoho'da kurulup hiçbir
        // uyarı çıkmaması). Admin panelinde belirgin ve ayrı gösterilir,
        // genel "yerleşemedi" gürültüsüne karışmaz.
        unplaced = resolved.filter(p => !p.team && !p.nonSales && !isBossRole(p.z.role)).map(p => ({
          fullName: p.z.full_name || '',
          zohoRole: p.z.role || '',
          zohoTeam: p.z.team || '',
          email:    p.z.email || '',
          status:   p.z.status || '',
        }));
        newLeaderCandidates = resolved.filter(p => !p.team && !p.nonSales && isBossRole(p.z.role)).map(p => ({
          fullName: p.z.full_name || '',
          realName: p.z.original_agent_name || '',
          zohoRole: p.z.role || '',
          zohoTeam: p.z.team || '',
          email:    p.z.email || '',
          status:   p.z.status || '',
        }));

        // ── ÇELİŞKİ dökümü: Zoho bir takım diyor, Users başka bir takım ─────
        // "Takımımda olmayan kişi görünüyor" şikâyetinin kaynağı tam olarak bu:
        // biri Zoho'da takım değiştiriyor, Users'taki eski değer kalıyor.
        // Artık Zoho kazanıyor (bkz. resolveZohoTeam), ama kayıt DÜZELTİLMESİ
        // gerektiği için liste admin panelinde gösterilir — sessizce yutulmuyor.
        conflicts = resolved
          .map(p => {
            // Yönetici ataması bir "çelişki" değil, KARAR — uyarıya girmez.
            if (p.manual) return null;
            const uTeam = p.u && legacyNormalizeTeam(p.u['Takim Adi']);
            if (!p.team || !uTeam || uTeam === p.team) return null;
            return {
              fullName:  p.z.full_name || '',
              zohoTeam:  p.team,          // uygulanan (Zoho) takım
              usersTeam: uTeam,           // Users'taki bayat değer
              username:  p.u['Username'] || '',
              source:    p.teamSource || '',
            };
          })
          .filter(Boolean);

        // ── Elle "Satış Dışı" işaretlenmiş (takımı BOŞ) kayıtlar ───────────
        // Nicholas Parker vakasında bulunan üçüncü ve en sinsi sorun: admin
        // panelinden "Elle ata" ile bir kişiye takım seçilmeden (ya da
        // "— Satış Dışı —" seçilerek) kayıt yapılırsa team_assignments'ta
        // team=NULL bir satır oluşuyor. Bu, Zoho'nun doğru rol/takım bilgisini
        // EZER ve kişiyi Finance/IT gibi gerçekten satış dışı biriymiş gibi
        // davranmaya zorlar — hiçbir takım liderinin ekranında görünmez.
        // Admin ekranı ise ham Zoho rolünü YEDEK olarak gösterdiği için orada
        // "takımlı" görünüyormuş gibi YANILTICI bir izlenim verir (bkz.
        // members mapping'indeki `p.team || z.team || z.role` yedeği).
        // Bu liste, gerçek bir satış-dışı biriminin (rolü zaten tanınmayan)
        // elle "Satış Dışı" işaretlenmesiyle KARIŞMASIN diye yalnızca Zoho
        // rolü/takımı GERÇEKTEN bir satış takımına karşılık gelenleri gösterir
        // — aksi hâlde her gerçek Finance/IT kaydı da burada görünür ve
        // gürültü asıl sorunu gizlerdi (bkz. unplaced'teki aynı ders).
        manualEmptyTeam = resolved
          .filter(p => p.manual && !p.team && (legacyNormalizeTeam(p.z.team) || legacyNormalizeTeam(p.z.role)))
          .map(p => ({
            fullName: p.z.full_name || '',
            zohoRole: p.z.role || '',
            zohoTeam: p.z.team || '',
            suggestedTeam: legacyNormalizeTeam(p.z.team) || legacyNormalizeTeam(p.z.role) || '',
          }));

        // ── Hesap devri onayı bekleyenler + ayrılan kişiler arşivi ─────────
        // (bkz. yukarıdaki isHandoverCandidate notu ve zoho_account_handover.sql)
        // Yalnızca admin'e: bu bir veri bakımı/HR kararı, takım liderinin
        // ekranında karşılığı yok.
        if (isAdmin) {
          const leavers = zohoRows.filter(z => isLeaver(z) && z.exit_date);
          handoverCandidates = leavers
            .filter(z => isHandoverCandidate(z) &&
              !approvedHandovers.has(handoverKey(z.id, z.exit_date, z.start_date)))
            .map(z => ({
              zohoUserId: z.id || '',
              fullName:   z.full_name || '',
              email:      z.email || '',
              team:       z.team || z.role || '',
              exitDate:   z.exit_date || '',
              startDate:  z.start_date || '',
            }));

          // Zoho aynası hesap yeniden kullanıldığında ESKİ kişinin bilgisini
          // YENİ kişininkiyle EZER — bu yüzden "ayrılmış" gördüğümüz her anda
          // anlık görüntüyü kalıcı arşive yazıyoruz (aynı zoho_user_id+exit_date
          // için ikinci kez yazılmaz, bkz. ignore-duplicates). Admin isteğini
          // yavaşlatmasın diye sonucu beklemeden (fire-and-forget) gönderilir;
          // tablo henüz kurulmadıysa (zoho_account_handover.sql) sessizce yutulur.
          if (leavers.length) {
            const payload = leavers
              .map(z => ({
                zoho_user_id: String(z.id || ''),
                full_name:    z.full_name || null,
                email:        z.email || null,
                phone:        z.phone || z.mobile || null,
                team:         z.team || z.role || null,
                region:       z.region || null,
                exit_date:    z.exit_date,
              }))
              .filter(r => r.zoho_user_id);
            if (payload.length) {
              fetch(`${SUPABASE_URL}/rest/v1/departed_employees?on_conflict=zoho_user_id,exit_date`, {
                method: 'POST',
                headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
                body: JSON.stringify(payload),
              }).catch(() => {});
            }
          }

          const deR = await fetch(
            `${SUPABASE_URL}/rest/v1/departed_employees?select=*&order=exit_date.desc&limit=500`,
            { headers: H });
          if (deR.ok) {
            const deRows = await deR.json().catch(() => []);
            departedEmployees = (Array.isArray(deRows) ? deRows : []).map(d => ({
              zohoUserId: d.zoho_user_id || '',
              fullName:   d.full_name || '',
              email:      d.email || '',
              phone:      d.phone || '',
              team:       d.team || '',
              region:     d.region || '',
              exitDate:   d.exit_date || '',
            }));
          }
        }

        resolvedAll = resolved;
        // Satış dışı birimler kadro listesinden çıkarılıyor. Admin kapsamı
        // filtresizdi ve bu kişileri de listeliyordu; "Takımımdaki Kişiler"
        // bir SATIŞ kadrosu ekranı olduğu için Finance/IT/Executive Board
        // satırları hem listeyi hem de takım filtresini kirletiyordu.
        // İstisna: yönetici elle bir takım atadıysa (manual) kişi listede
        // kalır — yönetici kararı bu filtreden de güçlü.
        const scoped = scopeZoho(resolved.filter(p => !p.nonSales || p.manual));
        scopeLabel = scoped.scopeLabel;
        members = scoped.rows
          .map(p => {
            const z = p.z;
            const u = p.u;
            // Takım çözülemediyse (yalnızca admin kapsamında olabilir) ham
            // metni göster — boş hücre "takımı yok" bilgisini gizlerdi.
            const team = p.team || String(z.team || z.role || '').trim();
            // Telefon: elle girilen Users.Phone ÖNCELİKLİ (düzeltme amaçlı
            // girilmiş olabilir), yoksa Zoho phone, yoksa Zoho mobile.
            const phone = (u && u['Phone']) || z.phone || z.mobile || '';
            return {
              // Users satırı varsa gerçek Username, yoksa Zoho adından türetilmiş
              // kararlı anahtar (bkz. derivedUsername notu). Günlük Ekip Girişi
              // bu alanı kullanıyor; hasLogin ise gerçekten hesabı var mı der.
              username:   (u && u['Username']) || derivedUsername(z.full_name),
              fullName:   z.full_name || '',
              realName:   z.original_agent_name || '',
              role:       u ? (u['Role'] || '') : '',
              zohoRole:   z.role || '',
              team,
              region:     z.region || regionForTeam(team),
              phone,
              email:      z.email || (u && u['Email']) || '',
              seniority:  z.seniority_level || '',
              hasLogin:   !!(u && u['Username']),
              zohoUserId: z.id || '',
              teamSource: p.teamSource || '',
              // Panelde "elle atandı" kilidini göstermek için — bu kişinin
              // takımı yönetici kararıyla sabitlenmiş, senkron değiştirmez.
              manualTeam: p.manual === true,
            };
          });

        // ── Zoho aynasında HENÜZ olmayan ama Users'ta aktif duran kişiler ──
        // Ayna dış senkronla besleniyor; yeni açılan bir hesap aynaya düşene
        // kadar kadro listesinden tamamen kayboluyordu. Ayrılanlar geri
        // gelmiyor: senkron akışı ayrılanı Users'ta is_active=false yapıyor.
        {
          const inZoho = new Set(zohoRows.map(z => nameKey(z.full_name)));
          const extras = userRows.filter(u => {
            if (u['is_active'] === false) return false;
            if (isBlocked(u['Deal Owner Name'], u['Username'])) return false;
            const k = nameKey(u['Deal Owner Name'] || u['Username']);
            return k && !inZoho.has(k);
          });
          const scopedExtras = scopeRows(extras).rows;
          const already = new Set(members.map(m => nameKey(m.fullName)));
          for (const u of scopedExtras) {
            const fullName = u['Deal Owner Name'] || u['Username'] || '';
            if (already.has(nameKey(fullName))) continue;
            already.add(nameKey(fullName));
            members.push({
              username:   u['Username'] || '',
              fullName,
              realName:   '',
              role:       u['Role'] || '',
              zohoRole:   '',
              team:       String(u['Takim Adi'] || '').trim(),
              region:     regionForTeam(String(u['Takim Adi'] || '')),
              phone:      u['Phone'] || '',
              email:      u['Email'] || '',
              seniority:  '',
              hasLogin:   !!u['Username'],
              zohoUserId: u['zoho_user_id'] || '',
              teamSource: 'Users',
            });
          }
        }
      } else {
        // zoho_users yok — eski davranış (yalnız Users tablosu)
        const scoped = scopeRows(userRows.filter(u =>
          u['is_active'] !== false && !isBlocked(u['Deal Owner Name'], u['Username'])));
        scopeLabel = scoped.scopeLabel;
        members = scoped.rows.map(u => ({
          username: u['Username'] || '',
          fullName: u['Deal Owner Name'] || u['Username'] || '',
          realName: '',
          role:     u['Role'] || '',
          zohoRole: '',
          team:     String(u['Takim Adi'] || '').trim(),
          region:   regionForTeam(String(u['Takim Adi'] || '')),
          phone:    u['Phone'] || '',
          email:    u['Email'] || '',
          seniority: '',
          hasLogin: true,
          zohoUserId: '',
        }));
      }

      // ── Sahip → güncel takım dizini ───────────────────────────────────
      // KAPSAMDAN BAĞIMSIZ: her çağırana TÜM kadronun ad→takım eşlemesi
      // döner. Sebebi: bir deal/alarm satırının hangi takıma AİT olduğunu
      // artık sahibinin GÜNCEL takımı belirliyor (bkz. panellerdeki
      // effectiveTeam). Farah'ın paneli, Marco'nun Moutaharrik'e geçtiğini
      // bilmeden onun satırlarını listesinden düşüremez.
      //
      // GİZLİLİK: yalnızca görünen ad + kanonik takım adı. Telefon, e-posta,
      // rol, kıdem, Zoho id — hiçbiri yok. Bu ikisi zaten deals/alarms
      // tablolarında anon key'e açık (deal_owner, team), yani yeni bir bilgi
      // sızdırmıyor; sadece hangi eşleşmenin GÜNCEL olduğunu söylüyor.
      const directory = [];
      {
        const seenDir = new Set();
        const push = (name, team) => {
          const k = nameKey(name);
          if (!k || seenDir.has(k) || !team) return;
          seenDir.add(k);
          directory.push({ name: String(name).trim(), team });
        };
        if (resolvedAll) {
          for (const p of resolvedAll) if (p.team) push(p.z.full_name, p.team);
        }
        // Aynada olmayan ama Users'ta aktif duranlar
        for (const u of userRows) {
          if (u['is_active'] === false) continue;
          // Engelli kişi DİZİNE de girmemeli: dizin, deal/alarm satırlarının
          // hangi takıma ait olduğunu belirliyor. Testte yakalandı — kadro
          // listesini süzmek yetmiyordu, burası ayrı bir yol.
          if (isBlocked(u['Deal Owner Name'], u['Username'])) continue;
          const t = legacyNormalizeTeam(String(u['Takim Adi'] || '').trim());
          if (t) push(u['Deal Owner Name'] || u['Username'], t);
        }
      }

      members.sort((a, b) =>
        (a.team || '').localeCompare(b.team || '') || a.fullName.localeCompare(b.fullName));

      // ── Tanı aracı: ?debugPerson=<ad> ────────────────────────────────
      // "Onayladım ama görünmüyor" gibi şikâyetlerde canlı veriye doğrudan
      // erişim olmadan sebebi bulmak imkânsız hâle geliyordu. Bu, bir kişinin
      // kadro çözümlemesinin HER adımını (leaver mı, hesap devri şüphesi mi,
      // onaylanmış mı, hangi takıma çözüldü, son listeye girdi mi) admin'e
      // açıkça gösterir. Yalnızca admin, yalnızca query parametresi verilince.
      let debug = null;
      const debugQ = String(req.query?.debugPerson || '').trim();
      if (isAdmin && debugQ) {
        const qKey = nameKey(debugQ);
        // GERÇEK ADLA (original_agent_name) da ara — yalnızca Zoho sistem
        // adına (full_name, ör. "Anthony Cross") bakmak, admin gerçek adı
        // (ör. "Burak Kalkanoğlu") yazdığında kişiyi hiç bulamıyordu; bu
        // yüzden Ağustos 2026'daki vakada tanı aracı da işe yaramamıştı.
        const z = zohoRows.find(x =>
          nameKey(x.full_name).includes(qKey) || qKey.includes(nameKey(x.full_name)) ||
          (x.original_agent_name && (nameKey(x.original_agent_name).includes(qKey) || qKey.includes(nameKey(x.original_agent_name)))));
        if (!z) {
          debug = { found: false, query: debugQ, zohoRowCount: zohoRows.length };
        } else {
          const leaver = isLeaver(z);
          const handoverCand = isHandoverCandidate(z);
          const hKey = handoverKey(z.id, z.exit_date, z.start_date);
          const approved = approvedHandovers.has(hKey);
          const blocked = isBlocked(z.full_name);
          const deactivated = isDeactivated(assignIdx, z.full_name, null);
          const includedInActive = !blocked && !deactivated && (!leaver || (handoverCand && approved));
          const resolvedEntry = resolvedAll && resolvedAll.find(p => nameKey(p.z.full_name) === nameKey(z.full_name));
          const inMembers = members.find(m => nameKey(m.fullName) === nameKey(z.full_name));
          debug = {
            found: true,
            zoho: {
              id: z.id, full_name: z.full_name, realName: z.original_agent_name || '', status: z.status,
              exit_date: z.exit_date, start_date: z.start_date,
              team: z.team, role: z.role, region: z.region,
            },
            isLeaver: leaver,
            isHandoverCandidate: handoverCand,
            handoverKey: hKey,
            handoverTableReady,
            approvedHandoverCount: approvedHandovers.size,
            isApproved: approved,
            isBlocked: blocked,
            isDeactivated: deactivated,
            includedInActive,
            resolvedTeam: resolvedEntry ? resolvedEntry.team : null,
            teamSource: resolvedEntry ? resolvedEntry.teamSource : null,
            nonSales: resolvedEntry ? resolvedEntry.nonSales : null,
            manualTeam: resolvedEntry ? resolvedEntry.manual : null,
            inFinalMembersList: !!inMembers,
            finalMemberTeam: inMembers ? inMembers.team : null,
            callerScopeLabel: scopeLabel,
            callerRole: claims.r,
          };
        }
      }

      res.status(200).json({
        team: scopeLabel,
        members,
        source: zohoRows.length ? 'zoho_users' : 'Users',
        directory,
        // Kadro CANLI: her istek Supabase'e gidiyor, yanıt hiçbir katmanda
        // saklanmıyor. Panel bu damgayı "son güncelleme" olarak gösteriyor.
        fetchedAt: new Date().toISOString(),
        counts: { zoho: zohoRows.length, users: userRows.length, listed: members.length },
        // Takıma bağlanamayanlar ve Zoho↔Users çelişkileri yalnızca admin'e —
        // bunlar veri bakımı uyarısı, takım liderinin ekranında karşılığı yok
        // (ayrıca başka takımların kişilerini içerir).
        unplaced:  isAdmin ? unplaced  : [],
        // Yönetici (takım lideri / sales master) rolünde olup hiçbir takıma
        // bağlanamayanlar — Ağustos 2026 kök sorununun karşılığı, admin
        // panelinde ayrı ve belirgin bir bölümde gösterilmesi için "unplaced"
        // içine KARIŞTIRILMIYOR.
        newLeaderCandidates: isAdmin ? newLeaderCandidates : [],
        // O an aktif kadrodan çıkarılan kanonik takım kümesi — admin panelinin
        // "Takıma Ata" dropdown'unu ve TeamMap'i (window.TeamMap.learn) yeni
        // takımlarla besler, kod değişikliği/deploy gerekmeden.
        teamCatalog,
        conflicts: isAdmin ? conflicts : [],
        // Elle "Satış Dışı" (takımı boş) işaretlenmiş ama Zoho rolü/takımı
        // gerçek bir satış takımına karşılık gelen kayıtlar — bkz. yukarıdaki
        // manualEmptyTeam notu (Nicholas Parker vakasının 3. sorunu).
        manualEmptyTeam: isAdmin ? manualEmptyTeam : [],
        // Hesap devri onayı bekleyenler + ayrılan kişiler arşivi — yalnızca
        // admin'e (bkz. zoho_account_handover.sql).
        handoverCandidates: isAdmin ? handoverCandidates : [],
        departedEmployees:  isAdmin ? departedEmployees  : [],
        // false → account_handover_approvals tablosuna erişilemedi (kurulmamış
        // ya da Supabase şema önbelleği henüz yenilenmedi). Panel bunu admin'e
        // açıkça söylüyor — aksi hâlde onay sessizce hiçbir işe yaramaz.
        handoverTableReady: isAdmin ? handoverTableReady : undefined,
        debug: debug || undefined,
        // false → team_assignments.sql henüz çalıştırılmamış; elle takım
        // ataması yapılamaz. Panel bunu admin'e açıkça söylüyor (sessizce
        // çalışmayan bir buton bırakmak yerine).
        assignmentsInstalled: isAdmin ? assignmentsInstalled : undefined,
      });
      return;
    }

    // Hesap devri onayı — yalnızca admin/super-admin. Şüpheli hesabı (exit_date
    // geçmişte ama start_date daha sonra) kalıcı olarak "aktif say" listesine
    // ekler; bkz. yukarıdaki active filtresi ve zoho_account_handover.sql.
    if (req.method === 'POST') {
      if (!isAdmin) { res.status(403).json({ error: 'Yalnızca yönetici onaylayabilir.' }); return; }
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      if (body?.action !== 'approveHandover') {
        res.status(400).json({ error: 'Bilinmeyen işlem.' });
        return;
      }
      const zohoUserId = String(body?.zohoUserId || '').trim();
      const exitDate   = String(body?.exitDate || '').trim();
      const startDate  = String(body?.startDate || '').trim();
      if (!zohoUserId || !exitDate || !startDate) {
        res.status(400).json({ error: 'Eksik alan: zohoUserId, exitDate, startDate gerekli.' });
        return;
      }
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/account_handover_approvals?on_conflict=zoho_user_id,exit_date,start_date`,
        {
          method: 'POST',
          headers: { ...HJ, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            zoho_user_id: zohoUserId, exit_date: exitDate, start_date: startDate,
            approved_by: claims.u,
          }),
        });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        res.status(502).json({ error: 'Onay kaydedilemedi — account_handover_approvals tablosu kurulmamış olabilir ya da Supabase şema önbelleği SQL çalıştırıldıktan sonra henüz yenilenmedi (bir-iki dakika bekleyip tekrar deneyin, ya da Supabase SQL Editor\'de "NOTIFY pgrst, \'reload schema\';" çalıştırın). ' + detail });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'PATCH') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const targetUsername = String(body?.username || '').trim();
      const phone = String(body?.phone || '').trim();
      const email = String(body?.email || '').trim();
      if (!targetUsername) { res.status(400).json({ error: 'Kullanıcı adı gerekli.' }); return; }
      // Engelli kisi icin Users satiri OLUSTURULMAZ: bu uc telefon/e-posta
      // duzenlenirken satir yaratiyor, yani engel olmasa kisi Users tablosuna
      // arka kapidan geri girerdi.
      if (isBlocked(targetUsername)) {
        res.status(403).json({ error: 'Bu kisi sistemden cikarildi.' });
        return;
      }

      // Hedef kullanıcı GERÇEKTEN çağıranın izinli kapsamında mı — server-side doğrula.
      const targetR = await fetch(`${SUPABASE_URL}/rest/v1/Users?Username=eq.${encodeURIComponent(targetUsername)}&select=*`, { headers: H });
      if (!targetR.ok) { res.status(502).json({ error: 'Veritabanı hatası.' }); return; }
      const targetRows = await targetR.json();
      const target = targetRows[0];

      // Kadro artık zoho_users'tan geliyor ve danışmanlara login açılmıyor, yani
      // listedeki çoğu kişinin Users satırı YOK. Eskiden burada 404 dönüyordu ve
      // telefon/e-posta düzenlenemiyordu. Artık satır yazma anında oluşturuluyor:
      // Users bu sistemde hem kadro hem (varsa) giriş tablosu.
      //
      // GİRİŞ AÇILMIYOR: Password boş bırakılıyor. api/login.js şifre alanı boş
      // gelen isteği 400 ile reddediyor ve hash'siz karşılaştırmada
      // stored.trim() === password.trim() olduğu için boş şifreyle giriş
      // mümkün değil. Role de boş → normalizeRole 'agent' döner ve agent'a
      // token verilmiyor.
      let targetTeam;
      let pendingCreate = null;   // Users satırı yoksa, izin verildikten SONRA oluşturulacak kayıt
      if (target) {
        // Yönetici ataması varsa yetki kontrolü de ONA göre olmalı: aksi hâlde
        // elle kendi takımına atanmış bir kişiyi takım lideri listesinde
        // GÖRÜYOR ama düzenleyemiyordu (403) — GET ile PATCH farklı takım
        // hesaplıyordu.
        const ovT = assignByKey.get(nameKey(target['Deal Owner Name'] || target['Username'] || ''));
        targetTeam = (ovT && ovT.team) || String(target['Takim Adi'] || '').trim();
      } else {
        // Users'ta yok — Zoho kadrosunda gerçekten var mı ve hangi takımda?
        const zAllR = await fetch(`${SUPABASE_URL}/rest/v1/zoho_users?select=id,full_name,role,email&limit=2000`, { headers: H });
        if (!zAllR.ok) { res.status(404).json({ error: 'Kullanıcı bulunamadı.' }); return; }
        const zAll = await zAllR.json();
        // Eşleştirme, GET'te üretilen anahtarın aynısıyla: gerçek Username yoksa
        // Zoho adından türetilen değer kullanılıyor.
        const z = zAll.find(x => derivedUsername(x.full_name) === targetUsername);
        if (!z) { res.status(404).json({ error: 'Kullanıcı bulunamadı.' }); return; }
        // GET'teki resolveZohoTeam ile aynı öncelik: önce yönetici ataması.
        const ovZ = assignByKey.get(nameKey(z.full_name));
        targetTeam = (ovZ && ovZ.team)
          || legacyNormalizeTeam(z.role) || String(z.role || '').trim();
        // Kapsam kontrolü aşağıda targetTeam ile yapılıyor; oluşturma ancak
        // izin verildikten sonra (allowed) gerçekleşiyor.
        pendingCreate = { username: targetUsername, fullName: z.full_name || '', team: targetTeam, email: z.email || '' };
      }

      let allowed = false;
      if (claims.r === 'team-leader') allowed = targetTeam === myTeam;
      else if (claims.r === 'regional-manager') allowed = regionForTeam(targetTeam) === regionForRm(me);
      else allowed = true; // admin / super-admin

      if (!allowed) { res.status(403).json({ error: 'Bu kullanıcı senin yetki alanında değil.' }); return; }

      if (pendingCreate) {
        const c = pendingCreate;
        // insertUserRow: id belirtmeden POST, Users.id "GENERATED BY DEFAULT
        // AS IDENTITY" olsa da tablo Excel'den açık id'lerle yüklendiği için
        // identity dizisi bir dolu değere çarpıp 23505 ile SESSİZCE
        // başarısız olabiliyordu — bu satır hiç kalıcı olmaz, telefon/e-posta
        // her kaydedişte "eski değere geri dönmüş" gibi görünürdü (bkz.
        // _teams.js insertUserRow yorumu — somut vaka: Nabil Aissaoui).
        const ins = await insertUserRow(SUPABASE_URL, H, HJ, {
          Username: c.username,
          'Deal Owner Name': c.fullName,
          'Takim Adi': c.team,
          Role: '',                       // agent — token verilmez
          Password: null,                 // giriş mümkün değil
          Phone: phone || null,
          Email: email || c.email || null,
        });
        if (!ins.ok) { res.status(ins.status || 502).json({ error: ins.error }); return; }
        res.status(200).json({ ok: true, created: true });
        return;
      }

      // Users.id bigint JS safe-integer sınırını aşabiliyor — id yerine
      // Username (text) ile hedefle (bkz. proje hafızası: users_table_security_gap).
      const patchR = await fetch(`${SUPABASE_URL}/rest/v1/Users?Username=eq.${encodeURIComponent(targetUsername)}`, {
        method: 'PATCH',
        headers: { ...HJ, Prefer: 'return=minimal' },
        body: JSON.stringify({ Phone: phone || null, Email: email || null }),
      });
      if (!patchR.ok) { res.status(502).json({ error: 'Veritabanı hatası.' }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası: ' + e.message });
  }
}
