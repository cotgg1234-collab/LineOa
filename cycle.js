/* cycle.js — หน้ารอบสั่งของ
 * หน้าเดียว 3 สถานะ:
 *   1) กำลังขาย    — นับถอยหลัง + ใบสั่งของที่ระบบแนะนำ (แก้จำนวนได้)
 *   2) สั่งแล้ว     — รอไปรับของ / กรอกจำนวนที่รับจริง
 *   3) ปิดรอบแล้ว  — เติมสต็อก เริ่มนับรอบใหม่
 */

const $ = (id) => document.getElementById(id);
const el = {
  cycleHead: $('cycleHead'),
  listTitle: $('listTitle'), listTools: $('listTools'), basisNote: $('basisNote'),
  orderHead: $('orderHead'), orderBody: $('orderBody'), orderEmpty: $('orderEmpty'),
  orderActions: $('orderActions'),
  historyList: $('historyList'), historyEmpty: $('historyEmpty'),
  toast: $('toast'),
};

/** จำนวนที่แก้เองในใบสั่งของรอบนี้ (ยังไม่กดสั่ง) — sku -> qty */
const draft = new Map();

const fmtDate = (d) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
const n1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');

let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1800);
}

/* ---------- แถบสถานะรอบ ---------- */
function renderHead() {
  const c = Settings.cycleStatus();
  const open = Cycles.open();

  if (open) {
    el.cycleHead.innerHTML = `
      <p class="cycle-state">🚚 สั่งของรอบที่ ${open.no} แล้ว</p>
      <p class="cycle-big">รอไปรับของ</p>
      <p class="cycle-sub">สั่งเมื่อ ${fmtDate(open.orderedAt)} · ${open.lines.length} รายการ
        — ไปรับแล้วกรอกจำนวนที่ได้จริงด้านล่าง</p>`;
    return;
  }

  const late = c.remaining <= 0;
  el.cycleHead.innerHTML = `
    <p class="cycle-state">${late ? '🔔 ถึงรอบสั่งของแล้ว' : '🛒 กำลังขาย'}</p>
    <p class="cycle-big ${late ? 'due' : ''}">${late ? `เลยกำหนดมา ${Math.abs(c.remaining)} วัน` : `อีก ${c.remaining} วันถึงรอบสั่ง`}</p>
    <p class="cycle-sub">วันที่ ${Math.max(c.elapsed, 0) + 1} ของรอบ ${c.cycleDays} วัน ·
      เริ่มรอบ ${fmtDate(c.start)} · ครบรอบ ${fmtDate(c.due)}</p>
    <div class="cycle-bar"><span style="width:${Math.min(100, Math.max(0, (c.elapsed / c.cycleDays) * 100))}%"></span></div>`;
}

