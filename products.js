/* products.js — หน้าเพิ่ม / แก้ไข / ลบ สินค้า */

const $ = (id) => document.getElementById(id);
const el = {
  form: $('productForm'), formTitle: $('formTitle'), formError: $('formError'),
  originalSku: $('originalSku'),
  name: $('fName'), price: $('fPrice'), sku: $('fSku'),
  cat: $('fCat'), emoji: $('fEmoji'), keywords: $('fKeywords'),
  stock: $('fStock'), reorder: $('fReorder'), lowOnly: $('lowOnly'),
  catList: $('catList'), emojiPick: $('emojiPick'),
  submitBtn: $('submitBtn'), cancelEdit: $('cancelEdit'),
  previewCard: $('previewCard'),
  tbody: $('tbody'), listEmpty: $('listEmpty'), count: $('count'),
  filter: $('filter'), resetStore: $('resetStore'), fillStock: $('fillStock'),
  toast: $('toast'),
};

const EMOJIS = ['📦','🍚','🍜','🥚','🥛','💧','🥤','☕','🍞','🥐','🥔','🍫','🍨','🍌','🍎','🍗','🍱','🍢','🧼','🪥','🧻','🔋','🛢️','🧴','🍬','🧃','🥫','🍖'];

const baht = (n) => '฿' + Number(n || 0).toLocaleString('th-TH');

let lowOnly = false;   // กรองเฉพาะสินค้าที่ถึงจุดสั่งซื้อ

/** ระดับสต็อก: out = หมด, low = ใกล้หมด, ok = ปกติ */
function stockLevel(p) {
  if (p.stock <= 0) return 'out';
  return p.stock <= p.reorder ? 'low' : 'ok';
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 1600);
}

/* ---------- ตัวอย่างการ์ด ---------- */
function renderPreview() {
  const name = el.name.value.trim() || 'ชื่อสินค้า';
  const price = Number(el.price.value) || 0;
  const sku = el.sku.value.trim() || Store.nextSku();
  const cat = el.cat.value.trim() || '—';
  el.previewCard.querySelector('.emoji').textContent = el.emoji.value.trim() || '📦';
  el.previewCard.querySelector('.name').textContent = name;
  el.previewCard.querySelector('.price').textContent = baht(price);
  el.previewCard.querySelector('.sku').textContent = `${sku} · ${cat}`;
}

/* ---------- ปุ่มเลือกอีโมจิ ---------- */
function renderEmojiPicker() {
  el.emojiPick.innerHTML = '';
  for (const e of EMOJIS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'emoji-btn';
    b.textContent = e;
    b.addEventListener('click', () => {
      el.emoji.value = e;
      renderPreview();
    });
    el.emojiPick.appendChild(b);
  }
}

/* ---------- datalist หมวดหมู่ ---------- */
function renderCatList() {
  el.catList.innerHTML = '';
  for (const c of Store.categories()) {
    const o = document.createElement('option');
    o.value = c;
    el.catList.appendChild(o);
  }
}

