/* ============================================================
   core.js — منطق المطابقة البنكية (السري)
   لا تُرسل أي جزء من هذا الملف للفرونت إند أبدًا.
   ============================================================ */

export function roundKey(n) {
  return Math.round(n * 100) / 100;
}

export function computeRunningBalance(entries, opening) {
  let bal = opening || 0;
  const withBalance = entries.map(e => {
    bal = bal + (Number(e.debit) || 0) - (Number(e.credit) || 0);
    return { ...e, debit: Number(e.debit) || 0, credit: Number(e.credit) || 0, balance: bal };
  });
  return { entries: withBalance, finalBalance: bal };
}

export function buildTableList(ownList, cpList) {
  const ownCounts = {};
  ownList.forEach(item => {
    const k = roundKey(item.amount);
    ownCounts[k] = (ownCounts[k] || 0) + 1;
  });
  const cpCounts = {};
  cpList.forEach(item => {
    const k = roundKey(item.amount);
    cpCounts[k] = (cpCounts[k] || 0) + 1;
  });
  return ownList
    .filter(item => item.amount > 0)
    .filter(item => (ownCounts[roundKey(item.amount)] || 0) > (cpCounts[roundKey(item.amount)] || 0))
    .map(item => ({
      ...item,
      selected: false,
      ownCount: ownCounts[roundKey(item.amount)] || 0,
      cpCount: cpCounts[roundKey(item.amount)] || 0
    }));
}

export function countMapAmounts(list) {
  const m = {};
  list.forEach(item => {
    const k = roundKey(item.amount);
    if (k <= 0) return;
    m[k] = (m[k] || 0) + 1;
  });
  return m;
}

export function detectTableErrors(ownList, cpList, tableRows) {
  const M = countMapAmounts(ownList);
  const P = countMapAmounts(cpList);
  const N = {};
  (tableRows || []).forEach(r => {
    if (r.selected) {
      const k = roundKey(r.amount);
      N[k] = (N[k] || 0) + 1;
    }
  });
  const uniqueAmounts = Object.keys(M).map(Number);
  const errors = [];
  uniqueAmounts.forEach(amt => {
    const m = M[amt] || 0;
    const p = P[amt] || 0;
    const n = N[amt] || 0;
    const o = (m >= p) ? (m - n) : (p - n);
    const q = o - p;
    if (q !== 0) {
      errors.push({ amount: amt, error: q });
    }
  });
  return errors;
}

export function sumSelected(list) {
  return (list || []).filter(r => r.selected).reduce((s, r) => s + (Number(r.amount) || 0), 0);
}
