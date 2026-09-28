/* products.js — หน้าเพิ่ม / แก้ไข / ลบ สินค้า
 * เพิ่มสินค้า: ใส่ รูป ชื่อ ราคา จำนวน -> ระบบออกรหัสให้เอง -> แสดง QR พร้อมพิมพ์ติดสินค้า
 * QR เก็บรหัสสินค้า (เช่น A01) ซึ่งหน้าขายใช้สแกน — รหัสจึงแก้ไม่ได้หลังสร้าง
 */

const $ = (id) => document.getElementById(id);
const el = {
  form: $('productForm'), formTitle: $('formTitle'), formError: $('formError'),
  originalSku: $('originalSku'),
  image: $('fImage'), photoPreview: $('photoPreview'), photoEmpty: $('photoEmpty'), photoRemove: $('photoRemove'),
  name: $('fName'), price: $('fPrice'), stock: $('fStock'),
  cat: $('fCat'), reorder: $('fReorder'), catList: $('catList'),
  submitBtn: $('submitBtn'), cancelEdit: $('cancelEdit'),
  tbody: $('tbody'), listEmpty: $('listEmpty'), count: $('count'),
  filter: $('filter'), lowOnly: $('lowOnly'), resetStore: $('resetStore'),
  fillStock: $('fillStock'), printAll: $('printAll'),
  qrModal: $('qrModal'), qrAdded: $('qrAdded'), qrBox: $('qrBox'), qrName: $('qrName'), qrSub: $('qrSub'),
  qrPrint: $('qrPrint'), qrClose: $('qrClose'),
  printArea: $('printArea'),
  toast: $('toast'),
};

const baht = (n) => '฿' + Number(n || 0).toLocaleString('th-TH');

let lowOnly = false;      // กรองเฉพาะสินค้าที่ถึงจุดสั่งซื้อ
let photo = '';           // รูปในฟอร์มตอนนี้ (data URL)
let qrProduct = null;     // สินค้าที่เปิด QR อยู่

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

/* ---------- รูปสินค้า ---------- */
const PHOTO_MAX = 320;   // ย่อด้านยาวสุดเหลือเท่านี้ (px) ให้ localStorage เก็บได้หลายร้อยชิ้น

/** ย่อรูปแล้วคืน data URL แบบ JPEG */
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, PHOTO_MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';               // PNG โปร่งใส -> พื้นขาว
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('อ่านรูปไม่ได้')); };
    img.src = url;
  });
}

function setPhoto(dataUrl) {
  photo = dataUrl || '';
  el.photoPreview.src = photo;
  el.photoPreview.hidden = !photo;
  el.photoEmpty.hidden = !!photo;
  el.photoRemove.hidden = !photo;
}

el.image.addEventListener('change', async () => {
  const file = el.image.files[0];
  el.image.value = '';   // เลือกไฟล์เดิมซ้ำได้
  if (!file) return;
  try {
    setPhoto(await shrinkImage(file));
  } catch {
    toast('อ่านรูปไม่ได้ — ลองเลือกรูปอื่น');
  }
});

