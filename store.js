/* store.js — คลังข้อมูลสินค้า ใช้ร่วมกันระหว่างหน้าขาย (index.html) และหน้าจัดการสินค้า (products.html)
 * เก็บลง localStorage ของเบราว์เซอร์ เริ่มต้นเป็นรายการว่าง
 *
 * โครงสร้างสินค้า 1 รายการ:
 *   sku, name, cat, keywords, price
 *   image   = รูปสินค้า (data URL แบบ JPEG ย่อแล้ว) — ไม่มีรูปจะแสดงกรอบว่างแทน
 *   stock   = จำนวนคงเหลือ (ตัดอัตโนมัติเมื่อปิดการขาย)
 *   reorder = จุดสั่งซื้อ — เหลือเท่านี้หรือน้อยกว่าถือว่า "ใกล้หมด"
 *   cost    = ต้นทุน ยังไม่ใช้งานและไม่มีช่องกรอก เก็บไว้เผื่ออนาคตเท่านั้น
 */

const STORAGE_KEY = 'pos.products.v2';

// ล้างรายการสินค้าชุดเก่า (v1 = ชุดตัวอย่าง) ออกจากเครื่อง
try { localStorage.removeItem('pos.products.v1'); } catch { /* ไม่มี localStorage */ }

/** ค่าเริ่มต้นของฟิลด์ที่เพิ่มทีหลัง — ใช้เติมให้ข้อมูลเก่าที่บันทึกไว้ก่อนมีสต็อก */
const PRODUCT_DEFAULTS = { stock: 0, reorder: 3, cost: 0, cat: 'ทั่วไป', image: '', keywords: '' };
const SKU_SEQ_KEY = 'pos.skuSeq.v1';   // เลขรหัสล่าสุดที่เคยออก — ไม่นำรหัสของสินค้าที่ลบแล้วกลับมาใช้ซ้ำ (QR เก่าจะได้ไม่ชี้ไปสินค้าใหม่)

const NO_PHOTO_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>';

/** รูปย่อสินค้า: มีรูปใช้รูป ไม่มีใช้กรอบรูปว่าง */
function thumbHTML(p, cls = 'thumb') {
  return p.image
    ? `<img class="${cls}" src="${p.image}" alt="" />`
    : `<span class="${cls} thumb-empty">${NO_PHOTO_SVG}</span>`;
}

function normalize({ emoji, ...p }) {
  return {
    ...PRODUCT_DEFAULTS,
    ...p,
    price: Number(p.price) || 0,
    stock: Number.isFinite(Number(p.stock)) ? Number(p.stock) : PRODUCT_DEFAULTS.stock,
    reorder: Number.isFinite(Number(p.reorder)) ? Number(p.reorder) : PRODUCT_DEFAULTS.reorder,
  };
}

