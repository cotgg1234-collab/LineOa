/* store.js — คลังข้อมูลสินค้า ใช้ร่วมกันระหว่างหน้าขาย (index.html) และหน้าเพิ่มสินค้า (products.html)
 * เก็บลง localStorage ของเบราว์เซอร์ ครั้งแรกจะโหลดชุดตัวอย่างให้อัตโนมัติ
 */

const STORAGE_KEY = 'pos.products.v1';

const DEFAULT_PRODUCTS = [
  { sku: 'A01', name: 'ข้าวสารหอมมะลิ 5 กก.', price: 189, cat: 'ของแห้ง', emoji: '🍚', keywords: 'khao rice ข้าว' },
  { sku: 'A02', name: 'บะหมี่กึ่งสำเร็จรูป', price: 7, cat: 'ของแห้ง', emoji: '🍜', keywords: 'mama noodle มาม่า' },
  { sku: 'A03', name: 'ไข่ไก่ เบอร์ 2 (10 ฟอง)', price: 62, cat: 'ของสด', emoji: '🥚', keywords: 'egg ไข่' },
  { sku: 'A04', name: 'นมสด 1 ลิตร', price: 58, cat: 'ของสด', emoji: '🥛', keywords: 'milk นม' },
  { sku: 'A05', name: 'น้ำเปล่า 600 มล.', price: 7, cat: 'เครื่องดื่ม', emoji: '💧', keywords: 'water น้ำ' },
  { sku: 'A06', name: 'น้ำอัดลม กระป๋อง', price: 15, cat: 'เครื่องดื่ม', emoji: '🥤', keywords: 'coke soda โค้ก' },
  { sku: 'A07', name: 'กาแฟกระป๋อง', price: 20, cat: 'เครื่องดื่ม', emoji: '☕', keywords: 'coffee กาแฟ' },
  { sku: 'A08', name: 'ขนมปังแผ่น', price: 35, cat: 'เบเกอรี่', emoji: '🍞', keywords: 'bread ขนมปัง' },
  { sku: 'A09', name: 'มันฝรั่งทอดกรอบ', price: 25, cat: 'ขนม', emoji: '🥔', keywords: 'chips เลย์ ขนม' },
  { sku: 'A10', name: 'ช็อกโกแลตแท่ง', price: 30, cat: 'ขนม', emoji: '🍫', keywords: 'chocolate ช็อค' },
  { sku: 'A11', name: 'ไอศกรีมถ้วย', price: 22, cat: 'ขนม', emoji: '🍨', keywords: 'ice cream ไอติม' },
  { sku: 'A12', name: 'กล้วยหอม (หวี)', price: 45, cat: 'ของสด', emoji: '🍌', keywords: 'banana กล้วย' },
  { sku: 'A13', name: 'ไก่ทอด (ชิ้น)', price: 25, cat: 'อาหารพร้อมทาน', emoji: '🍗', keywords: 'chicken ไก่' },
  { sku: 'A14', name: 'ข้าวกล่องพร้อมทาน', price: 49, cat: 'อาหารพร้อมทาน', emoji: '🍱', keywords: 'bento ข้าวกล่อง' },
  { sku: 'A15', name: 'ลูกชิ้นปิ้ง (ไม้)', price: 12, cat: 'อาหารพร้อมทาน', emoji: '🍢', keywords: 'ลูกชิ้น meatball' },
  { sku: 'A16', name: 'สบู่ก้อน', price: 18, cat: 'ของใช้', emoji: '🧼', keywords: 'soap สบู่' },
  { sku: 'A17', name: 'ยาสีฟัน', price: 45, cat: 'ของใช้', emoji: '🪥', keywords: 'toothpaste ยาสีฟัน' },
  { sku: 'A18', name: 'กระดาษทิชชู่', price: 32, cat: 'ของใช้', emoji: '🧻', keywords: 'tissue ทิชชู' },
  { sku: 'A19', name: 'ถ่านไฟฉาย AA (แพ็ค)', price: 55, cat: 'ของใช้', emoji: '🔋', keywords: 'battery ถ่าน' },
  { sku: 'A20', name: 'น้ำมันพืช 1 ลิตร', price: 68, cat: 'ของแห้ง', emoji: '🛢️', keywords: 'oil น้ำมัน' },
];

const Store = {
  /** อ่านรายการสินค้าทั้งหมด */
  all() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.saveAll(DEFAULT_PRODUCTS);
        return [...DEFAULT_PRODUCTS];
      }
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [...DEFAULT_PRODUCTS];
    } catch {
      return [...DEFAULT_PRODUCTS];   // localStorage ถูกปิด หรือข้อมูลเสีย
    }
  },

  saveAll(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* โหมดไม่บันทึก (private mode) — ใช้งานต่อได้ในหน้านี้ */
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
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return 'A' + String(next).padStart(2, '0');
  },

  /** เพิ่มสินค้าใหม่ — คืน {ok, error} */
  add(p) {
    const list = this.all();
    if (list.some((x) => x.sku === p.sku)) {
      return { ok: false, error: `รหัส ${p.sku} ถูกใช้ไปแล้ว` };
    }
    list.push(p);
    this.saveAll(list);
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
    list[i] = p;
    this.saveAll(list);
    return { ok: true };
  },

  remove(sku) {
    this.saveAll(this.all().filter((p) => p.sku !== sku));
  },

  categories() {
    return [...new Set(this.all().map((p) => p.cat))];
  },

  /** คืนค่าชุดตัวอย่างเริ่มต้น (ลบของที่เพิ่มเองทั้งหมด) */
  reset() {
    this.saveAll(DEFAULT_PRODUCTS);
  },
};
