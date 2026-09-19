/* ร้านขายของ — POS ขายจบใน 5 คลิก
 * ขั้นตอนการขาย: คลิกการ์ดสินค้า (1-3 คลิก) -> ชำระเงิน (1 คลิก) -> เลือกวิธีจ่าย (1 คลิก) = จบ
 * ค้นหาแล้วกด Enter = เพิ่มสินค้าอันดับแรกโดยไม่เสียคลิกเลย
 */

const MAX_CLICKS = 5;

/* ---------- ข้อมูลสินค้า (มาจาก store.js / localStorage) ---------- */
let PRODUCTS = Store.all();

/* ---------- สถานะ ---------- */
const cart = new Map();     // sku -> { product, qty }
let activeCat = 'ทั้งหมด';
let query = '';
let clicks = 0;
let visible = [];           // สินค้าที่แสดงอยู่ตอนนี้ (สำหรับกด Enter)

/* ---------- อ้างอิง DOM ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  search: $('search'), clearSearch: $('clearSearch'),
  categories: $('categories'), grid: $('grid'), empty: $('empty'),
  cartList: $('cartList'), cartEmpty: $('cartEmpty'),
  totalQty: $('totalQty'), subtotal: $('subtotal'), grandTotal: $('grandTotal'),
  payBtn: $('payBtn'), clearCart: $('clearCart'),
  clickCount: $('clickCount'), clickMeter: $('clickMeter'),
  payModal: $('payModal'), payAmount: $('payAmount'), payMethods: $('payMethods'), cancelPay: $('cancelPay'),
  receiptModal: $('receiptModal'), receiptSub: $('receiptSub'), receiptList: $('receiptList'),
  receiptTotal: $('receiptTotal'), clicksUsed: $('clicksUsed'), newSale: $('newSale'),
  toast: $('toast'),
};

const baht = (n) => '฿' + n.toLocaleString('th-TH');

/* ---------- ตัวนับคลิก ---------- */
function countClick() {
  clicks++;
  el.clickCount.textContent = clicks;
  el.clickMeter.classList.toggle('over', clicks > MAX_CLICKS);
}

function resetClicks() {
  clicks = 0;
  el.clickCount.textContent = '0';
  el.clickMeter.classList.remove('over');
}

/* ---------- หมวดหมู่ ---------- */
function renderCategories() {
  const cats = ['ทั้งหมด', ...new Set(PRODUCTS.map((p) => p.cat))];
  el.categories.innerHTML = '';
  for (const cat of cats) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (cat === activeCat ? ' active' : '');
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      activeCat = cat;
      renderCategories();
      renderGrid();
    });
    el.categories.appendChild(btn);
  }
}

