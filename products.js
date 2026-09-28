/* products.js — หน้าเพิ่ม / แก้ไข / ลบ สินค้า
 * เพิ่มสินค้า: ใส่ รูป ชื่อ ราคา จำนวน -> ระบบออกรหัสให้เอง -> แสดง QR ให้ดาวน์โหลดไปติดสินค้า
 * QR เก็บรหัสสินค้า (เช่น A01) ซึ่งหน้าขายใช้สแกน — รหัสจึงแก้ไม่ได้หลังสร้าง
 */

const $ = (id) => document.getElementById(id);
const el = {
  form: $('productForm'), formTitle: $('formTitle'), formError: $('formError'),
  originalSku: $('originalSku'),
  image: $('fImage'), photoPreview: $('photoPreview'), photoEmpty: $('photoEmpty'), photoRemove: $('photoRemove'),
  name: $('fName'), price: $('fPrice'), stock: $('fStock'),
  submitBtn: $('submitBtn'), cancelEdit: $('cancelEdit'),
  prodList: $('prodList'), listEmpty: $('listEmpty'), count: $('count'),
  filter: $('filter'), resetStore: $('resetStore'),
  qrModal: $('qrModal'), qrAdded: $('qrAdded'), qrImg: $('qrImg'),
  qrDownload: $('qrDownload'), qrAddNext: $('qrAddNext'), qrX: $('qrX'),
  toast: $('toast'),
};

const baht = (n) => '฿' + Number(n || 0).toLocaleString('th-TH');

let photo = '';           // รูปในฟอร์มตอนนี้ (data URL)
let qrProduct = null;     // สินค้าที่เปิด QR อยู่
let qrPng = '';           // รูป QR + ชื่อสินค้า (data URL) ของสินค้าที่เปิดอยู่

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

/* ---------- ตารางรายการ ---------- */
function renderTable() {
  const q = el.filter.value.trim().toLowerCase();
  const list = Store.all()
    .filter((p) => !q || (p.name + ' ' + p.sku + ' ' + p.cat).toLowerCase().includes(q));

  const lowCount = Store.lowStock().length;
  el.count.textContent = `${list.length} รายการ` + (lowCount ? ` · ใกล้หมด ${lowCount}` : '');
  el.prodList.innerHTML = '';
  el.listEmpty.hidden = list.length > 0;

  for (const p of list) {
    const tr = document.createElement('li');
    tr.className = 'prod-card';
    tr.innerHTML = `
      <div class="prod-top">
        ${thumbHTML(p, 'prod-thumb')}
        <div class="prod-info">
          <p class="prod-name">${p.name}</p>
          <p class="prod-price">${baht(p.price)}</p>
          <p class="prod-sku">รหัส ${p.sku}</p>
        </div>
      </div>
      <div class="prod-stock">
        <span class="prod-stock-label">คงเหลือ</span>
        <span class="big-stepper">
          <button class="big-step" data-act="minus" type="button" aria-label="ลดสต็อก 1">−</button>
          <b class="big-num stock-num ${stockLevel(p)}">${p.stock}</b>
          <button class="big-step" data-act="plus" type="button" aria-label="เพิ่มสต็อก 1">+</button>
        </span>
      </div>
      <div class="prod-actions">
        <button class="act-btn" data-act="qr" type="button">QR</button>
        <button class="act-btn" data-act="edit" type="button">แก้ไข</button>
        <button class="act-btn danger" data-act="del" type="button">ลบ</button>
      </div>`;
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
    el.prodList.appendChild(tr);
  }
}

function refreshAll() {
  renderTable();
}

/* ---------- QR ของสินค้า (ข้อมูลใน QR = รหัสสินค้า) ---------- */
function qrReady() {
  if (typeof qrcode !== 'undefined') return true;
  toast('โหลดตัวสร้าง QR ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ต');
  return false;
}

/** แบ่งข้อความเป็นคำ (ภาษาไทยไม่มีเว้นวรรค) — ไม่มี Intl.Segmenter ก็แบ่งตามตัวอักษรแต่ไม่แยกสระ/วรรณยุกต์ออกจากพยัญชนะ */
function segments(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return [...new Intl.Segmenter('th', { granularity: 'word' }).segment(text)].map((s) => s.segment);
  }
  return text.match(/.[ัิ-ฺ็-๎]*/gsu) || [];
}

