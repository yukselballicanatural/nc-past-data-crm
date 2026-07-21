// Basit HMAC-imzalı oturum token'ı — Supabase Auth henüz yok, ama
// api/admin-users.js gibi service_role kullanan endpoint'lerin "çağıran
// gerçekten giriş yapmış bir admin mi" diye doğrulayabilmesi için bir
// asgari kimlik kanıtı gerekiyor. Token sadece api/login.js'te başarılı
// şifre kontrolünden SONRA üretilir; AUTH_TOKEN_SECRET yalnızca sunucuda
// (Vercel env) bulunur, tarayıcı hiçbir zaman görmez.
import crypto from 'crypto';

export function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  return payload;
}

// Serbest metin Role değerini ("Super Admin", "Regional Manager", "Team
// Leader", "Agent" vb.) diğer panellerdeki aynı mantıkla normalize eder.
export function normalizeRole(rawRole) {
  const r = String(rawRole || 'agent').toLowerCase().trim();
  if (r.includes('super')) return 'super-admin';
  if (r.includes('admin')) return 'admin';
  if (r.includes('regional') || r.includes('manager') || r.includes('rm')) return 'regional-manager';
  if (r.includes('leader') || r.includes('tl')) return 'team-leader';
  return 'agent';
}

export function bearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : '';
}