/* ---------- ตารางสินค้า ---------- */
function matches(p) {
  if (activeCat !== 'ทั้งหมด' && p.cat !== activeCat) return false;
  if (!query) return true;
  const hay = (p.name + ' ' + p.sku + ' ' + p.cat + ' ' + p.keywords).toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

function renderGrid() {
  visible = PRODUCTS.filter(matches);
  el.grid.innerHTML = '';
  el.empty.hidden = visible.length > 0;

  for (const p of visible) {
    const inCart = cart.get(p.sku);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.sku = p.sku;
    card.innerHTML = `
      ${inCart ? `<span class="badge">${inCart.qty}</span>` : ''}
      <span class="emoji">${p.emoji}</span>
      <span class="name">${p.name}</span>
      <span class="price">${baht(p.price)}</span>
      <span class="sku">${p.sku} · ${p.cat}</span>`;
    card.addEventListener('click', () => {
      countClick();
      addToCart(p);
    });
    el.grid.appendChild(card);
  }
}

function flashCard(sku) {
  const card = el.grid.querySelector(`.card[data-sku="${sku}"]`);
  if (!card) return;
  card.classList.remove('hit');
  void card.offsetWidth;   // restart animation
  card.classList.add('hit');
}

/* ---------- ตะกร้า ---------- */
function addToCart(p, qty = 1) {
  const line = cart.get(p.sku);
  if (line) line.qty += qty;
  else cart.set(p.sku, { product: p, qty });
  renderCart();
  renderGrid();
  flashCard(p.sku);
  toast(`เพิ่ม ${p.name}`);
}

function setQty(sku, qty) {
  if (qty <= 0) cart.delete(sku);
  else cart.get(sku).qty = qty;
  renderCart();
  renderGrid();
}

function totals() {
  let qty = 0, sum = 0;
  for (const { product, qty: q } of cart.values()) {
    qty += q;
    sum += product.price * q;
  }
  return { qty, sum };
}

function renderCart() {
  el.cartList.innerHTML = '';
  el.cartEmpty.hidden = cart.size > 0;

  for (const { product: p, qty } of cart.values()) {
    const li = document.createElement('li');
    li.className = 'cart-item';
    li.innerHTML = `
      <span class="ci-name">${p.name}</span>
      <span class="ci-sum">${baht(p.price * qty)}</span>
      <span class="ci-unit">${baht(p.price)} × ${qty}</span>
      <span class="qty">
        <button type="button" data-act="dec" title="ลด">−</button>
        <span class="n">${qty}</span>
        <button type="button" data-act="inc" title="เพิ่ม">+</button>
        <button type="button" data-act="del" title="ลบออก">🗑</button>
      </span>`;
    li.querySelector('[data-act="dec"]').addEventListener('click', () => setQty(p.sku, qty - 1));
    li.querySelector('[data-act="inc"]').addEventListener('click', () => setQty(p.sku, qty + 1));
    li.querySelector('[data-act="del"]').addEventListener('click', () => setQty(p.sku, 0));
    el.cartList.appendChild(li);
  }

  const { qty, sum } = totals();
  el.totalQty.textContent = qty;
  el.subtotal.textContent = baht(sum);
  el.grandTotal.textContent = baht(sum);
  el.payBtn.disabled = cart.size === 0;
  el.payBtn.textContent = cart.size === 0 ? 'ชำระเงิน' : `ชำระเงิน ${baht(sum)}`;
}

/* ---------- ชำระเงิน ---------- */
function openPay() {
  countClick();
  el.payAmount.textContent = baht(totals().sum);
  el.payModal.hidden = false;
}

function finishSale(method) {
  countClick();
  const { qty, sum } = totals();
  const now = new Date();

  el.receiptSub.textContent =
    `${now.toLocaleDateString('th-TH')} ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` +
    ` · ${qty} ชิ้น · ${method}`;

  el.receiptList.innerHTML = '';
  for (const { product: p, qty: q } of cart.values()) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${p.name} × ${q}</span><span>${baht(p.price * q)}</span>`;
    el.receiptList.appendChild(li);
  }
  el.receiptTotal.textContent = baht(sum);
  el.clicksUsed.textContent = clicks <= MAX_CLICKS
    ? `ใช้ไป ${clicks} คลิก (ไม่เกิน ${MAX_CLICKS} คลิก ✔)`
    : `ใช้ไป ${clicks} คลิก (เกินเป้า ${MAX_CLICKS} คลิก)`;

  el.payModal.hidden = true;
  el.receiptModal.hidden = false;
}

function startNewSale() {
  cart.clear();
  query = '';
  el.search.value = '';
  el.clearSearch.hidden = true;
  el.receiptModal.hidden = true;
  resetClicks();
  renderCart();
  renderGrid();
  el.search.focus();
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1400);
}

/* ---------- เหตุการณ์ ---------- */
el.search.addEventListener('input', () => {
  query = el.search.value.trim();
  el.clearSearch.hidden = query === '';
  renderGrid();
});

el.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && visible.length > 0) {
    // ทางลัด: ค้นหาแล้วกด Enter เพิ่มสินค้าอันดับแรก โดยไม่นับเป็นคลิก
    addToCart(visible[0]);
    el.search.select();
  }
  if (e.key === 'Escape') {
    el.search.value = '';
    query = '';
    el.clearSearch.hidden = true;
    renderGrid();
  }
});

el.clearSearch.addEventListener('click', () => {
  el.search.value = '';
  query = '';
  el.clearSearch.hidden = true;
  renderGrid();
  el.search.focus();
});

el.clearCart.addEventListener('click', () => {
  cart.clear();
  resetClicks();
  renderCart();
  renderGrid();
});

el.payBtn.addEventListener('click', openPay);
el.cancelPay.addEventListener('click', () => { el.payModal.hidden = true; });
el.payModal.addEventListener('click', (e) => { if (e.target === el.payModal) el.payModal.hidden = true; });

el.payMethods.addEventListener('click', (e) => {
  const btn = e.target.closest('.method');
  if (btn) finishSale(btn.dataset.method);
});

el.newSale.addEventListener('click', startNewSale);

document.addEventListener('keydown', (e) => {
  if (e.key === 'F2' && !el.payBtn.disabled) { e.preventDefault(); openPay(); }   // ทางลัดคีย์ลัด
  if (e.key === '/' && document.activeElement !== el.search) { e.preventDefault(); el.search.focus(); }
});

/* ---------- ซิงก์กับหน้าเพิ่มสินค้า ---------- */
function reloadProducts() {
  PRODUCTS = Store.all();
  if (activeCat !== 'ทั้งหมด' && !PRODUCTS.some((p) => p.cat === activeCat)) {
    activeCat = 'ทั้งหมด';
  }
  renderCategories();
  renderGrid();
}

// กลับมาที่หน้านี้อีกครั้ง (หรือแก้สินค้าจากอีกแท็บ) ให้ดึงรายการล่าสุด
window.addEventListener('pageshow', reloadProducts);
window.addEventListener('focus', reloadProducts);
window.addEventListener('storage', reloadProducts);

/* ---------- เริ่มต้น ---------- */
renderCategories();
renderGrid();
renderCart();
