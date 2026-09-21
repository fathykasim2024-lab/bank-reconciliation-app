import { handleRecalc } from './logic/recalc.js';
import { handleReview } from './logic/review.js';
import { handleMemo } from './logic/memo.js';
import { createSessionCookie, verifySession } from './auth/session.js';

const CLIENT_COOKIE = 'recon_session';
const ADMIN_COOKIE = 'recon_admin';
const CLIENT_MAX_AGE = 60 * 60 * 24 * 30; // 30 يوم
const ADMIN_MAX_AGE = 60 * 60 * 24 * 7;   // 7 أيام

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
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
      if (!session) {
        return jsonResponse({ error: 'جلستك منتهية، سجل دخول تاني' }, 401);
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
      return env.ASSETS.fetch(new Request(new URL('/login.html', url), request));
    }
    if (path === '/admin' || path === '/admin.html') {
      return env.ASSETS.fetch(new Request(new URL('/admin.html', url), request));
    }

    // ---------- أي حاجة تانية (التطبيق الأساسي والملفات الثابتة) تحتاج جلسة عميل ----------
    const session = await verifySession(getCookie(request, CLIENT_COOKIE), env.SESSION_SECRET);
    if (!session) {
      return Response.redirect(new URL('/login.html', url), 302);
    }
    return env.ASSETS.fetch(request);
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
    const clients = list.keys.map(k => ({
      code: k.name,
      name: (k.metadata && k.metadata.name) || '',
      active: !(k.metadata && k.metadata.active === false)
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

    const data = { name, active: true, createdAt: Date.now() };
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