el.photoRemove.addEventListener('click', () => setPhoto(''));

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
      <td class="td-thumb">${thumbHTML(p, 'row-thumb')}</td>
      <td class="td-sku">${p.sku}</td>
      <td class="td-name">${p.name}<br><span class="td-cat">${p.cat}</span></td>
      <td class="right td-price">${baht(p.price)}</td>
      <td class="right nowrap">
        <span class="stock-cell">
          <button class="step-btn" data-act="minus" type="button" title="ลดสต็อก 1">−</button>
          <span class="stock-num ${stockLevel(p)}">${p.stock}</span>
          <button class="step-btn" data-act="plus" type="button" title="เพิ่มสต็อก 1">+</button>
        </span>
      </td>
      <td class="right nowrap">
        <button class="mini-btn" data-act="qr" type="button">QR</button>
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
    tr.querySelector('[data-act="qr"]').addEventListener('click', () => showQr(p));
    tr.querySelector('[data-act="edit"]').addEventListener('click', () => startEdit(p));
    tr.querySelector('[data-act="del"]').addEventListener('click', () => {
      if (!confirm(`ลบ "${p.name}" ออกจากรายการสินค้า?\nQR ที่ติดไว้จะใช้ขายไม่ได้อีก`)) return;
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
}

/* ---------- QR ของสินค้า (ข้อมูลใน QR = รหัสสินค้า) ---------- */
function qrSvg(sku) {
  const qr = qrcode(0, 'M');
  qr.addData(sku);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

function qrReady() {
  if (typeof qrcode !== 'undefined') return true;
  toast('โหลดตัวสร้าง QR ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ต');
  return false;
}

/** justAdded = เปิดหลังกดเพิ่มสินค้า (โชว์ข้อความสำเร็จ + ปุ่มเพิ่มชิ้นถัดไป) */
function showQr(p, justAdded = false) {
  if (!qrReady()) return;
  qrProduct = p;
  el.qrAdded.hidden = !justAdded;
  el.qrBox.innerHTML = qrSvg(p.sku);
  el.qrName.textContent = p.name;
  el.qrSub.textContent = `รหัส ${p.sku} · ${baht(p.price)}`;
  el.qrClose.textContent = justAdded ? 'เพิ่มสินค้าถัดไป' : 'ปิด';
  el.qrModal.hidden = false;
}

function closeQr() {
  el.qrModal.hidden = true;
  if (!el.qrAdded.hidden) el.name.focus();
}

/* ---------- พิมพ์ ---------- */
function labelHTML(p) {
  return `<div class="label">${qrSvg(p.sku)}<b>${p.name}</b><span>${baht(p.price)} · ${p.sku}</span></div>`;
}

function printLabels(list) {
  if (!qrReady()) return;
  el.printArea.innerHTML = list.map(labelHTML).join('');
  window.print();
}

window.addEventListener('afterprint', () => { el.printArea.innerHTML = ''; });

el.qrPrint.addEventListener('click', () => printLabels([qrProduct]));
el.qrClose.addEventListener('click', closeQr);
el.qrModal.addEventListener('click', (e) => { if (e.target === el.qrModal) closeQr(); });

el.printAll.addEventListener('click', () => {
  const list = Store.all();
  if (!list.length) return toast('ยังไม่มีสินค้า');
  printLabels(list);
});

/* ---------- ฟอร์ม ---------- */
function showError(msg) {
  el.formError.textContent = msg;
  el.formError.hidden = !msg;
}

function resetForm() {
  el.form.reset();
  el.originalSku.value = '';
  setPhoto('');
  el.formTitle.textContent = 'เพิ่มสินค้าใหม่';
  el.submitBtn.textContent = 'เพิ่มสินค้า';
  el.cancelEdit.hidden = true;
  showError('');
}

function startEdit(p) {
  el.originalSku.value = p.sku;
  setPhoto(p.image);
  el.name.value = p.name;
  el.price.value = p.price;
  el.stock.value = p.stock;
  el.cat.value = p.cat;
  el.reorder.value = p.reorder;
  el.formTitle.textContent = `แก้ไข: ${p.name} (${p.sku})`;
  el.submitBtn.textContent = 'บันทึกการแก้ไข';
  el.cancelEdit.hidden = false;
  showError('');
  el.name.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

el.form.addEventListener('submit', (e) => {
  e.preventDefault();

  const name = el.name.value.trim();
  const priceRaw = el.price.value.trim();
  const stockRaw = el.stock.value.trim();
  const reorderRaw = el.reorder.value.trim();

  if (!name) return showError('กรุณากรอกชื่อสินค้า');
  if (priceRaw === '' || isNaN(Number(priceRaw)) || Number(priceRaw) < 0) {
    return showError('กรุณากรอกราคาเป็นตัวเลขไม่ติดลบ');
  }
  if (stockRaw !== '' && (isNaN(Number(stockRaw)) || Number(stockRaw) < 0)) {
    return showError('จำนวนต้องเป็นตัวเลขไม่ติดลบ');
  }
  if (reorderRaw !== '' && (isNaN(Number(reorderRaw)) || Number(reorderRaw) < 0)) {
    return showError('จุดสั่งซื้อต้องเป็นตัวเลขไม่ติดลบ');
  }

  const editing = el.originalSku.value;
  const old = editing ? Store.find(editing) : null;
  const product = {
    ...old,
    sku: editing || Store.nextSku(),
    name,
    price: Number(priceRaw),
    stock: stockRaw === '' ? 0 : Number(stockRaw),
    cat: el.cat.value.trim() || 'ทั่วไป',
    reorder: reorderRaw === '' ? 3 : Number(reorderRaw),
    image: photo,
  };

  const res = editing ? Store.update(editing, product) : Store.add(product);
  if (!res.ok) return showError(res.error);

  resetForm();
  refreshAll();
  if (editing) toast(`แก้ไข "${product.name}" แล้ว`);
  else showQr(Store.find(product.sku), true);
});

el.cancelEdit.addEventListener('click', resetForm);

el.resetStore.addEventListener('click', () => {
  if (!confirm('ลบสินค้าทั้งหมด? ย้อนกลับไม่ได้')) return;
  Store.reset();
  resetForm();
  refreshAll();
  toast('ลบสินค้าทั้งหมดแล้ว');
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

/* ---------- เริ่มต้น ---------- */
resetForm();
refreshAll();
