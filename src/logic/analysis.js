import { roundKey } from './core.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function toSerial(y, m, d) {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

// يحوّل قيمة التاريخ (رقم إكسل أو نص) لرقم قابل للترتيب، أو null لو مش مفهوم
function dateKey(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return toSerial(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return toSerial(+m[3], +m[2], +m[1]);
  }
  return null;
}

function same(a, b) {
  return String(a == null ? '' : a) === String(b == null ? '' : b);
}

/* كشف الحساب الدفترى بعد التسوية:
   - نحذف القيود الدفترية غير الموجودة بالبنك (المحددة في الجدولين 1 و3)
   - نضيف قيود البنك غير الموجودة بالدفاتر (المحددة في الجدولين 2 و4)
   - نحسب الرصيد الجاري والرصيد الختامي ونقارنه برصيد البنك */
export async function handleAnalysis(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'بيانات غير صالحة' }, 400);
  }

  const { openingBooks = 0, booksEntries = [], tables = {}, bankBalance = 0 } = body;
  if (!Array.isArray(booksEntries)) {
    return jsonResponse({ error: 'صيغة الحركات غير صحيحة' }, 400);
  }

  const entries = booksEntries.map(e => ({
    date: e.date, ref: e.ref, desc: e.desc,
    debit: Number(e.debit) || 0, credit: Number(e.credit) || 0
  }));

  const removed = new Set();
  let unmatchedRemovals = 0;
  function markRemoved(rows, field) {
    (rows || []).filter(r => r.selected).forEach(r => {
      const amt = roundKey(Number(r.amount) || 0);
      for (let i = 0; i < entries.length; i++) {
        if (removed.has(i)) continue;
        const e = entries[i];
        if (roundKey(e[field]) === amt && same(e.date, r.date) && same(e.ref, r.ref) && same(e.desc, r.desc)) {
          removed.add(i);
          return;
        }
      }
      unmatchedRemovals++;
    });
  }
  markRemoved(tables.t1, 'debit');   // مدين الدفاتر غير الموجود بالبنك
  markRemoved(tables.t3, 'credit');  // دائن الدفاتر غير الموجود بالبنك

  const combined = [];
  entries.forEach((e, i) => {
    if (!removed.has(i)) combined.push({ ...e, added: false, order: i });
  });
  let k = 0;
  (tables.t2 || []).filter(r => r.selected).forEach(r => {   // دائن البنك غير الموجود بمدين الدفاتر
    combined.push({ date: r.date, ref: r.ref, desc: r.desc, debit: Number(r.amount) || 0, credit: 0, added: true, order: 1e9 + k++ });
  });
  (tables.t4 || []).filter(r => r.selected).forEach(r => {   // مدين البنك غير الموجود بدائن الدفاتر
    combined.push({ date: r.date, ref: r.ref, desc: r.desc, debit: 0, credit: Number(r.amount) || 0, added: true, order: 1e9 + k++ });
  });

  // نرتب بالتاريخ بس لو كل التواريخ مفهومة، غير كده نسيب الترتيب الأصلي والمضاف في الآخر
  const keys = combined.map(r => dateKey(r.date));
  const sorted = combined.length > 0 && keys.every(x => x !== null);
  if (sorted) {
    combined.forEach((r, i) => { r._k = keys[i]; });
    combined.sort((a, b) => (a._k - b._k) || (a.order - b.order));
  }

  let bal = Number(openingBooks) || 0;
  let totalDebit = 0, totalCredit = 0;
  const seen = {};
  const rows = combined.map(r => {
    bal = bal + r.debit - r.credit;
    totalDebit += r.debit;
    totalCredit += r.credit;
    const side = r.debit > 0 ? 'receipt' : (r.credit > 0 ? 'payment' : null);
    let key = null;
    if (side) {
      const base = [side, r.date, r.ref, r.desc, roundKey(r.debit || r.credit)].join('|');
      seen[base] = (seen[base] || 0) + 1;
      key = base + '|' + seen[base];
    }
    return { key, side, date: r.date, ref: r.ref, desc: r.desc, debit: r.debit, credit: r.credit, balance: bal, added: r.added };
  });

  const finalBalance = bal;
  const bankBal = Number(bankBalance) || 0;
  const difference = bankBal + finalBalance;

  return jsonResponse({
    openingBooks: Number(openingBooks) || 0,
    rows,
    finalBalance,
    totalDebit, totalCredit,
    bankBalance: bankBal,
    difference,
    matched: Math.abs(difference) < 0.01,
    removedCount: removed.size,
    addedCount: rows.filter(r => r.added).length,
    unmatchedRemovals,
    sorted
  });
}