const Store = {
  /** อ่านรายการสินค้าทั้งหมด */
  all() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      return list.map(normalize);     // เติมฟิลด์ใหม่ให้ข้อมูลเก่าอัตโนมัติ
    } catch {
      return [];   // localStorage ถูกปิด หรือข้อมูลเสีย
    }
  },

  /** บันทึกทั้งหมด — คืน false ถ้าบันทึกไม่ได้ (พื้นที่เต็ม หรือ private mode) */
  saveAll(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  },

  find(sku) {
    return this.all().find((p) => p.sku === sku) || null;
  },

  /** รหัสสินค้าถัดไปแบบอัตโนมัติ เช่น A21 */
  nextSku() {
    const nums = this.all()
      .map((p) => /^A(\d+)$/.exec(p.sku))
      .filter(Boolean)
      .map((m) => Number(m[1]));
    const next = Math.max(0, ...nums, Number(readJSON(SKU_SEQ_KEY, 0)) || 0) + 1;
    return 'A' + String(next).padStart(2, '0');
  },

  /** เพิ่มสินค้าใหม่ — คืน {ok, error} */
  add(p) {
    const list = this.all();
    if (list.some((x) => x.sku === p.sku)) {
      return { ok: false, error: `รหัส ${p.sku} ถูกใช้ไปแล้ว` };
    }
    list.push(normalize(p));
    if (!this.saveAll(list)) return { ok: false, error: 'บันทึกไม่ได้ — พื้นที่เก็บข้อมูลในเครื่องเต็ม ลองลบรูป/สินค้าที่ไม่ใช้' };
    const m = /^A(\d+)$/.exec(p.sku);
    if (m) writeJSON(SKU_SEQ_KEY, Math.max(Number(m[1]), Number(readJSON(SKU_SEQ_KEY, 0)) || 0));
    return { ok: true };
  },

  /** แก้ไขสินค้าเดิม (อ้างด้วยรหัสเดิม) */
  update(originalSku, p) {
    const list = this.all();
    const i = list.findIndex((x) => x.sku === originalSku);
    if (i === -1) return { ok: false, error: 'ไม่พบสินค้านี้' };
    if (p.sku !== originalSku && list.some((x) => x.sku === p.sku)) {
      return { ok: false, error: `รหัส ${p.sku} ถูกใช้ไปแล้ว` };
    }
    list[i] = normalize(p);
    if (!this.saveAll(list)) return { ok: false, error: 'บันทึกไม่ได้ — พื้นที่เก็บข้อมูลในเครื่องเต็ม ลองลบรูป/สินค้าที่ไม่ใช้' };
    return { ok: true };
  },

  remove(sku) {
    this.saveAll(this.all().filter((p) => p.sku !== sku));
  },

  /** บวก/ลบสต็อกของสินค้าชิ้นเดียว (delta ติดลบ = ตัดออก) */
  adjustStock(sku, delta) {
    const list = this.all();
    const p = list.find((x) => x.sku === sku);
    if (!p) return null;
    p.stock += delta;
    this.saveAll(list);
    return p.stock;
  },

  /** ตัดสต็อกหลายรายการพร้อมกัน — ใช้ตอนปิดการขาย
   *  lines = [{ sku, qty }, ...] */
  deductMany(lines) {
    const list = this.all();
    for (const { sku, qty } of lines) {
      const p = list.find((x) => x.sku === sku);
      if (p) p.stock -= qty;
    }
    this.saveAll(list);
  },

  /** สินค้าที่ถึงจุดสั่งซื้อแล้ว เรียงจากขาดหนักสุด */
  lowStock() {
    return this.all()
      .filter((p) => p.stock <= p.reorder)
      .sort((a, b) => a.stock - b.stock);
  },

  categories() {
    return [...new Set(this.all().map((p) => p.cat))];
  },

  /** ลบสินค้าทั้งหมด */
  reset() {
    this.saveAll([]);
  },
};

/* =========================================================================
 * ประวัติการขาย / ตั้งค่ารอบ / รอบสั่งของ
 * ========================================================================= */

const SALES_KEY = 'pos.sales.v2';
const SETTINGS_KEY = 'pos.settings.v1';
const CYCLES_KEY = 'pos.cycles.v2';

// ล้างประวัติขาย/รอบสั่งของชุดเก่า (v1 อ้างรหัสสินค้าตัวอย่างที่ลบไปแล้ว) และเริ่มนับรอบใหม่ — ทำครั้งเดียวต่อเครื่อง
try {
  if (localStorage.getItem('pos.sales.v1') !== null || localStorage.getItem('pos.cycles.v1') !== null) {
    localStorage.removeItem('pos.sales.v1');
    localStorage.removeItem('pos.cycles.v1');
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    delete s.lastReceivedAt;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }
} catch { /* ไม่มี localStorage */ }

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const val = JSON.parse(raw);
    return val ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* บันทึกไม่ได้ (private mode หรือพื้นที่เต็ม) — ใช้งานต่อในหน้านี้ได้ */
  }
}

/** วันที่แบบ YYYY-MM-DD ตามเวลาเครื่อง (ไม่ใช้ UTC เพราะจะเพี้ยนข้ามวัน) */
function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

const DAY_MS = 86400000;

/* ---------- ตั้งค่า ---------- */
const SETTINGS_DEFAULTS = {
  cycleDays: 14,        // รอบสั่งของ (วัน)
  safety: 1.2,          // เผื่อ 20%
  historyDays: 28,      // ใช้ประวัติกี่วันย้อนหลังในการหาค่าเฉลี่ย
  lastReceivedAt: null, // วันที่รับของล่าสุด = จุดเริ่มรอบปัจจุบัน
};

