// أدوات إنشاء والتحقق من كوكي الجلسة الموقّع (HMAC-SHA256)
// تُستخدم لكل من جلسة العميل وجلسة الأدمن

function base64urlEncode(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function utf8ToBytes(str) {
  return new TextEncoder().encode(str);
}

async function getKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    utf8ToBytes(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(data, secret) {
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, utf8ToBytes(data));
  return base64urlEncode(new Uint8Array(sig));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// payload: object عادي (زي {code, name} أو {admin: true})
// maxAgeSeconds: مدة صلاحية الجلسة بالثواني
export async function createSessionCookie(payload, secret, maxAgeSeconds) {
  const exp = Date.now() + maxAgeSeconds * 1000;
  const body = JSON.stringify({ ...payload, exp });
  const payloadB64 = base64urlEncode(utf8ToBytes(body));
  const sig = await sign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

// بيرجع الـ payload لو الكوكي سليم وموقّع صح ولسه في مدته، وإلا null
export async function verifySession(cookieValue, secret) {
  if (!cookieValue || !secret) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;

  let expectedSig;
  try {
    expectedSig = await sign(payloadB64, secret);
  } catch {
    return null;
  }
  if (!timingSafeEqual(sig, expectedSig)) return null;

  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
  } catch {
    return null;
  }
  if (!data.exp || Date.now() > data.exp) return null;
  return data;
}
