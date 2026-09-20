import { sumSelected } from './core.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleMemo(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'بيانات غير صالحة' }, 400);
  }

  const { booksBalance = 0, bankBalance = 0, tables = {} } = body;

  const e4 = sumSelected(tables.t1);
  const e5 = sumSelected(tables.t2);
  const e6 = sumSelected(tables.t3);
  const e7 = sumSelected(tables.t4);

  const booksAfter = booksBalance - e4 + e5 + e6 - e7;
  const diff = bankBalance + booksAfter;
  const matched = Math.abs(diff) < 0.01;

  const del1 = (tables.t1 || []).filter(r => r.selected);
  const del3 = (tables.t3 || []).filter(r => r.selected);
  const add2 = (tables.t2 || []).filter(r => r.selected);
  const add4 = (tables.t4 || []).filter(r => r.selected);

  return jsonResponse({
    e4, e5, e6, e7,
    booksBefore: booksBalance,
    bankBalance,
    booksAfter, matched,
    apply: { del1, del3, add2, add4 }
  });
}
