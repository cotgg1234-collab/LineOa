/* cycle.js — หน้ารอบสั่งของ (ออกแบบให้ตัวใหญ่ ปุ่มใหญ่ ใช้ง่ายบนมือถือ)
 * หน้าเดียว 2 โหมด:
 *   1) สั่งของ  — นับถอยหลัง + ใบสั่งของที่ระบบแนะนำ (แก้จำนวน / เพิ่มสินค้าเองได้) + ส่งรายการทาง LINE
 *   2) รับของ   — กรอกจำนวนที่รับจริง -> เติมสต็อก เริ่มรอบใหม่
 * ใบสั่งที่กำลังแก้ (จำนวน + สินค้าที่เพิ่มเอง) เก็บใน localStorage ปิดหน้าแล้วเปิดใหม่ไม่หาย
 */

const $ = (id) => document.getElementById(id);
const el = {
  cycleHead: $('cycleHead'),
  listTitle: $('listTitle'), basisNote: $('basisNote'),
  orderList: $('orderList'), orderEmpty: $('orderEmpty'), orderActions: $('orderActions'),
  daysDec: $('daysDec'), daysVal: $('daysVal'), daysInc: $('daysInc'),
  safetyDec: $('safetyDec'), safetyVal: $('safetyVal'), safetyInc: $('safetyInc'),
  historyList: $('historyList'), historyEmpty: $('historyEmpty'),
  pickModal: $('pickModal'), pickClose: $('pickClose'), pickSearch: $('pickSearch'),
  pickList: $('pickList'), pickEmpty: $('pickEmpty'),
  toast: $('toast'),
};

const fmtDate = (d) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
const fmtAvg = (x) => (x >= 10 ? Math.round(x) : x.toFixed(1).replace(/\.0$/, ''));

let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2000);
}

/* ---------- ใบสั่งที่กำลังแก้ (เก็บไว้ในเครื่อง) ---------- */
const DRAFT_KEY = 'pos.orderDraft.v1';

const Draft = {
  get() {
    const d = readJSON(DRAFT_KEY, {});
    return { qty: d.qty || {}, extra: Array.isArray(d.extra) ? d.extra : [] };
  },
  save(d) { writeJSON(DRAFT_KEY, d); },
  setQty(sku, n) {
    const d = this.get();
    d.qty[sku] = Math.max(0, n);
    this.save(d);
  },
  addExtra(sku) {
    const d = this.get();
    if (!d.extra.includes(sku)) d.extra.push(sku);
    if (!(sku in d.qty)) d.qty[sku] = 1;
    this.save(d);
  },
  removeExtra(sku) {
    const d = this.get();
    d.extra = d.extra.filter((s) => s !== sku);
    delete d.qty[sku];
    this.save(d);
  },
  clear() { writeJSON(DRAFT_KEY, {}); },
};

/** รายการในใบสั่ง = ที่ระบบแนะนำ + ที่เพิ่มเอง
 *  คืน [{ product, suggested, avg, daysLeft, extra, qty }] */
function orderRows() {
  const d = Draft.get();
  const suggested = Forecast.toOrder();
  const inList = new Set(suggested.map((r) => r.product.sku));
  const all = Forecast.suggest();

  const extras = d.extra
    .filter((sku) => !inList.has(sku))
    .map((sku) => all.find((r) => r.product.sku === sku))
    .filter(Boolean)
    .map((r) => ({ ...r, extra: true }));

  return [...suggested, ...extras].map((r) => ({
    ...r,
    qty: r.product.sku in d.qty ? d.qty[r.product.sku] : r.suggested,
  }));
}

/* ---------- แถบสถานะรอบ ---------- */
function renderHead() {
  const c = Settings.cycleStatus();
  const open = Cycles.open();

  if (open) {
    el.cycleHead.innerHTML = `
      <p class="cycle-state">สั่งของรอบที่ ${open.no} แล้ว</p>
      <p class="cycle-big">รอไปรับของ</p>
      <p class="cycle-sub">สั่งเมื่อ ${fmtDate(open.orderedAt)} · ${open.lines.length} รายการ</p>`;
    return;
  }

  const late = c.remaining <= 0;
  el.cycleHead.innerHTML = `
    <p class="cycle-state">${late ? 'ถึงรอบสั่งของแล้ว' : 'กำลังขาย'}</p>
    <p class="cycle-big ${late ? 'due' : ''}">${late ? `เลยกำหนดมา ${Math.abs(c.remaining)} วัน` : `อีก ${c.remaining} วันถึงรอบสั่ง`}</p>
    <p class="cycle-sub">ครบรอบวันที่ ${fmtDate(c.due)}</p>
    <div class="cycle-bar"><span style="width:${Math.min(100, Math.max(0, (c.elapsed / c.cycleDays) * 100))}%"></span></div>`;
}