/* ---------- โหมดที่ 1: ใบสั่งของ ---------- */
function renderOrderMode() {
  const rows = Forecast.toOrder();
  const span = Forecast.historySpan();

  el.listTitle.textContent = 'ใบสั่งของรอบนี้';
  el.basisNote.hidden = false;
  el.basisNote.textContent = span
    ? `คำนวณจากยอดขายจริง ${span} วันล่าสุด × รอบ ${Settings.get().cycleDays} วัน (เผื่อ ${Math.round((Settings.get().safety - 1) * 100)}%)`
    : 'ยังไม่มีประวัติการขาย — ใช้ "จุดสั่งซื้อ" ที่กรอกไว้ในหน้าสินค้าไปก่อน ระบบจะแม่นขึ้นเมื่อเริ่มขาย';

  el.orderHead.innerHTML = `
    <tr>
      <th>สินค้า</th>
      <th class="right">เหลือ</th>
      <th class="right">ขาย/วัน</th>
      <th class="right">พอถึง</th>
      <th class="right">ควรสั่ง</th>
    </tr>`;

  el.orderEmpty.textContent = 'ยังไม่มีอะไรต้องสั่ง — ของในร้านพอถึงรอบหน้า 👍';
  el.orderEmpty.hidden = rows.length > 0;

  el.orderBody.innerHTML = rows.map((r) => {
    const p = r.product;
    const qty = draft.has(p.sku) ? draft.get(p.sku) : r.suggested;
    const urgent = r.daysLeft < Settings.cycleStatus().remaining;
    return `
      <tr data-sku="${p.sku}">
        <td>${p.emoji} ${p.name}<br><span class="td-sku">${p.sku} · ${p.cat}</span></td>
        <td class="right"><b class="${p.stock <= 0 ? 'out' : ''}">${p.stock}</b></td>
        <td class="right">${r.avg > 0 ? n1(r.avg) : '—'}</td>
        <td class="right ${urgent ? 'out' : ''}">${Number.isFinite(r.daysLeft) ? Math.max(0, Math.floor(r.daysLeft)) + ' วัน' : '—'}</td>
        <td class="right nowrap">
          <span class="stock-cell">
            <button class="step-btn" data-act="minus" type="button">−</button>
            <input class="qty-input" type="number" min="0" step="1" value="${qty}" aria-label="จำนวนที่จะสั่ง ${p.name}" />
            <button class="step-btn" data-act="plus" type="button">+</button>
          </span>
        </td>
      </tr>`;
  }).join('');

  // ปุ่มบวก/ลบ และช่องกรอกจำนวน
  for (const tr of el.orderBody.querySelectorAll('tr')) {
    const sku = tr.dataset.sku;
    const input = tr.querySelector('.qty-input');
    const sync = () => draft.set(sku, Math.max(0, Number(input.value) || 0));
    tr.querySelector('[data-act="minus"]').addEventListener('click', () => {
      input.value = Math.max(0, Number(input.value) - 1);
      sync();
      renderTotals();
    });
    tr.querySelector('[data-act="plus"]').addEventListener('click', () => {
      input.value = Number(input.value) + 1;
      sync();
      renderTotals();
    });
    input.addEventListener('input', () => { sync(); renderTotals(); });
  }

  el.listTools.innerHTML = rows.length
    ? '<button class="mini-btn" id="copyOrder" type="button">📋 คัดลอกรายการ</button>'
    : '';
  if (rows.length) $('copyOrder').addEventListener('click', copyOrder);

  el.orderActions.innerHTML = rows.length
    ? `<p class="order-total" id="orderTotal"></p>
       <button class="pay-btn" id="placeOrder" type="button">สั่งของรอบนี้แล้ว →</button>
       <p class="hint center">กดเมื่อสั่ง/ออกไปรับของแล้ว ระบบจะเปลี่ยนเป็นโหมดรับของ</p>`
    : '';
  if (rows.length) {
    $('placeOrder').addEventListener('click', placeOrder);
    renderTotals();
  }
}

function currentLines() {
  return Forecast.toOrder()
    .map((r) => ({
      sku: r.product.sku,
      name: r.product.name,
      suggested: r.suggested,
      ordered: draft.has(r.product.sku) ? draft.get(r.product.sku) : r.suggested,
    }))
    .filter((l) => l.ordered > 0);
}

function renderTotals() {
  const lines = currentLines();
  const totalQty = lines.reduce((s, l) => s + l.ordered, 0);
  const t = $('orderTotal');
  if (t) t.innerHTML = `รวม <b>${lines.length}</b> รายการ · <b>${totalQty}</b> ชิ้น`;
}

function copyOrder() {
  const lines = currentLines();
  const text = 'รายการสั่งของ ' + new Date().toLocaleDateString('th-TH') + '\n' +
    lines.map((l, i) => `${i + 1}. ${l.name} × ${l.ordered}`).join('\n');
  navigator.clipboard?.writeText(text)
    .then(() => toast('คัดลอกรายการแล้ว — วางในไลน์ส่งให้ร้านค้าส่งได้เลย'))
    .catch(() => toast('คัดลอกไม่สำเร็จ'));
}

function placeOrder() {
  const lines = currentLines();
  if (!lines.length) return toast('ยังไม่มีรายการที่จะสั่ง');
  Cycles.place(lines);
  draft.clear();
  renderAll();
  toast('บันทึกใบสั่งของแล้ว — ไปรับของได้เลย');
}

