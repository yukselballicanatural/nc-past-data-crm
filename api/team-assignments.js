// Kalıcı takım ataması uç noktası — admin panelindeki "Takıma Ata" işlemi.
//
// Şema ve tasarım gerekçeleri: team_assignments.sql
// Ortak kurallar (nameKey / satış dışı roller): api/_teams.js
//
// GÜVENLİK
// - Yalnızca admin / super-admin. Bu tablo KİMİN HANGİ TAKIMI GÖRDÜĞÜNÜ
//   belirliyor; bir takım liderinin kendini başka bir takıma atayıp o takımın
//   verisine erişmesi mümkün OLMAMALI. Bu yüzden team-leader/regional-manager
//   bu uca hiç erişemez (team-members.js'te izinli oldukları hâlde).
// - Yazma yolu service_role ile; tablo RLS ile anon/authenticated'a kapalı.
import { verifyToken, bearerToken } from './_auth.js';
import { isBlocked } from './_blocked-users.js';
import { teamNameKey } from './_teams.js';

const FALLBACK_URL = 'https://aztxfncqanrodbttywrb.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

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
  if (!claims || !['admin', 'super-admin'].includes(claims.r)) {
    res.status(401).json({ error: 'Yetkisiz erişim.' });
    return;
  }

  const H  = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY };
  const HJ = { ...H, 'Content-Type': 'application/json; charset=utf-8' };

  // Tablo kurulmamışsa (SQL hiç çalıştırılmadıysa) kullanıcıya NE YAPACAĞINI
  // söyleyen açık bir mesaj dön — sessiz 404 veya boş liste, "kaydetmedi ama
  // hata da vermedi" gibi teşhis edilemez bir duruma yol açıyordu.
  const NOT_INSTALLED = {
    error: 'team_assignments tablosu veritabanında yok. Depodaki team_assignments.sql ' +
           'dosyasını Supabase SQL Editor\'de bir kez çalıştırın.',
  };

  try {
    if (req.method === 'GET') {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/team_assignments?select=*&order=full_name.asc&limit=1000`,
        { headers: H }
      );
      if (r.status === 404) { res.status(503).json(NOT_INSTALLED); return; }
      if (!r.ok) { res.status(502).json({ error: 'Veritabanı hatası.' }); return; }
      const rows = await r.json();
      res.status(200).json({ assignments: Array.isArray(rows) ? rows : [] });
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

      const fullName = String(body?.fullName || '').trim();
      if (!fullName) { res.status(400).json({ error: 'fullName zorunlu.' }); return; }
      if (isBlocked(fullName)) { res.status(403).json({ error: 'Bu kullanıcı üzerinde işlem yapılamaz.' }); return; }

      const personKey = teamNameKey(fullName);
      if (!personKey) { res.status(400).json({ error: 'Geçersiz ad.' }); return; }

      // team === null → "satış dışı" (kadroda görünmez). Boş string de NULL
      // sayılıyor: HTML select'ten boş değer gelebiliyor ve ikisinin farklı
      // anlama gelmesi teşhis edilemez bir tuzak olurdu.
      const rawTeam = body?.team;
      const team = (rawTeam === null || rawTeam === undefined || String(rawTeam).trim() === '')
        ? null : String(rawTeam).trim();

      // isActive gönderilmediyse DEĞİŞTİRME (varsayılan true): "takıma ata"
      // işlemi, daha önce pasife alınmış birini sessizce geri aktifleştirmesin.
      const isActive = (body?.isActive === undefined || body?.isActive === null)
        ? undefined : body.isActive !== false;

      const row = {
        person_key: personKey,
        full_name: fullName,
        zoho_user_id: body?.zohoUserId ? String(body.zohoUserId) : null,
        team,
        is_leader: body?.isLeader === true,
        assigned_by: claims.u || null,
        assigned_at: new Date().toISOString(),
        note: body?.note ? String(body.note).slice(0, 500) : null,
      };
      if (isActive !== undefined) row.is_active = isActive;

      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/team_assignments?on_conflict=person_key`,
        {
          method: 'POST',
          headers: { ...HJ, Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(row),
        }
      );
      if (r.status === 404) { res.status(503).json(NOT_INSTALLED); return; }
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        res.status(502).json({ error: 'Atama kaydedilemedi (HTTP ' + r.status + ') ' + detail.slice(0, 200) });
        return;
      }
      const saved = await r.json().catch(() => null);

      // ── Panele GİRİŞİ olan roller için Users.is_active de güncellenir ──
      // Ayrım önemli: danışmanlar bu panele zaten giremiyor (hesapları yok),
      // onlar için "pasife alma" yalnızca kadrodan düşmek demek ve yukarıdaki
      // team_assignments kaydı bunu tek başına sağlıyor. Takım lideri / bölge
      // müdürü / admin ise giriş yapabiliyor; onların GİRİŞİNİN de kapanması
      // gerekiyor — o alan Users.is_active (bkz. api/login.js).
      //
      // "En iyi çaba": Users satırı yoksa ya da is_active kolonu şemada
      // yoksa işlem yine BAŞARILI sayılır, çünkü asıl karar (kadrodan
      // düşürme) zaten yazıldı. Durum yanıtta `loginBlocked` ile bildirilir.
      let loginBlocked = null;
      if (isActive !== undefined) {
        try {
          const uR = await fetch(
            `${SUPABASE_URL}/rest/v1/Users?select=Username,Role&or=(` +
            `"Deal Owner Name".eq.${encodeURIComponent(fullName)},` +
            `Username.eq.${encodeURIComponent(fullName)})&limit=1`,
            { headers: H });
          const uRows = uR.ok ? await uR.json().catch(() => []) : [];
          const uname = uRows && uRows[0] && uRows[0]['Username'];
          if (uname) {
            const pR = await fetch(
              `${SUPABASE_URL}/rest/v1/Users?Username=eq.${encodeURIComponent(uname)}`,
              { method: 'PATCH', headers: { ...HJ, Prefer: 'return=minimal' },
                body: JSON.stringify({ is_active: isActive }) });
            loginBlocked = pR.ok ? !isActive : null;
          }
        } catch (e) { /* kadro kararı yazıldı; giriş engeli en iyi çaba */ }
      }

      // ── Bu kişinin MEVCUT deal'lerini de yeni takıma taşı (isteğe bağlı) ──
      // team_assignments kaydı yalnızca kadro/izin belirler; deals.team
      // Zoho mirror'ı olduğu için elle atama tek başına deal'lerin
      // görünümünü DEĞİŞTİRMEZ (Team Group her yerde deals.team'den türetilir).
      // moveDeals=true ise ve gerçek bir satış takımı seçildiyse (team boş
      // değilse), o kişinin sahibi olduğu tüm deal'lerin team kolonu burada
      // doğrudan güncellenir — admin panelden onay alınmış, açık bir istek.
      // DİKKAT: deals Zoho'dan senkronlanıyor; Zoho'daki Team alanı hâlâ
      // eskiyse, o deal Zoho tarafından tekrar senkronlandığında bu değer
      // sessizce eski takıma dönebilir. Bu, bu deponun dışındaki bir sürecin
      // sınırı — kalıcı çözüm Zoho'da da takımın güncellenmesidir.
      let movedDeals = null;
      if (body?.moveDeals === true && team) {
        try {
          const dR = await fetch(
            `${SUPABASE_URL}/rest/v1/deals?deal_owner=ilike.${encodeURIComponent(fullName)}`,
            {
              method: 'PATCH',
              headers: { ...HJ, Prefer: 'return=representation' },
              body: JSON.stringify({ team }),
            }
          );
          if (dR.ok) {
            const updated = await dR.json().catch(() => []);
            movedDeals = Array.isArray(updated) ? updated.length : 0;
          } else {
            movedDeals = { error: 'HTTP ' + dR.status };
          }
        } catch (e) { movedDeals = { error: e.message }; }
      }

      res.status(200).json({
        ok: true,
        assignment: Array.isArray(saved) ? saved[0] : saved,
        loginBlocked,
        movedDeals,
      });
      return;
    }

    if (req.method === 'DELETE') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      // Silme, atamayı KALDIRIR — kişi yeniden otomatik (Zoho) çözümlemeye döner.
      const personKey = teamNameKey(body?.personKey || body?.fullName || '');
      if (!personKey) { res.status(400).json({ error: 'personKey veya fullName zorunlu.' }); return; }

      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/team_assignments?person_key=eq.${encodeURIComponent(personKey)}`,
        { method: 'DELETE', headers: { ...HJ, Prefer: 'return=minimal' } }
      );
      if (r.status === 404) { res.status(503).json(NOT_INSTALLED); return; }
      if (!r.ok) { res.status(502).json({ error: 'Atama silinemedi (HTTP ' + r.status + ').' }); return; }
      res.status(200).json({ ok: true, removed: personKey });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası: ' + e.message });
  }
}
