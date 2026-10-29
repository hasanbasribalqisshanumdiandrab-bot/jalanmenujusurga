/* Pusat Perangkat — Cari Jawaban Soal.
   Pasang: script.google.com → Proyek baru → tempel file ini → ganti ADMIN_KEY →
   Deploy → Web app → Execute as: Me, Who has access: Anyone → salin alamat /exec ke Panel Admin → tab Perangkat. */
const ADMIN_KEY = 'GANTI-DENGAN-KUNCI-RAHASIA-PANJANG';   // wajib diganti, min. 8 karakter
const MAX_DEVICES = 300;

function doGet(e) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { return out(handle((e && e.parameter) || {})); }
  catch (err) { return out({ ok: false, err: String(err) }); }
  finally { lock.releaseLock(); }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
const clean = (v, n) => String(v || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, n);
const P = () => PropertiesService.getScriptProperties();
function get(id) { const v = P().getProperty('d_' + id); return v ? JSON.parse(v) : null; }
function put(r) { P().setProperty('d_' + r.id, JSON.stringify(r)); }

function handle(p) {
  const a = p.a, id = clean(p.id, 12).toUpperCase();
  const idOk = /^[A-Z0-9]{6,12}$/.test(id), now = Date.now();
  if (a === 'chk') { const r = idOk && get(id); return { ok: true, blocked: !!(r && r.b) }; }
  if (a === 'ping') {
    if (!idOk) return { ok: false, err: 'id' };
    const r = get(id) || { id: id, f: now, b: 0 };
    r.n = clean(p.n, 40); r.l = clean(p.l, 60); r.t = now; r.x = Number(p.x) || 0; r.o = 0;
    put(r); trim();
    return { ok: true, blocked: !!r.b };
  }
  if (a === 'bye') { const r = idOk && get(id); if (r) { r.o = 1; r.t = now; put(r); } return { ok: true }; }
  // ---- di bawah ini khusus admin ----
  if (p.k !== ADMIN_KEY || ADMIN_KEY.length < 8) return { ok: false, err: 'key' };
  if (a === 'list') { const all = P().getProperties(), list = []; for (const k in all) if (k.indexOf('d_') === 0) list.push(JSON.parse(all[k])); return { ok: true, list: list }; }
  if (!idOk) return { ok: false, err: 'id' };
  if (a === 'block' || a === 'unblock') { const r = get(id) || { id: id, f: now, t: now, x: 0, o: 0 }; r.b = a === 'block' ? 1 : 0; put(r); return { ok: true }; }
  if (a === 'del') { P().deleteProperty('d_' + id); return { ok: true }; }
  return { ok: false, err: 'a' };
}
function trim() {
  const all = P().getProperties(), rows = [];
  for (const k in all) if (k.indexOf('d_') === 0) rows.push(JSON.parse(all[k]));
  if (rows.length <= MAX_DEVICES) return;
  rows.filter(function (r) { return !r.b; }).sort(function (a, b) { return a.t - b.t; }).slice(0, rows.length - MAX_DEVICES).forEach(function (r) { P().deleteProperty('d_' + r.id); });
}