/* ---------- ตารางรายการ ---------- */
function renderTable() {
  const q = el.filter.value.trim().toLowerCase();
  const list = Store.all()
    .filter((p) => !q || (p.name + ' ' + p.sku + ' ' + p.cat).toLowerCase().includes(q))
    .filter((p) => !lowOnly || stockLevel(p) !== 'ok');

  const lowCount = Store.lowStock().length;
  el.count.textContent = `${list.length} รายการ` + (lowCount ? ` · ใกล้หมด ${lowCount}` : '');
  el.lowOnly.classList.toggle('active', lowOnly);
  el.lowOnly.setAttribute('aria-pressed', String(lowOnly));
  el.tbody.innerHTML = '';
  el.listEmpty.hidden = list.length > 0;

  for (const p of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-emoji">${p.emoji || '📦'}</td>
      <td class="td-sku">${p.sku}</td>
      <td>${p.name}</td>
      <td><span class="tag">${p.cat}</span></td>
      <td class="right td-price">${baht(p.price)}</td>
      <td class="right nowrap">
        <span class="stock-cell">
          <button class="step-btn" data-act="minus" type="button" title="ลดสต็อก 1">−</button>
          <span class="stock-num ${stockLevel(p)}">${p.stock}</span>
          <button class="step-btn" data-act="plus" type="button" title="เพิ่มสต็อก 1">+</button>
        </span>
      </td>
      <td class="right nowrap">
        <button class="mini-btn" data-act="edit" type="button">แก้ไข</button>
        <button class="mini-btn danger" data-act="del" type="button">ลบ</button>
      </td>`;
    tr.querySelector('[data-act="minus"]').addEventListener('click', () => {
      Store.adjustStock(p.sku, -1);
      refreshAll();
    });
    tr.querySelector('[data-act="plus"]').addEventListener('click', () => {
      Store.adjustStock(p.sku, 1);
      refreshAll();
    });
    tr.querySelector('[data-act="edit"]').addEventListener('click', () => startEdit(p));
    tr.querySelector('[data-act="del"]').addEventListener('click', () => {
      if (!confirm(`ลบ "${p.name}" ออกจากรายการสินค้า?`)) return;
      Store.remove(p.sku);
      if (el.originalSku.value === p.sku) resetForm();
      refreshAll();
      toast('ลบสินค้าแล้ว');
    });
    el.tbody.appendChild(tr);
  }
}

function refreshAll() {
  renderTable();
  renderCatList();
  renderPreview();
}

/* ---------- ฟอร์ม ---------- */
function showError(msg) {
  el.formError.textContent = msg;
  el.formError.hidden = !msg;
}

function resetForm() {
  el.form.reset();
  el.originalSku.value = '';
  el.formTitle.textContent = 'เพิ่มสินค้าใหม่';
  el.submitBtn.textContent = 'บันทึกสินค้า';
  el.cancelEdit.hidden = true;
  el.sku.placeholder = `เว้นว่าง = ${Store.nextSku()}`;
  el.stock.value = '';
  el.reorder.value = '';
  showError('');
  renderPreview();
}

function startEdit(p) {
  el.originalSku.value = p.sku;
  el.name.value = p.name;
  el.price.value = p.price;
  el.sku.value = p.sku;
  el.cat.value = p.cat;
  el.emoji.value = p.emoji || '';
  el.keywords.value = p.keywords || '';
  el.stock.value = p.stock;
  el.reorder.value = p.reorder;
  el.formTitle.textContent = `แก้ไข: ${p.name}`;
  el.submitBtn.textContent = 'บันทึกการแก้ไข';
  el.cancelEdit.hidden = false;
  showError('');
  renderPreview();
  el.name.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

el.form.addEventListener('submit', (e) => {
  e.preventDefault();

  const name = el.name.value.trim();
  const priceRaw = el.price.value.trim();
  const cat = el.cat.value.trim();

  if (!name) return showError('กรุณากรอกชื่อสินค้า');
  if (priceRaw === '' || isNaN(Number(priceRaw)) || Number(priceRaw) < 0) {
    return showError('กรุณากรอกราคาเป็นตัวเลขไม่ติดลบ');
  }
  if (!cat) return showError('กรุณากรอกหมวดหมู่');
  if (el.stock.value.trim() !== '' && isNaN(Number(el.stock.value))) {
    return showError('จำนวนคงเหลือต้องเป็นตัวเลข');
  }
  if (el.reorder.value.trim() !== '' && (isNaN(Number(el.reorder.value)) || Number(el.reorder.value) < 0)) {
    return showError('จุดสั่งซื้อต้องเป็นตัวเลขไม่ติดลบ');
  }

  const product = {
    sku: el.sku.value.trim() || Store.nextSku(),
    name,
    price: Number(priceRaw),
    cat,
    emoji: el.emoji.value.trim() || '📦',
    keywords: el.keywords.value.trim(),
    stock: el.stock.value.trim() === '' ? 0 : Number(el.stock.value),
    reorder: el.reorder.value.trim() === '' ? 3 : Number(el.reorder.value),
    cost: (el.originalSku.value && Store.find(el.originalSku.value)?.cost) || 0,
  };

  const editing = el.originalSku.value;
  const res = editing ? Store.update(editing, product) : Store.add(product);
  if (!res.ok) return showError(res.error);

  toast(editing ? `แก้ไข "${product.name}" แล้ว` : `เพิ่ม "${product.name}" แล้ว`);
  resetForm();
  refreshAll();
});

el.cancelEdit.addEventListener('click', () => { resetForm(); refreshAll(); });

el.resetStore.addEventListener('click', () => {
  if (!confirm('คืนค่าเป็นชุดสินค้าตัวอย่าง? สินค้าที่เพิ่มเองจะหายทั้งหมด')) return;
  Store.reset();
  resetForm();
  refreshAll();
  toast('คืนค่าชุดตัวอย่างแล้ว');
});

// ตั้งสต็อกให้สินค้าที่ยังเป็น 0 ทั้งหมดในครั้งเดียว (ใช้ตอนเริ่มใช้ระบบ)
el.fillStock.addEventListener('click', () => {
  const zero = Store.all().filter((p) => p.stock <= 0);
  if (!zero.length) return toast('ไม่มีสินค้าที่สต็อกเป็น 0');

  const input = prompt(`ตั้งจำนวนคงเหลือให้สินค้าที่ยังเป็น 0 จำนวน ${zero.length} รายการ
ใส่จำนวน:`, '10');
  if (input === null) return;
  const qty = Number(input);
  if (!Number.isFinite(qty) || qty < 0) return toast('กรุณาใส่ตัวเลขไม่ติดลบ');

  const list = Store.all().map((p) => (p.stock <= 0 ? { ...p, stock: qty } : p));
  Store.saveAll(list);
  refreshAll();
  toast(`ตั้งสต็อก ${zero.length} รายการเป็น ${qty} แล้ว`);
});

el.filter.addEventListener('input', renderTable);

el.lowOnly.addEventListener('click', () => {
  lowOnly = !lowOnly;
  renderTable();
});

for (const input of [el.name, el.price, el.sku, el.cat, el.emoji]) {
  input.addEventListener('input', renderPreview);
}

/* ---------- เริ่มต้น ---------- */
renderEmojiPicker();
resetForm();
refreshAll();
el.name.focus();