/* ---------- การ์ดสินค้า 1 ใบ (ใช้ทั้งโหมดสั่งและรับ) ---------- */
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
  const s = Settings.get();
  const span = Forecast.historySpan();
  const remaining = Settings.cycleStatus().remaining;

  el.listTitle.textContent = 'ใบสั่งของรอบนี้';
  el.basisNote.hidden = false;
  el.basisNote.textContent = span
    ? `ตัวเลขที่แนะนำ คิดจากยอดขาย ${span} วันที่ผ่านมา ให้พอขาย ${s.cycleDays} วัน (เผื่อ ${Math.round((s.safety - 1) * 100)}%) แก้ตัวเลขได้ตามต้องการ`
    : 'ยังไม่มียอดขาย ระบบจึงแนะนำจาก "จุดสั่งซื้อ" ไปก่อน แก้ตัวเลขได้ตามต้องการ';

  el.orderEmpty.textContent = 'ยังไม่มีของที่ต้องสั่ง — กด "เพิ่มสินค้าในใบสั่ง" ถ้าอยากสั่งเพิ่ม';
  el.orderEmpty.hidden = rows.length > 0;

  el.orderList.innerHTML = '';
  for (const r of rows) {
    const p = r.product;
    const urgent = Number.isFinite(r.daysLeft) && r.daysLeft < remaining;
    const facts = [`เหลือ <b class="${p.stock <= 0 ? 'out' : ''}">${p.stock}</b> ชิ้น`];
    if (Number.isFinite(r.daysLeft)) {
      facts.push(`<span class="${urgent ? 'out' : ''}">พอขายอีก ${Math.max(0, Math.floor(r.daysLeft))} วัน</span>`);
    }

    const li = document.createElement('li');
    li.className = 'order-card' + (r.qty > 0 ? '' : ' zero');
    li.innerHTML = `
      <div class="order-top">
        ${thumbHTML(p, 'order-thumb')}
        <div class="order-info">
          <p class="order-name">${p.name}</p>
          <p class="order-facts">${facts.join(' · ')}</p>
          ${r.avg > 0 ? `<p class="order-facts">ขายวันละประมาณ ${fmtAvg(r.avg)} ชิ้น</p>` : ''}
          ${r.extra ? '<p class="order-tag">เพิ่มเอง</p>' : ''}
        </div>
      </div>
      ${stepperHTML(r.qty, 'จำนวนที่จะสั่ง')}
      ${r.extra ? '<button class="remove-btn" data-act="remove" type="button">เอาออกจากใบสั่ง</button>' : ''}`;

    bindStepper(li, (n) => {
      Draft.setQty(p.sku, n);
      li.classList.toggle('zero', n === 0);
      renderTotals();
    });
    li.querySelector('[data-act="remove"]')?.addEventListener('click', () => {
      Draft.removeExtra(p.sku);
      renderOrderMode();
    });
    el.orderList.appendChild(li);
  }

  el.orderActions.innerHTML = `
    <button class="add-btn" id="addItem" type="button">+ เพิ่มสินค้าในใบสั่ง</button>
    <p class="order-total" id="orderTotal"></p>
    <button class="line-btn" id="sendLine" type="button">ส่งรายการทาง LINE</button>
    <button class="done-btn" id="placeOrder" type="button">สั่งของเรียบร้อยแล้ว</button>
    <p class="hint-big center">กด "สั่งของเรียบร้อยแล้ว" เมื่อสั่งหรือไปรับของแล้ว<br>จากนั้นหน้านี้จะให้กรอกจำนวนที่ได้รับจริง</p>`;
  $('addItem').addEventListener('click', openPicker);
  $('sendLine').addEventListener('click', sendLine);
  $('placeOrder').addEventListener('click', placeOrder);
  renderTotals();
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

/* ---------- เลือกสินค้าเพิ่มในใบสั่ง ---------- */
function openPicker() {
  el.pickSearch.value = '';
  renderPicker();
  el.pickModal.hidden = false;
}

function closePicker() {
  el.pickModal.hidden = true;
}

