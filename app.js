/* ร้านขายของ — ระบบขายหน้าร้าน (POS)
 * ขั้นตอนการขาย: เลือกสินค้า -> ชำระเงิน -> เลือกวิธีจ่าย -> ใบเสร็จ
 * ทางลัด: พิมพ์ค้นหาแล้วกด Enter เพื่อเพิ่มสินค้าอันดับแรกทันที
 */

/* ---------- ข้อมูลสินค้า (มาจาก store.js / localStorage) ---------- */
let PRODUCTS = Store.all();

/* ---------- สถานะ ---------- */
const cart = new Map();     // sku -> { product, qty }
let activeCat = 'ทั้งหมด';
let query = '';
let visible = [];           // สินค้าที่แสดงอยู่ตอนนี้ (สำหรับกด Enter)

/* ---------- อ้างอิง DOM ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  search: $('search'), clearSearch: $('clearSearch'),
  categories: $('categories'), grid: $('grid'), empty: $('empty'),
  cartList: $('cartList'), cartEmpty: $('cartEmpty'),
  totalQty: $('totalQty'), subtotal: $('subtotal'), grandTotal: $('grandTotal'),
  payBtn: $('payBtn'), clearCart: $('clearCart'),
  cart: $('cart'), toggleCart: $('toggleCart'), handleCount: $('handleCount'),
  payModal: $('payModal'), payAmount: $('payAmount'), payMethods: $('payMethods'), cancelPay: $('cancelPay'),
  receiptModal: $('receiptModal'), receiptSub: $('receiptSub'), receiptList: $('receiptList'),
  receiptTotal: $('receiptTotal'), newSale: $('newSale'),
  toast: $('toast'),
};

const baht = (n) => '฿' + n.toLocaleString('th-TH');

/** ระดับสต็อก: out = หมด, low = ใกล้หมด, ok = ปกติ */
function stockLevel(p) {
  if (p.stock <= 0) return 'out';
  return p.stock <= p.reorder ? 'low' : 'ok';
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
      <span class="sku">${p.sku} · ${p.cat}</span>
      <span class="stock-tag ${stockLevel(p)}">${p.stock <= 0 ? 'หมด' : `เหลือ ${p.stock}`}</span>`;
    card.addEventListener('click', () => addToCart(p));
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

  // ขายได้ แต่เตือนให้รู้ว่าจำนวนในตะกร้าเกินที่บันทึกไว้
  const inCart = cart.get(p.sku).qty;
  if (inCart > p.stock) toast(`⚠️ ${p.name} — สต็อกมี ${p.stock}, ในตะกร้า ${inCart}`);
  else toast(`เพิ่ม ${p.name}`);
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
  el.handleCount.textContent = qty;
  el.payBtn.disabled = cart.size === 0;
  el.payBtn.textContent = cart.size === 0 ? 'ชำระเงิน' : `ชำระเงิน ${baht(sum)}`;
}

/* ---------- ชำระเงิน ---------- */
function openPay() {
  el.payAmount.textContent = baht(totals().sum);
  el.payModal.hidden = false;
}

function finishSale(method) {
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

  // บันทึกบิล (เก็บชื่อ+ราคา ณ ตอนขาย เพื่อให้ยอดย้อนหลังไม่เพี้ยนเมื่อแก้ราคาทีหลัง)
  Sales.add({
    method,
    total: sum,
    items: [...cart.values()].map(({ product: p, qty: q }) => ({
      sku: p.sku, name: p.name, price: p.price, qty: q,
    })),
  });

  // ตัดสต็อกตามจำนวนที่ขายจริง แล้วโหลดรายการใหม่
  Store.deductMany([...cart.values()].map(({ product, qty: q }) => ({ sku: product.sku, qty: q })));
  PRODUCTS = Store.all();

  el.payModal.hidden = true;
  el.receiptModal.hidden = false;
}

function startNewSale() {
  cart.clear();
  collapseCart();
  query = '';
  el.search.value = '';
  el.clearSearch.hidden = true;
  el.receiptModal.hidden = true;
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
    // ทางลัด: ค้นหาแล้วกด Enter เพิ่มสินค้าอันดับแรกทันที
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
  renderCart();
  renderGrid();
});

// มือถือ: กดที่จับเพื่อกาง/หุบรายการในตะกร้า
el.toggleCart.addEventListener('click', () => {
  const open = document.body.classList.toggle('cart-open');
  el.toggleCart.setAttribute('aria-expanded', String(open));
});

function collapseCart() {
  document.body.classList.remove('cart-open');
  el.toggleCart.setAttribute('aria-expanded', 'false');
}

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
