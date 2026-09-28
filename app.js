/* ร้านขายของ — ระบบขายหน้าร้าน (POS)
 * ขั้นตอนการขาย: สแกน QR -> เลื่อนเลือกจำนวน -> ยืนยันใส่ตะกร้า -> ยืนยันขาย -> เลือกวิธีจ่าย -> ใบเสร็จ
 * เปิดจาก Rich menu ด้วยลิงก์ index.html?scan=1 จะเปิดกล้องสแกนให้ทันที
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
  scanBtn: $('scanBtn'), scanMore: $('scanMore'),
  scanModal: $('scanModal'), scanError: $('scanError'), cancelScan: $('cancelScan'),
  qtyModal: $('qtyModal'), qtyThumb: $('qtyThumb'), qtyName: $('qtyName'), qtyMeta: $('qtyMeta'),
  qtyValue: $('qtyValue'), qtyRange: $('qtyRange'), qtyDec: $('qtyDec'), qtyInc: $('qtyInc'),
  qtyMin: $('qtyMin'), qtyMax: $('qtyMax'), qtySum: $('qtySum'),
  qtyConfirm: $('qtyConfirm'), qtyCancel: $('qtyCancel'),
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
  el.categories.hidden = cats.length <= 2;   // มีหมวดเดียว ปุ่มหมวดไม่มีประโยชน์
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
  el.empty.textContent = PRODUCTS.length ? 'ไม่พบสินค้าที่ตรงกับคำค้นหา' : 'ยังไม่มีสินค้า — เพิ่มสินค้าได้ที่หน้าสินค้า';

  for (const p of visible) {
    const inCart = cart.get(p.sku);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card' + (p.stock <= 0 ? ' sold-out' : '');
    card.dataset.sku = p.sku;
    card.disabled = p.stock <= 0;
    card.innerHTML = `
      ${inCart ? `<span class="badge">${inCart.qty}</span>` : ''}
      ${thumbHTML(p, 'card-thumb')}
      <span class="name">${p.name}</span>
      <span class="price">${baht(p.price)}</span>
      <span class="sku">${p.sku} · ${p.cat}</span>
      <span class="stock-tag ${stockLevel(p)}">${p.stock <= 0 ? 'หมด' : `เหลือ ${p.stock}`}</span>`;
    card.addEventListener('click', () => openQty(p));
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
  if (p.stock <= 0) {
    toast(`${p.name} หมดแล้ว — เติมสต็อกในหน้าสินค้าก่อน`);
    return;
  }

  const line = cart.get(p.sku);
  const already = line ? line.qty : 0;
  if (already + qty > p.stock) {
    toast(`${p.name} เหลือ ${p.stock} ชิ้น — หยิบได้ไม่เกินนี้`);
    if (already >= p.stock) return;
    qty = p.stock - already;
  }

  if (line) line.qty += qty;
  else cart.set(p.sku, { product: p, qty });
  renderCart();
  renderGrid();
  flashCard(p.sku);
  toast(`เพิ่ม ${p.name} × ${qty}`);
}

function setQty(sku, qty) {
  if (qty <= 0) {
    cart.delete(sku);
  } else {
    const line = cart.get(sku);
    const stock = Store.find(sku)?.stock ?? 0;
    if (qty > stock) {
      toast(`${line.product.name} เหลือ ${stock} ชิ้น`);
      qty = Math.max(0, stock);
      if (qty === 0) { cart.delete(sku); renderCart(); renderGrid(); return; }
    }
    line.qty = qty;
  }
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
        <button type="button" data-act="del" title="ลบออก">ลบ</button>
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
  // ห้ามชำระเงินถ้ามีรายการที่เกินสต็อก (เช่น ของถูกแก้จากหน้าสินค้าระหว่างขาย)
  const overStock = [...cart.values()].filter(({ product: p, qty: q }) => q > (Store.find(p.sku)?.stock ?? 0));
  el.payBtn.disabled = cart.size === 0 || overStock.length > 0;
  el.payBtn.textContent = cart.size === 0
    ? 'ยืนยันขาย'
    : overStock.length
      ? `สต็อกไม่พอ: ${overStock[0].product.name}`
      : `ยืนยันขาย ${baht(sum)}`;
}

/* ---------- สแกน QR ---------- */
// QR ของสินค้าแต่ละชิ้นเก็บ "รหัสสินค้า" (เช่น A01) — พิมพ์ได้จากหน้าสินค้า
let scanner = null;
let scanLocked = false;   // กันยิงผลซ้ำระหว่างรอปิดกล้อง

function findByCode(text) {
  const code = String(text).trim();
  let sku = code;
  try { sku = new URL(code).searchParams.get('sku') || code; } catch { /* ไม่ใช่ URL */ }
  sku = sku.toUpperCase();
  return PRODUCTS.find((p) => p.sku.toUpperCase() === sku) || null;
}

