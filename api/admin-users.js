// Admin panelindeki "Users" sayfasının (listeleme/ekleme/düzenleme/silme)
// tüm Users tablosu erişimi buradan geçer — service_role key ile, sunucu
// tarafında. Bu sayede Users tablosunun RLS'i anon key'e tamamen
// kapatılabilir (bkz. admin_summary_rpc.sql yanındaki lockdown SQL'i) —
// tarayıcı artık bu tabloya hiçbir zaman doğrudan dokunmuyor.
//
// Not: Bu endpoint'in KENDİSİ, çağıranın gerçekten giriş yapmış bir admin
// olduğunu doğrulayan bir JWT/Auth kontrolü yapmıyor — sistemde henüz gerçek
// oturum (Supabase Auth) olmadığı için bu mümkün değil. Yine de bu, mevcut
// (anon key ile Users tablosunun herkese açık okunabilmesi) durumdan çok
// daha güvenli: artık dışarıdan biri sadece herkese açık anon key'i bilerek
// Users tablosunu doğrudan sorgulayamaz. Gerçek "sadece admin çağırabilir"
// garantisi, planlanan Supabase Auth geçişiyle birlikte gelecek.
import bcrypt from 'bcryptjs';

const FALLBACK_URL = 'https://aztxfncqanrodbttywrb.supabase.co';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const SUPABASE_URL = process.env.SUPABASE_URL || FALLBACK_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    res.status(500).json({ error: 'Sunucu yapılandırma hatası: SUPABASE_SERVICE_ROLE_KEY eksik.' });
    return;
  }
  const H  = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY };
  const HJ = { ...H, 'Content-Type': 'application/json; charset=utf-8' };

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/Users?select=*&order=id.asc&limit=1000`, { headers: H });
      if (!r.ok) { res.status(502).json({ error: 'Veritabanı hatası.' }); return; }
      const users = await r.json();
      // Password alanı listeleme ekranında ASLA düz metin/hash olarak dönmez.
      users.forEach(u => { delete u.Password; });
      res.status(200).json({ users });
      return;
    }

    if (req.method === 'POST') {
      const payload = { ...(body?.payload || {}) };
      if (payload.Password) payload.Password = await bcrypt.hash(payload.Password, 10);
      const r = await fetch(`${SUPABASE_URL}/rest/v1/Users`, {
        method: 'POST',
        headers: { ...HJ, Prefer: 'return=representation' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) { res.status(502).json({ error: await r.text() }); return; }
      const created = await r.json();
      if (Array.isArray(created)) created.forEach(u => { delete u.Password; });
      res.status(200).json({ ok: true, user: created?.[0] || null });
      return;
    }

    if (req.method === 'PATCH') {
      const { id, username, payload: rawPayload } = body || {};
      if (!id && !username) { res.status(400).json({ error: 'id veya username gerekli.' }); return; }
      const payload = { ...(rawPayload || {}) };
      // Şifre alanı boş bırakılmışsa (kullanıcı değiştirmek istemiyor) hiç
      // gönderilmesin — boş string'i hashleyip üzerine yazmayalım.
      if (!payload.Password) delete payload.Password;
      else payload.Password = await bcrypt.hash(payload.Password, 10);
      const filterKey = username ? `Username=eq.${encodeURIComponent(username)}` : `id=eq.${encodeURIComponent(id)}`;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/Users?${filterKey}`, {
        method: 'PATCH',
        headers: { ...HJ, Prefer: 'return=minimal' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) { res.status(502).json({ error: await r.text() }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'DELETE') {
      const { id, username } = body || {};
      if (!id && !username) { res.status(400).json({ error: 'id veya username gerekli.' }); return; }
      const filterKey = username ? `Username=eq.${encodeURIComponent(username)}` : `id=eq.${encodeURIComponent(id)}`;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/Users?${filterKey}`, {
        method: 'DELETE',
        headers: { ...H, Prefer: 'return=minimal' }
      });
      if (!r.ok) { res.status(502).json({ error: await r.text() }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası: ' + e.message });
  }
}