const Settings = {
  get() {
    return { ...SETTINGS_DEFAULTS, ...readJSON(SETTINGS_KEY, {}) };
  },

  set(patch) {
    const next = { ...this.get(), ...patch };
    writeJSON(SETTINGS_KEY, next);
    return next;
  },

  /** วันแรกของรอบปัจจุบัน — ถ้ายังไม่เคยรับของ ให้ถือว่าวันนี้คือวันเริ่ม */
  cycleStart() {
    const s = this.get();
    if (!s.lastReceivedAt) {
      const today = new Date();
      this.set({ lastReceivedAt: today.toISOString() });
      return today;
    }
    return new Date(s.lastReceivedAt);
  },

  /** สถานะรอบ: ผ่านมากี่วัน / เหลืออีกกี่วัน / วันครบรอบ */
  cycleStatus() {
    const s = this.get();
    const start = this.cycleStart();
    const due = new Date(start.getTime() + s.cycleDays * DAY_MS);
    const elapsed = Math.floor((Date.now() - start.getTime()) / DAY_MS);
    const remaining = Math.ceil((due.getTime() - Date.now()) / DAY_MS);
    return { start, due, elapsed, remaining, cycleDays: s.cycleDays };
  },
};

/* ---------- ประวัติการขาย ---------- */
const Sales = {
  all() {
    const list = readJSON(SALES_KEY, []);
    return Array.isArray(list) ? list : [];
  },

  saveAll(list) {
    writeJSON(SALES_KEY, list);
  },

  /** บันทึกบิล 1 ใบ — เก็บชื่อกับราคา ณ เวลาขายไว้ในบิล ไม่อ้างอิงสินค้าปัจจุบัน */
  add({ items, total, method }) {
    const list = this.all();
    const now = new Date();
    const prefix = dayKey(now).replace(/-/g, '');
    const seq = list.filter((b) => b.id.startsWith(prefix)).length + 1;

    const bill = {
      id: `${prefix}-${String(seq).padStart(3, '0')}`,
      soldAt: now.toISOString(),
      method,
      total,
      items: items.map((i) => ({ sku: i.sku, name: i.name, price: i.price, qty: i.qty })),
    };
    list.push(bill);
    this.saveAll(list);
    return bill;
  },

  /** บิลในช่วงวันที่ [from, to] (รับ Date) */
  range(from, to) {
    return this.all().filter((b) => {
      const t = new Date(b.soldAt).getTime();
      return t >= from.getTime() && t <= to.getTime();
    });
  },

  /** บิลใน N วันล่าสุด (นับรวมวันนี้) */
  lastDays(days) {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setTime(from.getTime() - (days - 1) * DAY_MS);
    return this.range(from, new Date());
  },

  /** สรุปยอดของชุดบิล */
  summary(bills) {
    const total = bills.reduce((s, b) => s + b.total, 0);
    const qty = bills.reduce((s, b) => s + b.items.reduce((n, i) => n + i.qty, 0), 0);
    return {
      total,
      qty,
      count: bills.length,
      average: bills.length ? Math.round(total / bills.length) : 0,
    };
  },

  /** ยอดขายรายวัน N วันล่าสุด — คืน [{ key, date, total, count }] เรียงเก่าไปใหม่ */
  byDay(days) {
    const out = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS);
      out.push({ key: dayKey(d), date: d, total: 0, count: 0 });
    }
    const index = new Map(out.map((r) => [r.key, r]));

    for (const b of this.all()) {
      const row = index.get(dayKey(b.soldAt));
      if (row) {
        row.total += b.total;
        row.count += 1;
      }
    }
    return out;
  },

  /** สินค้าขายดีใน N วันล่าสุด — คืน [{ sku, name, qty, total }] */
  topProducts(days, limit = 10) {
    const acc = new Map();
    for (const b of this.lastDays(days)) {
      for (const i of b.items) {
        const cur = acc.get(i.sku) || { sku: i.sku, name: i.name, qty: 0, total: 0 };
        cur.qty += i.qty;
        cur.total += i.price * i.qty;
        acc.set(i.sku, cur);
      }
    }
    return [...acc.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
  },

  /** ลบบิลใบล่าสุด (ใช้ตอนกดขายผิด) — คืนบิลที่ลบไป */
  removeLast() {
    const list = this.all();
    const last = list.pop();
    if (last) this.saveAll(list);
    return last || null;
  },

  clear() {
    this.saveAll([]);
  },
};