async function openScan() {
  collapseCart();
  el.scanError.hidden = true;
  el.scanModal.hidden = false;
  scanLocked = false;

  if (typeof Html5Qrcode === 'undefined') {
    showScanError('โหลดตัวสแกนไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ต หรือเลือกสินค้าจากรายการแทน');
    return;
  }
  scanner = scanner || new Html5Qrcode('reader');
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; } },
      onScan,
    );
  } catch (err) {
    showScanError('เปิดกล้องไม่ได้ — อนุญาตการใช้กล้อง แล้วลองอีกครั้ง (ต้องเปิดผ่าน https)');
  }
}

function showScanError(msg) {
  el.scanError.textContent = msg;
  el.scanError.hidden = false;
}

async function closeScan() {
  el.scanModal.hidden = true;
  if (scanner?.isScanning) {
    try { await scanner.stop(); } catch { /* ปิดไปแล้ว */ }
  }
}

async function onScan(text) {
  if (scanLocked) return;
  const p = findByCode(text);
  if (!p) {
    toast(`ไม่พบสินค้ารหัส "${text}"`);
    return;   // สแกนต่อได้เลย
  }
  scanLocked = true;
  if (navigator.vibrate) navigator.vibrate(60);
  await closeScan();
  openQty(p);
}

/* ---------- เลือกจำนวน (แถบเลื่อน) ---------- */
let qtyProduct = null;

function openQty(p) {
  const inCart = cart.get(p.sku)?.qty ?? 0;
  const left = p.stock - inCart;
  if (p.stock <= 0) { toast(`${p.name} หมดแล้ว — เติมสต็อกในหน้าสินค้าก่อน`); return; }
  if (left <= 0) { toast(`${p.name} อยู่ในตะกร้าครบ ${p.stock} ชิ้นแล้ว`); return; }

  qtyProduct = p;
  el.qtyThumb.innerHTML = thumbHTML(p, 'qty-thumb');
  el.qtyName.textContent = p.name;
  el.qtyMeta.textContent = `${baht(p.price)} / ชิ้น · คงเหลือ ${p.stock}` + (inCart ? ` · ในตะกร้า ${inCart}` : '');
  el.qtyRange.max = left;
  el.qtyRange.value = 1;
  el.qtyMin.textContent = '1 ชิ้น';
  el.qtyMax.textContent = `${left.toLocaleString('th-TH')} ชิ้น`;
  el.qtyRange.disabled = left === 1;
  renderQty();
  el.qtyModal.hidden = false;
}

function renderQty() {
  const n = Number(el.qtyRange.value);
  const min = Number(el.qtyRange.min), max = Number(el.qtyRange.max);
  const pct = max > min ? ((n - min) / (max - min)) * 100 : 100;
  el.qtyRange.style.setProperty('--pct', pct + '%');
  el.qtyValue.textContent = n.toLocaleString('th-TH');
  el.qtySum.textContent = baht(qtyProduct.price * n);
  el.qtyDec.disabled = n <= min;
  el.qtyInc.disabled = n >= max;
}

function stepQty(d) {
  el.qtyRange.value = Number(el.qtyRange.value) + d;
  renderQty();
}

function confirmQty() {
  const p = qtyProduct;
  el.qtyModal.hidden = true;
  addToCart(p, Number(el.qtyRange.value));
  // พาไปที่ตะกร้า (มือถือ: กางรายการ)
  document.body.classList.add('cart-open');
  el.toggleCart.setAttribute('aria-expanded', 'true');
  el.cart.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    // ทางลัด: ค้นหา (หรือยิงเครื่องอ่านบาร์โค้ด) แล้วกด Enter — ตรงรหัสพอดีใช้ตัวนั้น ไม่งั้นใช้อันดับแรก
    openQty(findByCode(el.search.value) || visible[0]);
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

el.scanBtn.addEventListener('click', openScan);
el.scanMore.addEventListener('click', openScan);
el.cancelScan.addEventListener('click', closeScan);
el.scanModal.addEventListener('click', (e) => { if (e.target === el.scanModal) closeScan(); });

el.qtyRange.addEventListener('input', renderQty);
el.qtyDec.addEventListener('click', () => stepQty(-1));
el.qtyInc.addEventListener('click', () => stepQty(1));
el.qtyConfirm.addEventListener('click', confirmQty);
el.qtyCancel.addEventListener('click', () => { el.qtyModal.hidden = true; });
el.qtyModal.addEventListener('click', (e) => { if (e.target === el.qtyModal) el.qtyModal.hidden = true; });

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

// เปิดจาก Rich menu (index.html?scan=1) — เปิดกล้องทันที
if (new URLSearchParams(location.search).has('scan')) openScan();
