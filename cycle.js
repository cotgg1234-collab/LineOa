/* cycle.js — หน้ารอบสั่งของ (ออกแบบให้ตัวใหญ่ ปุ่มใหญ่ ใช้ง่ายบนมือถือ)
 * หน้าเดียว 2 โหมด:
 *   1) สั่งของ  — นับถอยหลัง + รายการที่ต้องสั่งพร้อมจำนวน (ระบบคำนวณให้ แก้จำนวนได้) + ส่งรายการทาง LINE
 *   2) รับของ   — ติ๊กของที่ได้รับ (จำนวนไม่ตรงแก้ได้) -> เติมสต็อก เริ่มรอบใหม่
 * จำนวนที่แก้ในใบสั่งเก็บใน localStorage ปิดหน้าแล้วเปิดใหม่ไม่หาย
 */

const $ = (id) => document.getElementById(id);
const el = {
  cycleHead: $('cycleHead'),
  listTitle: $('listTitle'),
  orderList: $('orderList'), orderEmpty: $('orderEmpty'), orderActions: $('orderActions'),
  daysDec: $('daysDec'), daysVal: $('daysVal'), daysInc: $('daysInc'),
  safetyDec: $('safetyDec'), safetyVal: $('safetyVal'), safetyInc: $('safetyInc'),
  historyList: $('historyList'), historyEmpty: $('historyEmpty'),
  toast: $('toast'),
};

const fmtDate = (d) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2000);
}

/* ---------- จำนวนที่แก้ในใบสั่ง (เก็บไว้ในเครื่อง) ---------- */
const DRAFT_KEY = 'pos.orderDraft.v1';

const Draft = {
  get() { return readJSON(DRAFT_KEY, {}).qty || {}; },
  setQty(sku, n) {
    const qty = this.get();
    qty[sku] = Math.max(0, n);
    writeJSON(DRAFT_KEY, { qty });
  },
  clear() { writeJSON(DRAFT_KEY, {}); },
};

/** รายการที่ต้องสั่ง (ระบบคำนวณ) พร้อมจำนวนที่จะสั่ง — คืน [{ product, suggested, avg, daysLeft, qty }] */
function orderRows() {
  const qty = Draft.get();
  return Forecast.toOrder().map((r) => ({
    ...r,
    qty: r.product.sku in qty ? qty[r.product.sku] : r.suggested,
  }));
}

/* ---------- แถบสถานะรอบ ---------- */
function renderHead() {
  const c = Settings.cycleStatus();
  const open = Cycles.open();

  if (open) {
    el.cycleHead.innerHTML = `
      <p class="cycle-big">รอไปรับของ</p>
      <p class="cycle-sub">สั่งเมื่อ ${fmtDate(open.orderedAt)} · ${open.lines.length} รายการ</p>`;
    return;
  }

  const late = c.remaining <= 0;
  el.cycleHead.innerHTML = `
    <p class="cycle-big ${late ? 'due' : ''}">${late ? `เลยกำหนดมา ${Math.abs(c.remaining)} วัน` : `อีก ${c.remaining} วันถึงรอบสั่ง`}</p>
    <p class="cycle-sub">ครบรอบวันที่ ${fmtDate(c.due)}</p>
    <div class="cycle-bar"><span style="width:${Math.min(100, Math.max(0, (c.elapsed / c.cycleDays) * 100))}%"></span></div>`;
}

/* ---------- ปุ่ม − จำนวน + ---------- */
function stepperHTML(value, label) {
  return `
    <div class="order-qty">
      <span class="order-qty-label">${label}</span>
      <span class="big-stepper">
        <button class="big-step" data-act="minus" type="button" aria-label="ลด 1">−</button>
        <input class="big-input" type="number" inputmode="numeric" min="0" step="1" value="${value}" aria-label="${label}" />
        <button class="big-step" data-act="plus" type="button" aria-label="เพิ่ม 1">+</button>
      </span>
    </div>`;
}

/** ผูกปุ่ม − / + กับช่องตัวเลขในการ์ด — onChange(ค่าใหม่) */
function bindStepper(li, onChange) {
  const input = li.querySelector('.big-input');
  const set = (n) => {
    input.value = Math.max(0, n);
    onChange(Number(input.value));
  };
  li.querySelector('[data-act="minus"]').addEventListener('click', () => set(Number(input.value) - 1));
  li.querySelector('[data-act="plus"]').addEventListener('click', () => set(Number(input.value) + 1));
  input.addEventListener('input', () => onChange(Math.max(0, Number(input.value) || 0)));
  input.addEventListener('focus', () => input.select());
}

