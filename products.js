/* products.js — หน้าเพิ่ม / แก้ไข / ลบ สินค้า */

const $ = (id) => document.getElementById(id);
const el = {
  form: $('productForm'), formTitle: $('formTitle'), formError: $('formError'),
  originalSku: $('originalSku'),
  name: $('fName'), price: $('fPrice'), sku: $('fSku'),
  cat: $('fCat'), emoji: $('fEmoji'), keywords: $('fKeywords'),
  catList: $('catList'), emojiPick: $('emojiPick'),
  submitBtn: $('submitBtn'), cancelEdit: $('cancelEdit'),
  previewCard: $('previewCard'),
  tbody: $('tbody'), listEmpty: $('listEmpty'), count: $('count'),
  filter: $('filter'), resetStore: $('resetStore'),
  toast: $('toast'),
};

const EMOJIS = ['📦','🍚','🍜','🥚','🥛','💧','🥤','☕','🍞','🥐','🥔','🍫','🍨','🍌','🍎','🍗','🍱','🍢','🧼','🪥','🧻','🔋','🛢️','🧴','🍬','🧃','🥫','🍖'];

const baht = (n) => '฿' + Number(n || 0).toLocaleString('th-TH');

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
  const list = Store.all().filter((p) =>
    !q || (p.name + ' ' + p.sku + ' ' + p.cat).toLowerCase().includes(q));

  el.count.textContent = `${list.length} รายการ`;
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
        <button class="mini-btn" data-act="edit" type="button">แก้ไข</button>
        <button class="mini-btn danger" data-act="del" type="button">ลบ</button>
      </td>`;
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

  const product = {
    sku: el.sku.value.trim() || Store.nextSku(),
    name,
    price: Number(priceRaw),
    cat,
    emoji: el.emoji.value.trim() || '📦',
    keywords: el.keywords.value.trim(),
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

el.filter.addEventListener('input', renderTable);

for (const input of [el.name, el.price, el.sku, el.cat, el.emoji]) {
  input.addEventListener('input', renderPreview);
}

/* ---------- เริ่มต้น ---------- */
renderEmojiPicker();
resetForm();
refreshAll();
el.name.focus();