/* ---------- คำนวณของที่ต้องสั่ง ---------- */
const Forecast = {
  bills() {
    return Sales.lastDays(Settings.get().historyDays);
  },

  /** จำนวนวันที่มีข้อมูลขายจริง (อย่างมากเท่า historyDays) */
  historySpan() {
    const s = Settings.get();
    const bills = this.bills();
    if (!bills.length) return 0;
    const first = Math.min(...bills.map((b) => new Date(b.soldAt).getTime()));
    const days = Math.ceil((Date.now() - first) / DAY_MS) || 1;
    return Math.min(days, s.historyDays);
  },

  /** ขายเฉลี่ยต่อวันของแต่ละ sku — คืน Map(sku -> number) */
  avgDaily() {
    const span = this.historySpan();
    const acc = new Map();
    if (!span) return acc;

    for (const b of this.bills()) {
      for (const i of b.items) {
        acc.set(i.sku, (acc.get(i.sku) || 0) + i.qty);
      }
    }
    for (const [sku, qty] of acc) acc.set(sku, qty / span);
    return acc;
  },

  /** ใบสั่งของของรอบปัจจุบัน
   *  คืน [{ product, avg, daysLeft, target, suggested, basis }]
   *  basis = 'history' (คำนวณจากยอดขาย) | 'manual' (ใช้จุดสั่งซื้อที่กรอกไว้) */
  suggest() {
    const s = Settings.get();
    const avgMap = this.avgDaily();

    return Store.all().map((p) => {
      const avg = avgMap.get(p.sku) || 0;
      const daysLeft = avg > 0 ? p.stock / avg : Infinity;

      let target, basis;
      if (avg > 0) {
        target = Math.ceil(avg * s.cycleDays * s.safety);
        basis = 'history';
      } else {
        target = p.reorder * 2;          // ยังไม่มีข้อมูลขาย — ใช้จุดสั่งซื้อที่กรอกมือ
        basis = 'manual';
      }

      return {
        product: p,
        avg,
        daysLeft,
        target,
        suggested: Math.max(0, target - p.stock),
        basis,
      };
    });
  },

  /** เฉพาะรายการที่ควรสั่ง เรียงจากของที่จะหมดเร็วที่สุด */
  toOrder() {
    return this.suggest()
      .filter((r) => r.suggested > 0)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  },

  /** ของที่จะหมดก่อนถึงรอบหน้า (ใช้เตือนกลางรอบ) */
  runningOut() {
    const { remaining } = Settings.cycleStatus();
    return this.suggest()
      .filter((r) => r.daysLeft < Math.max(remaining, 0))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  },
};

/* ---------- รอบสั่งของ ---------- */
const Cycles = {
  all() {
    const list = readJSON(CYCLES_KEY, []);
    return Array.isArray(list) ? list : [];
  },

  saveAll(list) {
    writeJSON(CYCLES_KEY, list);
  },

  /** รอบที่เปิดค้างอยู่ (สั่งแล้วแต่ยังไม่รับของ) */
  open() {
    return this.all().find((c) => !c.receivedAt) || null;
  },

  /** เปิดใบสั่งของรอบใหม่ — lines = [{ sku, name, suggested, ordered }] */
  place(lines) {
    const list = this.all();
    const cycle = {
      no: list.length + 1,
      orderedAt: new Date().toISOString(),
      receivedAt: null,
      lines: lines.map((l) => ({ ...l, received: null })),
    };
    list.push(cycle);
    this.saveAll(list);
    return cycle;
  },

  /** ยกเลิกใบสั่งของที่เปิดค้างอยู่ */
  cancelOpen() {
    this.saveAll(this.all().filter((c) => c.receivedAt));
  },

  /** ปิดรอบ: เติมสต็อกตามจำนวนที่รับจริง แล้วเริ่มนับรอบใหม่
   *  received = { sku: qty } */
  receive(received) {
    const list = this.all();
    const cycle = list.find((c) => !c.receivedAt);
    if (!cycle) return null;

    for (const line of cycle.lines) {
      line.received = Number(received[line.sku]) || 0;
      if (line.received > 0) Store.adjustStock(line.sku, line.received);
    }
    cycle.receivedAt = new Date().toISOString();
    this.saveAll(list);
    Settings.set({ lastReceivedAt: cycle.receivedAt });
    return cycle;
  },
};
