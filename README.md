# bank-reconciliation-app — هيكلة Frontend / Backend

## الفكرة
- `public/index.html` → الواجهة فقط (رفع ملفات، عرض، طباعة/PDF). لا يوجد بها أي معادلات مطابقة.
- `src/worker.js` + `src/logic/*.js` → Cloudflare Worker بيستقبل الحركات الخام ويرجع النتائج المحسوبة فقط عبر 3 مسارات:
  - `POST /api/recalc` — الأرصدة وجداول الفروقات
  - `POST /api/review` — أخطاء المراجعة
  - `POST /api/memo` — مذكرة التسوية النهائية
- كل خوارزمية المطابقة (roundKey matching, buildTableList, detectTableErrors, sumSelected) موجودة فقط في `src/logic/core.js` على السيرفر — مش بتتبعت للمتصفح أبدًا.

## هيكل الملفات
```
wrangler.toml
public/
  index.html
src/
  worker.js
  logic/
    core.js
    recalc.js
    review.js
    memo.js
```

## الرفع لـ GitHub / Cloudflare
1. انسخ الملفات دي فوق الملفات الموجودة في الريبو `fathykasim2024-lab/bank-reconciliation-app` (استبدل الملف القديم `نموذج_مطابقات_اون_لاين.html` بـ `public/index.html`).
2. تأكد إن `wrangler.toml` موجود في جذر الريبو.
3. Push على GitHub — Cloudflare Workers/Pages هيعمل auto-deploy لأن الربط أصلاً متظبط.
4. بعد الديبلوي، جرب افتح الموقع وارفع ملفي الدفاتر والبنك — هتلاقي كل الحسابات بتتم زي الأول بالظبط، بس دلوقتي عن طريق استدعاءات لسيرفر Cloudflare.

## ملاحظة عن roundKey
دالة `roundKey` (تقريب لأقرب 2 رقم عشري) لسه موجودة كمان في الفرونت إند لأنها مستخدمة في خاصية "البحث بالمبلغ" في تاب البحث، وهي مجرد تقريب رقمي بسيط مش جزء من خوارزمية المطابقة، فمفيش داعي لنقلها.

## الخطوة الجاية بعد كده
إعداد Cloudflare Access للدخول بالدعوة فقط (بديل Netlify Identity) — دي كانت الخطوة اللي بعد كده في الخطة.