function renderPicker() {
  const inOrder = new Set(orderRows().map((r) => r.product.sku));
  const q = el.pickSearch.value.trim().toLowerCase();
  const list = Store.all()
    .filter((p) => !inOrder.has(p.sku))
    .filter((p) => !q || (p.name + ' ' + p.sku).toLowerCase().includes(q));

  el.pickEmpty.textContent = q ? 'ไม่พบสินค้าที่ค้นหา' : 'สินค้าทุกชิ้นอยู่ในใบสั่งแล้ว';
  el.pickEmpty.hidden = list.length > 0;
  el.pickList.innerHTML = '';
  for (const p of list) {
    const li = document.createElement('li');
    li.innerHTML = `
      <button class="pick-item" type="button">
        ${thumbHTML(p, 'order-thumb')}
        <span class="pick-info">
          <span class="order-name">${p.name}</span>
          <span class="order-facts">เหลือ ${p.stock} ชิ้น</span>
        </span>
        <span class="pick-add">เพิ่ม</span>
      </button>`;
    li.querySelector('button').addEventListener('click', () => {
      Draft.addExtra(p.sku);
      closePicker();
      renderOrderMode();
      toast(`เพิ่ม ${p.name} ในใบสั่งแล้ว`);
      el.orderList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    el.pickList.appendChild(li);
  }
}

el.pickSearch.addEventListener('input', renderPicker);
el.pickClose.addEventListener('click', closePicker);
el.pickModal.addEventListener('click', (e) => { if (e.target === el.pickModal) closePicker(); });

/* ---------- โหมดที่ 2: รับของเข้า ---------- */
function renderReceiveMode(cycle) {
  el.listTitle.textContent = `รับของ รอบที่ ${cycle.no}`;
  el.basisNote.hidden = false;
  el.basisNote.textContent = 'ใส่จำนวนที่ได้รับ "จริง" — ถ้าของขาดหรือได้ไม่ครบ ให้แก้ตัวเลขตามจริง';
  el.orderEmpty.hidden = true;

  el.orderList.innerHTML = '';
  for (const l of cycle.lines) {
    const p = Store.find(l.sku) || { name: l.name, image: '' };
    const li = document.createElement('li');
    li.className = 'order-card';
    li.dataset.sku = l.sku;
    li.innerHTML = `
      <div class="order-top">
        ${thumbHTML(p, 'order-thumb')}
        <div class="order-info">
          <p class="order-name">${l.name}</p>
          <p class="order-facts">สั่งไป <b>${l.ordered}</b> ชิ้น</p>
        </div>
      </div>
      ${stepperHTML(l.ordered, 'ได้รับจริง')}`;
    bindStepper(li, () => {});
    el.orderList.appendChild(li);
  }

  el.orderActions.innerHTML = `
    <button class="done-btn primary" id="confirmReceive" type="button">ได้รับของแล้ว · เติมสต็อก</button>
    <p class="hint-big center">สต็อกจะเพิ่มตามจำนวนที่ใส่ และเริ่มนับรอบใหม่ตั้งแต่วันนี้</p>
    <button class="remove-btn center" id="cancelOrder" type="button">ยกเลิกใบสั่งนี้</button>`;

  $('cancelOrder').addEventListener('click', () => {
    if (!confirm('ยกเลิกใบสั่งของรอบนี้? สต็อกจะไม่ถูกเติม')) return;
    Cycles.cancelOpen();
    renderAll();
    toast('ยกเลิกใบสั่งแล้ว');
  });

  $('confirmReceive').addEventListener('click', () => {
    const received = {};
    for (const li of el.orderList.querySelectorAll('.order-card')) {
      received[li.dataset.sku] = Number(li.querySelector('.big-input').value) || 0;
    }
    const total = Object.values(received).reduce((s, v) => s + v, 0);
    if (!confirm(`ยืนยันรับของ ${total} ชิ้น และเริ่มรอบใหม่ ${Settings.get().cycleDays} วันจากวันนี้?`)) return;

    Cycles.receive(received);
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('เติมสต็อกแล้ว — เริ่มรอบใหม่');
  });
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
            <span class="bill-total">รับ ${received}/${ordered}</span>
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
  renderSettings();
  renderHistory();
}

renderAll();
// กลับมาที่หน้านี้ (เช่น หลังส่ง LINE) ให้ดึงข้อมูลล่าสุด
// ยกเว้นโหมดรับของ — ตัวเลขที่กรอกไว้ยังไม่ได้บันทึก จะหายถ้าวาดใหม่
window.addEventListener('focus', () => {
  if (!Cycles.open()) renderAll();
});
