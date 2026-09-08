// دالة سيرفر: تستقبل حركات الدفاتر والبنك وترجع الأرصدة والجداول الأربعة
// هذا الملف يعمل على السيرفر فقط ولا يصل أبدًا لكود المتصفح

function roundKey(n) {
  return Math.round(n * 100) / 100;
}

function computeRunningBalance(entries, opening) {
  let bal = opening || 0;
  entries.forEach((e) => {
    bal = bal + (e.debit || 0) - (e.credit || 0);
    e.balance = bal;
  });
  return bal;
}

function buildTableList(ownList, cpList) {
  const ownCounts = {};
  ownList.forEach((item) => {
    const k = roundKey(item.amount);
    ownCounts[k] = (ownCounts[k] || 0) + 1;
  });
  const cpCounts = {};
  cpList.forEach((item) => {
    const k = roundKey(item.amount);
    cpCounts[k] = (cpCounts[k] || 0) + 1;
  });
  return ownList
    .filter((item) => item.amount > 0)
    .filter((item) => {
      const k = roundKey(item.amount);
      return (ownCounts[k] || 0) > (cpCounts[k] || 0);
    })
    .map((item, idx) => {
      const k = roundKey(item.amount);
      return {
        ...item,
        rowId: idx + "_" + k + "_" + Math.random().toString(36).slice(2, 8),
        selected: false,
        ownCount: ownCounts[k] || 0,
        cpCount: cpCounts[k] || 0,
      };
    });
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    const body = JSON.parse(event.body);
    const booksEntries = body.booksEntries || [];
    const bankEntries = body.bankEntries || [];
    const openingBooks = body.openingBooks || 0;
    const openingBank = body.openingBank || 0;

    const booksBalance = computeRunningBalance(booksEntries, openingBooks);
    const bankBalance = computeRunningBalance(bankEntries, openingBank);

    const booksDebit = booksEntries
      .filter((e) => e.debit > 0)
      .map((e) => ({ date: e.date, ref: e.ref, desc: e.desc, amount: e.debit }));
    const booksCredit = booksEntries
      .filter((e) => e.credit > 0)
      .map((e) => ({ date: e.date, ref: e.ref, desc: e.desc, amount: e.credit }));
    const bankDebit = bankEntries
      .filter((e) => e.debit > 0)
      .map((e) => ({ date: e.date, ref: e.ref, desc: e.desc, amount: e.debit }));
    const bankCredit = bankEntries
      .filter((e) => e.credit > 0)
      .map((e) => ({ date: e.date, ref: e.ref, desc: e.desc, amount: e.credit }));

    const t1 = buildTableList(booksDebit, bankCredit);
    const t2 = buildTableList(bankCredit, booksDebit);
    const t3 = buildTableList(booksCredit, bankDebit);
    const t4 = buildTableList(bankDebit, booksCredit);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        booksBalance,
        bankBalance,
        tables: { t1, t2, t3, t4 },
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