/* ---------- โหมดที่ 1: ใบสั่งของ ---------- */
function renderOrderMode() {
  const rows = orderRows();

  el.listTitle.textContent = 'ของที่ต้องสั่งรอบนี้';

  el.orderEmpty.textContent = 'ยังไม่มีของที่ต้องสั่ง — ของในร้านพอขายถึงรอบหน้า';
  el.orderEmpty.hidden = rows.length > 0;

  el.orderList.innerHTML = '';
  for (const r of rows) {
    const p = r.product;

    const li = document.createElement('li');
    li.className = 'order-card' + (r.qty > 0 ? '' : ' zero');
    li.innerHTML = `
      <div class="order-top">
        ${thumbHTML(p, 'order-thumb')}
        <div class="order-info">
          <p class="order-name">${p.name}</p>
          <p class="order-facts">เหลือ <b class="${p.stock <= 0 ? 'out' : ''}">${p.stock}</b> ชิ้น</p>
        </div>
      </div>
      ${stepperHTML(r.qty, 'ต้องสั่ง')}`;

    bindStepper(li, (n) => {
      Draft.setQty(p.sku, n);
      li.classList.toggle('zero', n === 0);
      renderTotals();
    });
    el.orderList.appendChild(li);
  }

  el.orderActions.innerHTML = rows.length
    ? `<p class="order-total" id="orderTotal"></p>
       <button class="line-btn" id="sendLine" type="button">ส่งรายการทาง LINE</button>
       <button class="done-btn" id="placeOrder" type="button">สั่งของเรียบร้อยแล้ว</button>`
    : '';
  if (rows.length) {
    $('sendLine').addEventListener('click', sendLine);
    $('placeOrder').addEventListener('click', placeOrder);
    renderTotals();
  }
}

function currentLines() {
  return orderRows()
    .filter((r) => r.qty > 0)
    .map((r) => ({ sku: r.product.sku, name: r.product.name, suggested: r.suggested, ordered: r.qty }));
}

function renderTotals() {
  const lines = currentLines();
  const totalQty = lines.reduce((s, l) => s + l.ordered, 0);
  const t = $('orderTotal');
  if (t) t.innerHTML = lines.length ? `รวม <b>${lines.length}</b> รายการ · <b>${totalQty}</b> ชิ้น` : 'ยังไม่มีรายการที่จะสั่ง';
  const has = lines.length > 0;
  for (const id of ['sendLine', 'placeOrder']) { const b = $(id); if (b) b.disabled = !has; }
}

/** เปิด LINE ให้เลือกแชท แล้วส่งรายการสั่งของ (เช่น ส่งให้ร้านค้าส่ง) */
function sendLine() {
  const lines = currentLines();
  if (!lines.length) return toast('ยังไม่มีรายการที่จะสั่ง');
  const text = `รายการสั่งของ ${new Date().toLocaleDateString('th-TH')}\n` +
    lines.map((l, i) => `${i + 1}. ${l.name} จำนวน ${l.ordered}`).join('\n');
  location.href = 'https://line.me/R/share?text=' + encodeURIComponent(text);
}

function placeOrder() {
  const lines = currentLines();
  if (!lines.length) return toast('ยังไม่มีรายการที่จะสั่ง');
  if (!confirm(`ยืนยันว่าสั่งของ ${lines.length} รายการแล้ว?`)) return;
  Cycles.place(lines);
  Draft.clear();
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast('บันทึกแล้ว — ไปรับของได้เลย');
}

/* ---------- โหมดที่ 2: รับของ (ติ๊กของที่ได้รับ) ---------- */
/** สถานะการรับของที่กำลังติ๊ก — sku -> { checked, qty } (ยังไม่บันทึกจนกดยืนยัน) */
const recv = new Map();

function statusText(ordered, got) {
  if (got === ordered) return `<span class="st ok">ได้ครบ ${got} ชิ้น</span>`;
  if (got < ordered) return `<span class="st short">ได้ ${got} ชิ้น · ขาด ${ordered - got}</span>`;
  return `<span class="st over">ได้ ${got} ชิ้น · เกิน ${got - ordered}</span>`;
}

