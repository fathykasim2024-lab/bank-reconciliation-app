import { handleRecalc } from './logic/recalc.js';
import { handleReview } from './logic/review.js';
import { handleMemo } from './logic/memo.js';
import { createSessionCookie, verifySession } from './auth/session.js';

const CLIENT_COOKIE = 'recon_session';
const ADMIN_COOKIE = 'recon_admin';
const CLIENT_MAX_AGE = 60 * 60 * 24 * 3;  // 3 أيام (بتخلي "مرات الدخول" مؤشر حقيقي على النشاط ومشاركة الكود)
const ADMIN_MAX_AGE = 60 * 60 * 24 * 7;   // 7 أيام

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookieHeader(name, value, maxAgeSeconds) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearCookieHeader(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// بيجيب الملف من ASSETS وبيمنع أي تخزين مؤقت له (Cache) - سواء في المتصفح
// أو في شبكة Cloudflare نفسها - عشان محدش يشوف نسخة اتحفظت لزائر تاني
async function fetchAssetNoStore(env, request) {
  const assetResponse = await env.ASSETS.fetch(request);
  const response = new Response(assetResponse.body, assetResponse);
  response.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  response.headers.delete('ETag');
  return response;
}

// مش بيكفي إن الجلسة موقّعة صح - لازم نتأكد كل مرة إن العميل لسه موجود
// ومفعّل في KV، عشان لو الأدمن حذف أو أوقف عميل، أي جلسة شغالة بتاعه
// تتقفل فورًا مش تستنى لحد ما تنتهي بمفردها
async function isClientStillActive(env, code) {
  if (!code) return false;
  const raw = await env.CLIENTS.get(code);
  if (!raw) return false;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return false;
  }
  return data.active !== false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ---------- نقاط الدخول/الخروج (متاحة للجميع) ----------
    if (method === 'POST' && path === '/api/client-login') {
      return handleClientLogin(request, env);
    }
    if (method === 'POST' && path === '/api/logout') {
      return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearCookieHeader(CLIENT_COOKIE) });
    }
    if (method === 'POST' && path === '/api/admin-login') {
      return handleAdminLogin(request, env);
    }
    if (method === 'POST' && path === '/api/admin-logout') {
      return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearCookieHeader(ADMIN_COOKIE) });
    }

    // ---------- واجهة برمجية للأدمن (محمية) ----------
    if (path.startsWith('/api/admin/')) {
      const adminSession = await verifySession(getCookie(request, ADMIN_COOKIE), env.SESSION_SECRET);
      if (!adminSession || !adminSession.admin) {
        return jsonResponse({ error: 'غير مصرح، سجل دخول كأدمن' }, 401);
      }
      return handleAdminApi(request, env, path, method);
    }

    // ---------- واجهة المطابقة (محمية بجلسة عميل) ----------
    if (path === '/api/recalc' || path === '/api/review' || path === '/api/memo') {
      const session = await verifySession(getCookie(request, CLIENT_COOKIE), env.SESSION_SECRET);
      if (!session || !(await isClientStillActive(env, session.code))) {
        return jsonResponse(
          { error: 'جلستك منتهية أو حسابك موقوف، سجل دخول تاني' },
          401,
          { 'Set-Cookie': clearCookieHeader(CLIENT_COOKIE) }
        );
      }
      if (method !== 'POST') {
        return jsonResponse({ error: 'طريقة غير مسموحة' }, 405);
      }
      if (path === '/api/recalc') return handleRecalc(request);
      if (path === '/api/review') return handleReview(request);
      return handleMemo(request);
    }

    // ---------- صفحات عامة دايمًا (تسجيل دخول العميل ولوحة الأدمن) ----------
    if (path === '/login' || path === '/login.html') {
      return fetchAssetNoStore(env, new Request(new URL('/login', url), request));
    }
    if (path === '/admin' || path === '/admin.html') {
      return fetchAssetNoStore(env, new Request(new URL('/admin', url), request));
    }

    // ---------- أي حاجة تانية (التطبيق الأساسي والملفات الثابتة) تحتاج جلسة عميل ----------
    const session = await verifySession(getCookie(request, CLIENT_COOKIE), env.SESSION_SECRET);
    if (!session || !(await isClientStillActive(env, session.code))) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: new URL('/login', url).toString(),
          'Set-Cookie': clearCookieHeader(CLIENT_COOKIE)
        }
      });
    }
    return fetchAssetNoStore(env, request);
  }
};

