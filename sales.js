/* sales.js — หน้ายอดขาย: ตัวเลขสรุป + กราฟรายวัน + สินค้าขายดี + บิลล่าสุด */

const $ = (id) => document.getElementById(id);
const el = {
  stats: $('stats'), bars: $('bars'), chartNote: $('chartNote'), chartRange: $('chartRange'),
  rangePick: $('rangePick'),
  topBody: $('topBody'), topEmpty: $('topEmpty'),
  billList: $('billList'), billEmpty: $('billEmpty'),
  exportCsv: $('exportCsv'), undoBill: $('undoBill'),
  toast: $('toast'),
};

let days = 14;   // ช่วงเวลาที่กำลังดู

const baht = (n) => '฿' + Math.round(n).toLocaleString('th-TH');
const timeOf = (iso) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
const dateOf = (iso) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1800);
}

/* ---------- ตัวเลขสรุป ---------- */
function renderStats() {
  const today = Sales.summary(Sales.lastDays(1));
  const period = Sales.summary(Sales.lastDays(days));
  const cycle = Settings.cycleStatus();

  const tiles = [
    { label: 'ยอดขายวันนี้', value: baht(today.total), sub: `${today.count} บิล · ${today.qty} ชิ้น` },
    { label: `ยอดขาย ${days} วัน`, value: baht(period.total), sub: `${period.count} บิล` },
    { label: 'เฉลี่ยต่อบิล', value: baht(period.average), sub: `จาก ${period.count} บิล` },
    {
      label: 'รอบสั่งของ',
      value: cycle.remaining > 0 ? `อีก ${cycle.remaining} วัน` : 'ถึงรอบแล้ว',
      sub: `วันที่ ${Math.max(cycle.elapsed, 0) + 1} ของรอบ ${cycle.cycleDays} วัน`,
      accent: cycle.remaining <= 3,
    },
  ];

  el.stats.innerHTML = tiles.map((t) => `
    <div class="stat${t.accent ? ' accent' : ''}">
      <p class="stat-label">${t.label}</p>
      <p class="stat-value">${t.value}</p>
      <p class="stat-sub">${t.sub}</p>
    </div>`).join('');
}

/* ---------- กราฟแท่งรายวัน ---------- */
function renderChart() {
  const rows = Sales.byDay(days);
  const max = Math.max(...rows.map((r) => r.total), 1);
  const todayKey = rows[rows.length - 1].key;

  el.chartRange.textContent = `${days} วันล่าสุด`;
  el.bars.innerHTML = rows.map((r) => {
    const pct = (r.total / max) * 100;
    const isToday = r.key === todayKey;
    const label = r.date.toLocaleDateString('th-TH', { day: 'numeric' });
    return `
      <div class="bar-col${isToday ? ' today' : ''}" title="${r.date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} · ${baht(r.total)} · ${r.count} บิล">
        <span class="bar-value">${r.total ? baht(r.total) : ''}</span>
        <div class="bar-track"><div class="bar-fill" style="height:${Math.max(pct, r.total ? 3 : 0)}%"></div></div>
        <span class="bar-label">${label}</span>
      </div>`;
  }).join('');

  const best = rows.reduce((a, b) => (b.total > a.total ? b : a), rows[0]);
  el.chartNote.textContent = best.total
    ? `ขายดีที่สุดคือ ${best.date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })} · ${baht(best.total)}`
    : 'ยังไม่มีข้อมูลการขายในช่วงนี้';
}

/* ---------- สินค้าขายดี ---------- */
function renderTop() {
  const list = Sales.topProducts(days, 8);
  const max = Math.max(...list.map((p) => p.qty), 1);
  el.topEmpty.hidden = list.length > 0;

  el.topBody.innerHTML = list.map((p) => `
    <tr>
      <td>${p.name}</td>
      <td class="right"><b>${p.qty}</b></td>
      <td class="right td-price">${baht(p.total)}</td>
      <td class="bar-col"><span class="mini-bar" style="width:${(p.qty / max) * 100}%"></span></td>
    </tr>`).join('');
}

/* ---------- บิลล่าสุด ---------- */
function renderBills() {
  const bills = Sales.lastDays(days).slice().reverse().slice(0, 30);
  el.billEmpty.hidden = bills.length > 0;
  el.undoBill.disabled = Sales.all().length === 0;

  el.billList.innerHTML = bills.map((b) => `
    <li class="bill">
      <details>
        <summary>
          <span class="bill-time">${dateOf(b.soldAt)} ${timeOf(b.soldAt)}</span>
          <span class="bill-meta">${b.items.reduce((n, i) => n + i.qty, 0)} ชิ้น · ${b.method}</span>
          <span class="bill-total">${baht(b.total)}</span>
        </summary>
        <ul class="bill-items">
          ${b.items.map((i) => `<li><span>${i.name} × ${i.qty}</span><span>${baht(i.price * i.qty)}</span></li>`).join('')}
        </ul>
      </details>
    </li>`).join('');
}

/* ---------- ส่งออก CSV ---------- */
function exportCsv() {
  const bills = Sales.all();
  if (!bills.length) return toast('ยังไม่มีข้อมูลให้ส่งออก');

  const rows = [['bill_id', 'datetime', 'method', 'sku', 'name', 'price', 'qty', 'line_total']];
  for (const b of bills) {
    for (const i of b.items) {
      rows.push([b.id, b.soldAt, b.method, i.sku, i.name, i.price, i.qty, i.price * i.qty]);
    }
  }
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  // ﻿ = BOM ให้ Excel อ่านภาษาไทยไม่เป็นตัวต่างดาว
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ยอดขาย-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('ส่งออกไฟล์ CSV แล้ว');
}

/* ---------- เหตุการณ์ ---------- */
el.rangePick.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  days = Number(btn.dataset.days);
  [...el.rangePick.children].forEach((b) => b.classList.toggle('active', b === btn));
  renderAll();
});

el.exportCsv.addEventListener('click', exportCsv);

el.undoBill.addEventListener('click', () => {
  const last = Sales.all().at(-1);
  if (!last) return;
  if (!confirm(`ยกเลิกบิล ${dateOf(last.soldAt)} ${timeOf(last.soldAt)} ยอด ${baht(last.total)}?\nสต็อกจะถูกคืนกลับเข้าระบบ`)) return;

  Sales.removeLast();
  for (const i of last.items) Store.adjustStock(i.sku, i.qty);   // คืนสต็อก
  renderAll();
  toast('ยกเลิกบิลและคืนสต็อกแล้ว');
});

function renderAll() {
  renderStats();
  renderChart();
  renderTop();
  renderBills();
}

renderAll();
window.addEventListener('focus', renderAll);