function renderReceiveMode(cycle) {
  for (const l of cycle.lines) {
    if (!recv.has(l.sku)) recv.set(l.sku, { checked: false, qty: l.ordered });
  }

  el.listTitle.textContent = `ของที่ต้องไปรับ รอบที่ ${cycle.no}`;
  el.orderEmpty.hidden = true;

  el.orderList.innerHTML = '';
  for (const l of cycle.lines) {
    const p = Store.find(l.sku) || { name: l.name, image: '' };
    const st = recv.get(l.sku);
    const li = document.createElement('li');
    li.className = 'order-card recv-card';
    li.innerHTML = `
      <label class="order-top recv-top">
        ${thumbHTML(p, 'order-thumb')}
        <span class="order-info">
          <span class="order-name">${l.name}</span>
          <span class="order-facts">ต้องรับ <b>${l.ordered}</b> ชิ้น</span>
          <span class="recv-status"></span>
        </span>
        <input class="tick" type="checkbox" aria-label="ได้รับ ${l.name} แล้ว" />
      </label>
      <button class="edit-qty" type="button">แก้จำนวน</button>
      <div class="recv-edit" hidden>${stepperHTML(st.qty, 'ได้มาจริง')}</div>`;

    const tick = li.querySelector('.tick');
    const edit = li.querySelector('.recv-edit');
    const paint = () => {
      tick.checked = st.checked;
      li.classList.toggle('done', st.checked);
      li.querySelector('.recv-status').innerHTML = st.checked
        ? statusText(l.ordered, st.qty)
        : '<span class="st wait">ยังไม่ได้รับ</span>';
      renderRecvProgress(cycle);
    };

    tick.addEventListener('change', () => { st.checked = tick.checked; paint(); });
    li.querySelector('.edit-qty').addEventListener('click', () => {
      edit.hidden = !edit.hidden;
      li.querySelector('.edit-qty').textContent = edit.hidden ? 'แก้จำนวน' : 'ซ่อน';
    });
    // แก้จำนวน = ได้ของแล้ว (ติ๊กให้อัตโนมัติ)
    bindStepper(li, (n) => { st.qty = n; st.checked = true; paint(); });

    el.orderList.appendChild(li);
    paint();
  }

  el.orderActions.innerHTML = `
    <p class="order-total" id="recvProgress"></p>
    <button class="add-btn" id="tickAll" type="button">ได้ครบทุกรายการ (ติ๊กทั้งหมด)</button>
    <button class="done-btn primary" id="confirmReceive" type="button">ยืนยันรับของ · เติมสต็อก</button>
    <p class="hint-big center">สต็อกจะเพิ่มตามที่ติ๊กไว้ และเริ่มนับรอบใหม่ตั้งแต่วันนี้</p>
    <button class="remove-btn center" id="cancelOrder" type="button">ยกเลิกใบสั่งนี้</button>`;
  renderRecvProgress(cycle);

  $('tickAll').addEventListener('click', () => {
    for (const st of recv.values()) st.checked = true;
    renderReceiveMode(cycle);
  });

  $('cancelOrder').addEventListener('click', () => {
    if (!confirm('ยกเลิกใบสั่งของรอบนี้? สต็อกจะไม่ถูกเติม')) return;
    Cycles.cancelOpen();
    recv.clear();
    renderAll();
    toast('ยกเลิกใบสั่งแล้ว');
  });

  $('confirmReceive').addEventListener('click', () => {
    const received = {};
    let total = 0, missing = 0;
    for (const l of cycle.lines) {
      const st = recv.get(l.sku);
      received[l.sku] = st.checked ? st.qty : 0;
      total += received[l.sku];
      if (!st.checked) missing++;
    }
    const warn = missing ? `\nยังไม่ได้ติ๊ก ${missing} รายการ — จะนับว่าไม่ได้รับ` : '';
    if (!confirm(`ยืนยันรับของ ${total} ชิ้น และเริ่มรอบใหม่ ${Settings.get().cycleDays} วันจากวันนี้?${warn}`)) return;

    Cycles.receive(received);
    recv.clear();
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('เติมสต็อกแล้ว — เริ่มรอบใหม่');
  });
}

