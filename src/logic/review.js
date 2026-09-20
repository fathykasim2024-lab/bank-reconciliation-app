import { detectTableErrors } from './core.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleReview(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'بيانات غير صالحة' }, 400);
  }

  const { booksEntries = [], bankEntries = [], tables = {} } = body;

  const booksDebit = booksEntries.filter(e => e.debit > 0).map(e => ({ amount: e.debit }));
  const booksCredit = booksEntries.filter(e => e.credit > 0).map(e => ({ amount: e.credit }));
  const bankDebit = bankEntries.filter(e => e.debit > 0).map(e => ({ amount: e.debit }));
  const bankCredit = bankEntries.filter(e => e.credit > 0).map(e => ({ amount: e.credit }));

  const data = {
    t1: detectTableErrors(booksDebit, bankCredit, tables.t1),
    t2: detectTableErrors(bankCredit, booksDebit, tables.t2),
    t3: detectTableErrors(booksCredit, bankDebit, tables.t3),
    t4: detectTableErrors(bankDebit, booksCredit, tables.t4)
  };

  return jsonResponse(data);
}