/* ---------- โหมดที่ 2: รับของเข้า ---------- */
function renderReceiveMode(cycle) {
  el.listTitle.textContent = `รับของ — รอบที่ ${cycle.no}`;
  el.basisNote.hidden = false;
  el.basisNote.textContent = 'กรอกจำนวนที่ได้รับ "จริง" ไม่ใช่จำนวนที่สั่ง — ถ้าของขาดหรือตัดออกเพราะเกินงบ ให้แก้ตัวเลขตามจริง';

  el.orderHead.innerHTML = `
    <tr>
      <th>สินค้า</th>
      <th class="right">สั่งไป</th>
      <th class="right">ได้รับจริง</th>
    </tr>`;
  el.orderEmpty.hidden = true;

  el.orderBody.innerHTML = cycle.lines.map((l) => `
    <tr data-sku="${l.sku}">
      <td>${l.name}</td>
      <td class="right">${l.ordered}</td>
      <td class="right nowrap">
        <span class="stock-cell">
          <button class="step-btn" data-act="minus" type="button">−</button>
          <input class="qty-input" type="number" min="0" step="1" value="${l.ordered}" aria-label="จำนวนที่รับจริง ${l.name}" />
          <button class="step-btn" data-act="plus" type="button">+</button>
        </span>
      </td>
    </tr>`).join('');

  for (const tr of el.orderBody.querySelectorAll('tr')) {
    const input = tr.querySelector('.qty-input');
    tr.querySelector('[data-act="minus"]').addEventListener('click', () => {
      input.value = Math.max(0, Number(input.value) - 1);
    });
    tr.querySelector('[data-act="plus"]').addEventListener('click', () => {
      input.value = Number(input.value) + 1;
    });
  }

  el.listTools.innerHTML = '<button class="mini-btn danger" id="cancelOrder" type="button">ยกเลิกใบสั่งนี้</button>';
  $('cancelOrder').addEventListener('click', () => {
    if (!confirm('ยกเลิกใบสั่งของรอบนี้? สต็อกจะไม่ถูกเติม')) return;
    Cycles.cancelOpen();
    renderAll();
    toast('ยกเลิกใบสั่งแล้ว');
  });

  el.orderActions.innerHTML = `
    <button class="pay-btn" id="confirmReceive" type="button">✓ ยืนยันรับของ · เติมสต็อก</button>
    <p class="hint center">ยืนยันแล้วสต็อกจะเพิ่มตามจำนวนที่กรอก และเริ่มนับรอบใหม่จากวันนี้</p>`;

  $('confirmReceive').addEventListener('click', () => {
    const received = {};
    for (const tr of el.orderBody.querySelectorAll('tr')) {
      received[tr.dataset.sku] = Number(tr.querySelector('.qty-input').value) || 0;
    }
    const total = Object.values(received).reduce((s, v) => s + v, 0);
    if (!confirm(`ยืนยันรับของ ${total} ชิ้น และเริ่มรอบใหม่ 14 วันจากวันนี้?`)) return;

    Cycles.receive(received);
    renderAll();
    toast('เติมสต็อกแล้ว — เริ่มรอบใหม่');
  });
}

/* ---------- ประวัติรอบ ---------- */
function renderHistory() {
  const done = Cycles.all().filter((c) => c.receivedAt).reverse();
  el.historyEmpty.hidden = done.length > 0;

  el.historyList.innerHTML = done.map((c) => {
    const ordered = c.lines.reduce((s, l) => s + l.ordered, 0);
    const received = c.lines.reduce((s, l) => s + (l.received || 0), 0);
    return `
      <li class="bill">
        <details>
          <summary>
            <span class="bill-time">รอบที่ ${c.no} · ${fmtDate(c.receivedAt)}</span>
            <span class="bill-meta">${c.lines.length} รายการ</span>
            <span class="bill-total">${received}/${ordered} ชิ้น</span>
          </summary>
          <ul class="bill-items">
            ${c.lines.map((l) => `<li><span>${l.name}</span><span>สั่ง ${l.ordered} · รับ ${l.received ?? 0}</span></li>`).join('')}
          </ul>
        </details>
      </li>`;
  }).join('');
}

/* ---------- รวม ---------- */
function renderAll() {
  renderHead();
  const open = Cycles.open();
  if (open) renderReceiveMode(open);
  else renderOrderMode();
  renderHistory();
}

renderAll();
window.addEventListener('focus', renderAll);