function renderRecvProgress(cycle) {
  const t = $('recvProgress');
  if (!t) return;
  const done = cycle.lines.filter((l) => recv.get(l.sku)?.checked).length;
  t.innerHTML = `ติ๊กแล้ว <b>${done}</b> จาก <b>${cycle.lines.length}</b> รายการ`;
}

/* ---------- ตั้งค่ารอบ ---------- */
const DAYS_MIN = 1, DAYS_MAX = 60;
const SAFETY_MAX = 100;   // เผื่อได้สูงสุด 100%

function renderSettings() {
  const s = Settings.get();
  const pct = Math.round((s.safety - 1) * 100);
  el.daysVal.textContent = s.cycleDays;
  el.safetyVal.textContent = pct;
  el.daysDec.disabled = s.cycleDays <= DAYS_MIN;
  el.daysInc.disabled = s.cycleDays >= DAYS_MAX;
  el.safetyDec.disabled = pct <= 0;
  el.safetyInc.disabled = pct >= SAFETY_MAX;
}

function changeDays(d) {
  const days = Math.min(DAYS_MAX, Math.max(DAYS_MIN, Settings.get().cycleDays + d));
  Settings.set({ cycleDays: days });
  renderAll();
}

function changeSafety(d) {
  const pct = Math.min(SAFETY_MAX, Math.max(0, Math.round((Settings.get().safety - 1) * 100) + d));
  Settings.set({ safety: 1 + pct / 100 });
  renderAll();
}

el.daysDec.addEventListener('click', () => changeDays(-1));
el.daysInc.addEventListener('click', () => changeDays(1));
el.safetyDec.addEventListener('click', () => changeSafety(-5));
el.safetyInc.addEventListener('click', () => changeSafety(5));

/* ---------- ของที่ต้องรับ vs รับจริง แต่ละรอบ ---------- */
/** สถานะของ 1 รายการ: ครบ / ขาด / เกิน */
function receiveStatus(ordered, received) {
  if (received === ordered) return '<span class="st ok">ครบ</span>';
  if (received < ordered) return `<span class="st short">ขาด ${ordered - received}</span>`;
  return `<span class="st over">เกิน ${received - ordered}</span>`;
}

function renderHistory() {
  const done = Cycles.all().filter((c) => c.receivedAt).reverse();   // ล่าสุดก่อน
  el.historyEmpty.hidden = done.length > 0;

  el.historyList.innerHTML = done.map((c, i) => {
    const ordered = c.lines.reduce((s, l) => s + l.ordered, 0);
    const received = c.lines.reduce((s, l) => s + (l.received || 0), 0);
    const short = c.lines.filter((l) => (l.received || 0) < l.ordered).length;
    return `
      <li class="round">
        <details ${i === 0 ? 'open' : ''}>
          <summary>
            <span class="round-title">รอบที่ ${c.no}</span>
            <span class="round-date">สั่ง ${fmtDate(c.orderedAt)} · รับ ${fmtDate(c.receivedAt)}</span>
            <span class="round-sum">ต้องรับ <b>${ordered}</b> · รับจริง <b>${received}</b> ชิ้น
              ${short ? `<span class="st short">ขาด ${short} รายการ</span>` : '<span class="st ok">ครบทุกรายการ</span>'}</span>
          </summary>
          <table class="round-table">
            <thead><tr><th>สินค้า</th><th class="right">ต้องรับ</th><th class="right">รับจริง</th><th class="right"></th></tr></thead>
            <tbody>
              ${c.lines.map((l) => `
                <tr>
                  <td>${l.name}</td>
                  <td class="right">${l.ordered}</td>
                  <td class="right"><b>${l.received ?? 0}</b></td>
                  <td class="right">${receiveStatus(l.ordered, l.received ?? 0)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
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
  renderSettings();
  renderHistory();
}

renderAll();
// กลับมาที่หน้านี้ (เช่น หลังส่ง LINE) ให้ดึงข้อมูลล่าสุด
// ยกเว้นโหมดรับของ — ติ๊กที่ทำไว้ยังไม่ได้บันทึก จะหายถ้าวาดใหม่
window.addEventListener('focus', () => {
  if (!Cycles.open()) renderAll();
});