async function handleClientLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'بيانات غير صالحة' }, 400);
  }

  const code = String(body.code || '').trim();
  if (!code) return jsonResponse({ error: 'من فضلك اكتب الكود' }, 400);

  const raw = await env.CLIENTS.get(code);
  if (!raw) return jsonResponse({ error: 'الكود غير صحيح' }, 401);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: 'خطأ في بيانات العميل' }, 500);
  }

  if (data.active === false) {
    return jsonResponse({ error: 'الحساب موقوف حاليًا، تواصل مع الإدارة' }, 403);
  }

  // تسجيل عدد مرات الدخول، تاريخ أول دخول، وسجل الدخول (لحساب آخر 30 يوم لاحقًا)
  const now = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  data.loginCount = (data.loginCount || 0) + 1;
  if (!data.firstLogin) data.firstLogin = now;
  data.lastLogin = now;

  const timestamps = Array.isArray(data.loginTimestamps) ? data.loginTimestamps : [];
  timestamps.push(now);
  // نحتفظ بس بآخر 30 يوم (مع حد أقصى احترازي 1000 قيمة) عشان الملف مايكبرش من غير داعي
  const cutoff = now - THIRTY_DAYS_MS;
  data.loginTimestamps = timestamps.filter(t => t >= cutoff).slice(-1000);

  await env.CLIENTS.put(code, JSON.stringify(data), {
    metadata: { name: data.name, active: data.active !== false }
  });

  const cookieVal = await createSessionCookie({ code, name: data.name }, env.SESSION_SECRET, CLIENT_MAX_AGE);
  return jsonResponse(
    { ok: true, name: data.name },
    200,
    { 'Set-Cookie': setCookieHeader(CLIENT_COOKIE, cookieVal, CLIENT_MAX_AGE) }
  );
}

async function handleAdminLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'بيانات غير صالحة' }, 400);
  }

  const password = String(body.password || '');
  if (!env.ADMIN_PASSWORD || password !== env.ADMIN_PASSWORD) {
    return jsonResponse({ error: 'كلمة السر غير صحيحة' }, 401);
  }

  const cookieVal = await createSessionCookie({ admin: true }, env.SESSION_SECRET, ADMIN_MAX_AGE);
  return jsonResponse(
    { ok: true },
    200,
    { 'Set-Cookie': setCookieHeader(ADMIN_COOKIE, cookieVal, ADMIN_MAX_AGE) }
  );
}

async function handleAdminApi(request, env, path, method) {
  if (path === '/api/admin/clients' && method === 'GET') {
    const list = await env.CLIENTS.list();
    const now = Date.now();
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;

    const clients = await Promise.all(list.keys.map(async (k) => {
      let data = {};
      try {
        const raw = await env.CLIENTS.get(k.name);
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      const timestamps = Array.isArray(data.loginTimestamps) ? data.loginTimestamps : [];
      const login30d = timestamps.filter(t => t >= cutoff).length;

      return {
        code: k.name,
        name: data.name || (k.metadata && k.metadata.name) || '',
        active: data.active !== false,
        loginCount: data.loginCount || 0,
        firstLogin: data.firstLogin || null,
        lastLogin: data.lastLogin || null,
        login30d
      };
    }));

    clients.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return jsonResponse({ clients });
  }

  if (path === '/api/admin/clients' && method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'بيانات غير صالحة' }, 400);
    }
    const name = String(body.name || '').trim();
    const code = String(body.code || '').trim();
    if (!name || !code) return jsonResponse({ error: 'الاسم والكود مطلوبين' }, 400);

    const existing = await env.CLIENTS.get(code);
    if (existing) return jsonResponse({ error: 'الكود ده مستخدم قبل كده لعميل تاني' }, 409);

    const data = { name, active: true, createdAt: Date.now(), loginCount: 0, firstLogin: null, lastLogin: null, loginTimestamps: [] };
    await env.CLIENTS.put(code, JSON.stringify(data), {
      metadata: { name, active: true }
    });
    return jsonResponse({ ok: true });
  }

  if (path === '/api/admin/clients/toggle' && method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'بيانات غير صالحة' }, 400);
    }
    const code = String(body.code || '').trim();
    const raw = await env.CLIENTS.get(code);
    if (!raw) return jsonResponse({ error: 'العميل غير موجود' }, 404);

    const data = JSON.parse(raw);
    data.active = !(data.active !== false);
    await env.CLIENTS.put(code, JSON.stringify(data), {
      metadata: { name: data.name, active: data.active }
    });
    return jsonResponse({ ok: true, active: data.active });
  }

  if (path === '/api/admin/clients/delete' && method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'بيانات غير صالحة' }, 400);
    }
    const code = String(body.code || '').trim();
    await env.CLIENTS.delete(code);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'مسار غير موجود' }, 404);
}
