// دالة سيرفر: تكتشف أخطاء اختيار "التسوية" في الجداول الأربعة
// تطبق نفس منطق صفحة "مراجعة الاخطاء" الأصلي (الأعمدة L إلى Q):
//   L = كل الأرقام الفريدة في القائمة الأصلية (مدين الدفاتر / دائن البنك ... إلخ حسب الجدول)
//   M = عدد تكرار الرقم في القائمة "الخاصة بالجدول" (own)
//   P = عدد تكرار الرقم في القائمة "المقابلة" (counterpart)
//   N = عدد مرات اختيار "تسوية" (adjust) لهذا الرقم في الجدول المعروض فعليًا
//   O = IF(M>=P, M-N, P-N)
//   Q = O - P   → صفر يعني التسوية سليمة، غير الصفر يعني وجود خطأ

function roundKey(n) {
  return Math.round(n * 100) / 100;
}

function countMap(list) {
  const m = {};
  list.forEach((item) => {
    const k = roundKey(item.amount);
    if (k <= 0) return;
    m[k] = (m[k] || 0) + 1;
  });
  return m;
}

function detectErrors(ownList, cpList, tableRows) {
  const M = countMap(ownList);
  const P = countMap(cpList);

  const N = {};
  (tableRows || []).forEach((r) => {
    if (r.selected) {
      const k = roundKey(r.amount);
      N[k] = (N[k] || 0) + 1;
    }
  });

  const uniqueAmounts = Object.keys(M).map(Number);
  const errors = [];

  uniqueAmounts.forEach((amt) => {
    const m = M[amt] || 0;
    const p = P[amt] || 0;
    const n = N[amt] || 0;
    const o = m >= p ? m - n : p - n;
    const q = o - p;
    if (q !== 0) {
      errors.push({ amount: amt, error: q });
    }
  });

  return errors;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    const body = JSON.parse(event.body);
    const booksEntries = body.booksEntries || [];
    const bankEntries = body.bankEntries || [];
    const tables = body.tables || {};

    const booksDebit = booksEntries.filter((e) => e.debit > 0).map((e) => ({ amount: e.debit }));
    const booksCredit = booksEntries.filter((e) => e.credit > 0).map((e) => ({ amount: e.credit }));
    const bankDebit = bankEntries.filter((e) => e.debit > 0).map((e) => ({ amount: e.debit }));
    const bankCredit = bankEntries.filter((e) => e.credit > 0).map((e) => ({ amount: e.credit }));

    const errors1 = detectErrors(booksDebit, bankCredit, tables.t1);
    const errors2 = detectErrors(bankCredit, booksDebit, tables.t2);
    const errors3 = detectErrors(booksCredit, bankDebit, tables.t3);
    const errors4 = detectErrors(bankDebit, booksCredit, tables.t4);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t1: errors1, t2: errors2, t3: errors3, t4: errors4 }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
