// دالة سيرفر: تستقبل الجداول الأربعة (بعد اختيارات المستخدم) وترجع مذكرة التسوية وقيود التطبيق

function sumSelected(list) {
  return (list || []).filter((r) => r.selected).reduce((s, r) => s + r.amount, 0);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    const body = JSON.parse(event.body);
    const tables = body.tables || {};
    const booksBalance = body.booksBalance || 0;
    const bankBalance = body.bankBalance || 0;

    const e4 = sumSelected(tables.t1); // يخصم من مدين الدفاتر
    const e5 = sumSelected(tables.t2); // يضاف الى مدين الدفاتر
    const e6 = sumSelected(tables.t3); // يخصم من دائن الدفاتر
    const e7 = sumSelected(tables.t4); // يضاف الى دائن الدفاتر

    const booksAfter = booksBalance - e4 + e5 + e6 - e7;
    const diff = bankBalance + booksAfter;
    const matched = Math.abs(diff) < 0.01;

    const del1 = (tables.t1 || []).filter((r) => r.selected); // تحذف من مدين الدفاتر
    const del3 = (tables.t3 || []).filter((r) => r.selected); // تحذف من دائن الدفاتر
    const add2 = (tables.t2 || []).filter((r) => r.selected); // تضاف الى مدين الدفاتر
    const add4 = (tables.t4 || []).filter((r) => r.selected); // تضاف الى دائن الدفاتر

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        e4,
        e5,
        e6,
        e7,
        booksBefore: booksBalance,
        bankBalance,
        booksAfter,
        matched,
        apply: { del1, del3, add2, add4 },
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
