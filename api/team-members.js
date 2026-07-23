// "Takımımdaki Kişiler" sayfasının (team-leader.html) Users tablosu erişimi
// buradan geçer — service_role key ile, sunucu tarafında. Users tablosu
// anon key'e tamamen kapalı (bkz. users_rls_lockdown.sql / rls_hardening.sql),
// bu yüzden tarayıcı bu tabloya asla doğrudan dokunmuyor.
//
// Auth: çağıranın api/login.js'te üretilen, süresi dolmamış ve
// team-leader/regional-manager/admin/super-admin rolüne ait bir token'ı
// Authorization: Bearer başlığında göndermesi ZORUNLU.
//
// Kapsam GÜVENLİĞİ: hangi takımın üyelerini görebileceği/güncelleyebileceği
// İSTEMCİDEN GELEN bir parametreden değil, token'daki kullanıcı adıyla
// Users tablosunda TEKRAR sorgulanan güncel "Takim Adi" değerinden belirlenir
// — bir Team Leader başka bir takımın telefon numarasını asla göremez/değiştiremez.
import { verifyToken, bearerToken } from './_auth.js';

const FALLBACK_URL = 'https://aztxfncqanrodbttywrb.supabase.co';

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
  const claims = verifyToken(bearerToken(req), AUTH_SECRET);
  if (!claims || !['team-leader', 'regional-manager', 'admin', 'super-admin'].includes(claims.r)) {
    res.status(401).json({ error: 'Yetkisiz erişim.' });
    return;
  }

  const H  = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY };
  const HJ = { ...H, 'Content-Type': 'application/json; charset=utf-8' };

  try {
    // Çağıranın GÜNCEL takımını kendi satırından çek — client'tan gelen
    // hiçbir "team" parametresine güvenilmez. select=* kullanılıyor (admin-users.js
    // ile aynı desen) — kolon adlarında boşluk olduğu için (ör. "Takim Adi")
    // select param'ında tek tek quoted kolon listelemek yerine tüm satırı çekip
    // JS'te seçmek daha güvenli/basit.
    const meR = await fetch(`${SUPABASE_URL}/rest/v1/Users?Username=eq.${encodeURIComponent(claims.u)}&select=*`, { headers: H });
    if (!meR.ok) { res.status(502).json({ error: 'Veritabanı hatası.' }); return; }
    const meRows = await meR.json();
    const me = meRows[0];
    if (!me) { res.status(401).json({ error: 'Kullanıcı bulunamadı.' }); return; }
    const myTeam = String(me['Takim Adi'] || '').trim();
    if (!myTeam) { res.status(200).json({ members: [] }); return; }

    if (req.method === 'GET') {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/Users?select=*&order=id.asc&limit=1000`, { headers: H });
      if (!r.ok) { res.status(502).json({ error: 'Veritabanı hatası.' }); return; }
      const rows = await r.json();
      const members = rows
        .filter(u => String(u['Takim Adi'] || '').trim() === myTeam)
        .map(u => ({
          username: u['Username'] || '',
          fullName: u['Deal Owner Name'] || u['Username'] || '',
          role: u['Role'] || '',
          phone: u['Phone'] || '',
          email: u['Email'] || '',
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
      res.status(200).json({ team: myTeam, members });
      return;
    }

    if (req.method === 'PATCH') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const targetUsername = String(body?.username || '').trim();
      const phone = String(body?.phone || '').trim();
      const email = String(body?.email || '').trim();
      if (!targetUsername) { res.status(400).json({ error: 'Kullanıcı adı gerekli.' }); return; }

      // Hedef kullanıcı GERÇEKTEN çağıranın kendi takımında mı — server-side doğrula.
      const targetR = await fetch(`${SUPABASE_URL}/rest/v1/Users?Username=eq.${encodeURIComponent(targetUsername)}&select=*`, { headers: H });
      if (!targetR.ok) { res.status(502).json({ error: 'Veritabanı hatası.' }); return; }
      const targetRows = await targetR.json();
      const target = targetRows[0];
      if (!target || String(target['Takim Adi'] || '').trim() !== myTeam) {
        res.status(403).json({ error: 'Bu kullanıcı senin takımında değil.' });
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
