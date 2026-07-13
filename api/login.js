// Kimlik doğrulama sunucu tarafında yapılır — service_role key (gizli,
// sadece burada/Vercel env'de) ile Users tablosuna erişir. Tarayıcı hiçbir
// zaman Users tablosuna veya Password alanına doğrudan dokunmaz.
//
// Geriye dönük uyumluluk: eski kayıtlarda şifre düz metin duruyor olabilir.
// Böyle bir kayıtla ilk başarılı giriş yapıldığında şifre otomatik olarak
// bcrypt ile hashlenip veritabanına yazılır ("lazy migration") — ayrı bir
// toplu migrasyon script'i gerekmez, her kullanıcı ilk girişinde kendiliğinden
// güvenli hale gelir.
import bcrypt from 'bcryptjs';

const FALLBACK_URL = 'https://aztxfncqanrodbttywrb.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const SUPABASE_URL   = process.env.SUPABASE_URL || FALLBACK_URL;
  const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    res.status(500).json({ error: 'Sunucu yapılandırma hatası: SUPABASE_SERVICE_ROLE_KEY eksik.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  if (!username || !password) { res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli.' }); return; }

  const H = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/Users?Username=eq.${encodeURIComponent(username)}&select=*`, { headers: H });
    if (!r.ok) { res.status(502).json({ error: 'Veritabanı hatası.' }); return; }
    const rows = await r.json();
    if (!rows.length) { res.status(401).json({ error: 'Kullanıcı bulunamadı.' }); return; }

    const user = rows[0];
    const stored = String(user['Password'] || '');
    const isHashed = /^\$2[aby]\$/.test(stored);

    let ok = false;
    if (isHashed) {
      ok = await bcrypt.compare(password, stored);
    } else {
      ok = stored.trim() === password.trim();
      if (ok) {
        // Başarılı giriş — şifreyi hashleyip yaz, bir daha düz metin olarak kalmasın
        const newHash = await bcrypt.hash(password, 10);
        fetch(`${SUPABASE_URL}/rest/v1/Users?id=eq.${user.id}`, {
          method: 'PATCH',
          headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ Password: newHash })
        }).catch(() => {});
      }
    }

    if (!ok) { res.status(401).json({ error: 'Şifre hatalı.' }); return; }

    delete user.Password; // Client'a asla şifre/hash dönmez
    res.status(200).json({ ok: true, user });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası: ' + e.message });
  }
}
