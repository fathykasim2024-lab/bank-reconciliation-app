import { computeRunningBalance, buildTableList } from './core.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleRecalc(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'بيانات غير صالحة' }, 400);
  }

  const {
    openingBooksDebit = 0, openingBooksCredit = 0,
    openingBankDebit = 0, openingBankCredit = 0,
    booksEntries = [], bankEntries = []
  } = body;

  if (!Array.isArray(booksEntries) || !Array.isArray(bankEntries)) {
    return jsonResponse({ error: 'صيغة الحركات غير صحيحة' }, 400);
  }

  const openingBooks = (Number(openingBooksDebit) || 0) - (Number(openingBooksCredit) || 0);
  const openingBank = (Number(openingBankDebit) || 0) - (Number(openingBankCredit) || 0);

  const booksResult = computeRunningBalance(booksEntries, openingBooks);
  const bankResult = computeRunningBalance(bankEntries, openingBank);

  const booksDebit = booksResult.entries.filter(e => e.debit > 0).map(e => ({ date: e.date, ref: e.ref, desc: e.desc, amount: e.debit }));
  const booksCredit = booksResult.entries.filter(e => e.credit > 0).map(e => ({ date: e.date, ref: e.ref, desc: e.desc, amount: e.credit }));
  const bankDebit = bankResult.entries.filter(e => e.debit > 0).map(e => ({ date: e.date, ref: e.ref, desc: e.desc, amount: e.debit }));
  const bankCredit = bankResult.entries.filter(e => e.credit > 0).map(e => ({ date: e.date, ref: e.ref, desc: e.desc, amount: e.credit }));

  const tables = {
    t1: buildTableList(booksDebit, bankCredit),
    t2: buildTableList(bankCredit, booksDebit),
    t3: buildTableList(booksCredit, bankDebit),
    t4: buildTableList(bankDebit, booksCredit)
  };

  return jsonResponse({
    openingBooks, openingBank,
    booksBalance: booksResult.finalBalance,
    bankBalance: bankResult.finalBalance,
    booksEntries: booksResult.entries,
    bankEntries: bankResult.entries,
    tables
  });
}