/** ตัดชื่อยาวเป็นหลายบรรทัดให้พอดีความกว้าง โดยตัดตามคำ */
function wrapText(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = '';
  for (const seg of segments(text)) {
    if (ctx.measureText(line + seg).width > maxWidth && line.trim()) {
      lines.push(line.trim());
      line = seg;
    } else {
      line += seg;
    }
  }
  line = line.trim();
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
  }
  return lines;
}

/** วาดรูป QR พร้อมชื่อสินค้า ราคา รหัส ใต้ QR — คืน data URL (PNG) */
async function qrImage(p) {
  if (document.fonts) await document.fonts.ready;
  const qr = qrcode(0, 'M');
  qr.addData(p.sku);
  qr.make();

  const W = 600, pad = 44, font = '"Noto Sans Thai", sans-serif';
  const n = qr.getModuleCount();
  const cell = Math.floor((W - pad * 2) / n);
  const size = cell * n;
  const x0 = Math.round((W - size) / 2);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `700 40px ${font}`;
  const lines = wrapText(ctx, p.name, W - pad * 2, 2);
  canvas.width = W;
  canvas.height = pad + size + 30 + lines.length * 54 + 44 + pad;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(x0 + c * cell, pad + r * cell, cell, cell);
    }
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1b2430';
  ctx.font = `700 40px ${font}`;
  let y = pad + size + 30;
  for (const l of lines) { ctx.fillText(l, W / 2, y, W - pad * 2); y += 54; }
  ctx.fillStyle = '#6b7a8c';
  ctx.font = `400 28px ${font}`;
  ctx.fillText(`${baht(p.price)} · รหัส ${p.sku}`, W / 2, y + 4);

  return canvas.toDataURL('image/png');
}

/** justAdded = เปิดหลังกดเพิ่มสินค้า (โชว์ข้อความสำเร็จ) */
async function showQr(p, justAdded = false) {
  if (!qrReady()) return;
  qrProduct = p;
  qrPng = '';
  el.qrAdded.textContent = justAdded ? 'เพิ่มสินค้าแล้ว' : 'QR สินค้า';
  el.qrAdded.classList.toggle('ok', justAdded);
  el.qrImg.removeAttribute('src');
  el.qrModal.hidden = false;
  const png = await qrImage(p);
  if (qrProduct === p) { qrPng = png; el.qrImg.src = png; }
}

function closeQr() {
  el.qrModal.hidden = true;
}

/** ไปที่ฟอร์มเพิ่มสินค้าใหม่ (ล้างฟอร์ม เลื่อนขึ้นบน แล้วโฟกัสช่องชื่อ) */
function goAddProduct() {
  closeQr();
  resetForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  el.name.focus({ preventScroll: true });
}

/** ดาวน์โหลดรูป QR — มือถือใช้เมนูแชร์ (มี "บันทึกรูปภาพ") ถ้าทำได้ ไม่งั้นดาวน์โหลดไฟล์ */
async function downloadQr() {
  if (!qrPng) return;
  const p = qrProduct;
  const filename = `QR-${p.sku}-${p.name}.png`.replace(/[\\/:*?"<>|]/g, '');
  const blob = await (await fetch(qrPng)).blob();
  const file = new File([blob], filename, { type: 'image/png' });

  const mobile = matchMedia('(pointer: coarse)').matches;
  if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;   // ผู้ใช้กดยกเลิก
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

el.qrDownload.addEventListener('click', downloadQr);
el.qrAddNext.addEventListener('click', goAddProduct);
el.qrX.addEventListener('click', closeQr);
el.qrModal.addEventListener('click', (e) => { if (e.target === el.qrModal) closeQr(); });

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

  if (!name) return showError('กรุณากรอกชื่อสินค้า');
  if (priceRaw === '' || isNaN(Number(priceRaw)) || Number(priceRaw) < 0) {
    return showError('กรุณากรอกราคาเป็นตัวเลขไม่ติดลบ');
  }
  if (stockRaw !== '' && (isNaN(Number(stockRaw)) || Number(stockRaw) < 0)) {
    return showError('จำนวนต้องเป็นตัวเลขไม่ติดลบ');
  }

  const editing = el.originalSku.value;
  const old = editing ? Store.find(editing) : null;
  const product = {
    ...old,
    sku: editing || Store.nextSku(),
    name,
    price: Number(priceRaw),
    stock: stockRaw === '' ? 0 : Number(stockRaw),
    cat: old?.cat || 'ทั่วไป',
    reorder: old?.reorder ?? 3,
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

el.filter.addEventListener('input', renderTable);

/* ---------- เริ่มต้น ---------- */
resetForm();
refreshAll();
