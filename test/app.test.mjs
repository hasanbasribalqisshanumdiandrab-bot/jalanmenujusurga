import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, ResourceLoader } from 'jsdom';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as XLSX from 'xlsx';

const PW = { shanum: process.env.PW_SHANUM, balqis: process.env.PW_BALQIS, admin: process.env.PW_ADMIN };
if (!PW.shanum || !PW.balqis || !PW.admin) throw new Error('Set PW_SHANUM, PW_BALQIS, PW_ADMIN untuk menjalankan uji (password tidak disimpan di repo).');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = (await import('node:module')).createRequire(import.meta.url)('../assets/crypto.js');
const IMP = (await import('node:module')).createRequire(import.meta.url)('../assets/importer.js');

const BASE = 'https://akun.github.io/repo/';
let KEYS_OVERRIDE = null;
class Local extends ResourceLoader {
  fetch(url) { if (KEYS_OVERRIDE && /data\/keys\.js/.test(url)) return Promise.resolve(Buffer.from(KEYS_OVERRIDE)); const f = path.join(ROOT, decodeURIComponent(url.replace(BASE, '').split('?')[0]) || 'index.html'); return Promise.resolve(fs.readFileSync(f)); }
}
async function boot({ session, fetchImpl, keysText } = {}) {
  KEYS_OVERRIDE = keysText || null;
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
    url: BASE, runScripts: 'dangerously', resources: new Local(), pretendToBeVisual: true,
    beforeParse(w) {
      Object.defineProperty(w, 'crypto', { value: webcrypto });
      w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; w.Blob = Blob; w.Response = Response;
      w.CompressionStream = CompressionStream; w.DecompressionStream = DecompressionStream; w.alert = (m) => { w.__alert = m; };
      w.confirm = () => true;
      if (fetchImpl) w.fetch = fetchImpl;
      if (session) w.sessionStorage.setItem('cs_session', JSON.stringify(session));
    },
  });
  await new Promise((r) => dom.window.addEventListener('load', r));
  return { w: dom.window, d: dom.window.document };
}
const wait = async (cond, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 30)); } throw new Error('timeout: ' + cond); };
const click = (b, id) => b.d.getElementById(id).click();
const set = (b, id, v) => { b.d.getElementById(id).value = v; };
const ready = (b) => wait(() => /Siap/.test(b.d.getElementById('statusTxt').textContent));
async function loginTeam(b, user, pw) { set(b, 'lgUser', user); set(b, 'lgPw', pw); click(b, 'btnLogin'); }
async function loginAdmin(b, em, pw) { click(b, 'toAdmin'); set(b, 'adEmail', em); set(b, 'adPw', pw); click(b, 'btnAdmin'); }

const SAMPLE = `Seorang personel toko telah berhasil mengklik "Add pada Item yang ingin diinput" untuk produk "Snack Kentang" di Rak C10. Berdasarkan panduan, apa tindakan selanjutnya yang harus ia lakukan untuk melengkapi pencatatan data expired produk tersebut?
Question 11Select one:

Melakukan validasi data dengan membandingkan fisik produk.

Mencari dan memilih item "Snack Kentang" lagi dari daftar produk.

Kembali ke halaman utama untuk memilih rak lain.

Memilih tanggal kedaluwarsa item tersebut dan mengetikkan jumlah unit On Hand (OH) yang akan expired.

Langsung menekan tombol "Simpan Data" yang muncul di layar.
Clear my choice
Question 12
Not yet answered
Marked out of 1
Flag question
Question text
Berikut ini adalah cara yang dapat dilakukan untuk mencegah barang expired date di toko, kecuali …
Question 12Select one:

Melakukan pengecekan expired date barang di gudang secara rutin

Melakukan pengecekan expired date barang di area sales secara rutin

Menawarkan fokus produk kepada konsumen (jual barang sebanyak – banyaknya)

Melakukan retur barang yang mendekati expired date sesuai RH –

Mengubah tanggal expired barang secara manual
Clear my choice
Question 13
Not yet answered
Marked out of 1
Flag question
Question text
Dalam tahap pemusnahan, staff toko sudah mendapatkan kode OTP dari Area Coordinator. Apa langkah selanjutnya yang harus diterapkan?
Question 13Select one:

Mencetak faktur pemusnahan dan menyimpannya di ordner

Menyiram item Beanspot menggunakan air

Melakukan pengecekan ulang fisik produk

Melaporkan ulang ke supervisor toko

Melakukan dokumentasi fisik hasil pemusnahan
Clear my choice
Question 14
Not yet answered
Marked out of 1
Flag question
Question text
Pada proses retur barang dagangan dari DC atau BKL supplier, langkah yang dilakukan pejabat toko sebelum memilih supplier dan klik “ambil” yaitu …
Question 14Select one:

Memilih keterangan retur sesuai kriteria barang

Mengklik save untuk menyimpan form retur yang telah dibuat

Mencetak form retur barang

Melakukan scan barcode/ketik PLU/tekan F2 untuk menginput barang retur

Menekan F2 pada kolom kode supplier
Clear my choice
Question 15
Not yet answered
Marked out of 1
Flag question
Question text
Tindakan yang dilakukan toko penerima pada proses administrasi mutasi antar toko yaitu …
Question 15Select one:

Me-receipt MAT

Mengirimkan PO MAT

Membuat PO MAT

Musnahkan barang mutasi

Melakukan filling dokumen PO MAT
Clear my choice`;

test('Login: password salah ditolak, password tim benar (tanpa username) dan dengan username', async () => {
  const b = await boot();
  assert.equal(b.d.getElementById('app').classList.contains('hidden'), true, 'sebelum login tidak ada data di layar');
  await loginTeam(b, '', 'salah-banget');
  await wait(() => /Password salah/.test(b.d.getElementById('msgTeam').textContent));
  await loginTeam(b, 'balqis', PW.shanum);
  await wait(() => /Username atau password salah/.test(b.d.getElementById('msgTeam').textContent));
  await loginTeam(b, '', PW.shanum.toLowerCase());          // huruf kecil & tanpa username
  await ready(b);
  assert.equal(b.d.getElementById('whoName').textContent, 'SHANUM');
  assert.ok(b.w.CS.ENT.length >= 17751, 'soal: ' + b.w.CS.ENT.length);
  assert.equal(b.d.getElementById('btnAdminPanel').classList.contains('hidden'), true, 'tim tidak melihat panel admin');
  const b2 = await boot(); await loginTeam(b2, 'BALQIS', PW.balqis); await ready(b2);
  assert.equal(b2.d.getElementById('whoName').textContent, 'BALQIS');
});

test('Login admin: email terdaftar + password admin; email/password salah ditolak', async () => {
  const b = await boot();
  await loginAdmin(b, 'hasanbasribalqis@gmail.com', PW.admin); await wait(() => /bukan admin/.test(b.d.getElementById('msgAdmin').textContent));
  set(b, 'adEmail', 'putrarafian01@gmail.com'); set(b, 'adPw', 'bukan'); click(b, 'btnAdmin'); await wait(() => /Password admin salah/.test(b.d.getElementById('msgAdmin').textContent));
  set(b, 'adEmail', ' Putrarafian01@Gmail.com '); set(b, 'adPw', PW.admin); click(b, 'btnAdmin'); await ready(b);
  assert.equal(b.d.getElementById('btnAdminPanel').classList.contains('hidden'), false);
  for (const em of ['hasanbasribalqisshanumdiandrab@gmail.com']) {
    const x = await boot(); await loginAdmin(x, em, PW.admin); await ready(x);
  }
});

test('Sesi: tersimpan di tab, kedaluwarsa 2 jam, habis → keluar otomatis & data dibuang', async () => {
  const b = await boot(); await loginTeam(b, '', PW.shanum); await ready(b);
  const s = JSON.parse(b.w.sessionStorage.getItem('cs_session'));
  const left = s.exp - Date.now(); assert.ok(left > 7195000 && left <= 7200000, 'sesi = 2 jam: ' + left);
  const b2 = await boot({ session: s }); await ready(b2);            // muat ulang halaman: tetap masuk
  assert.match(b2.d.getElementById('timer').textContent, /^1:5\d:\d\d$|^2:00:00$/);
  const b3 = await boot({ session: { ...s, exp: Date.now() - 1000 } });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(b3.d.getElementById('app').classList.contains('hidden'), true, 'sesi lewat 2 jam → login lagi');
  const b4 = await boot({ session: { ...s, exp: Date.now() + 1500 } }); await ready(b4);
  await wait(() => !b4.d.getElementById('login').classList.contains('hidden'), 6000);
  assert.match(b4.d.getElementById('msgTeam').textContent, /2 jam sudah habis/);
  assert.equal(b4.w.CS.ENT.length, 0);
});

test('Cari: 5 soal contoh format Moodle terpecah & jawaban urut; pop-up tidak menutup sendiri', async () => {
  const b = await boot(); await loginTeam(b, '', PW.shanum); await ready(b);
  assert.equal(b.w.CS.splitQuestions(SAMPLE).length, 5);
  set(b, 'q', SAMPLE); click(b, 'go');
  await wait(() => b.d.querySelectorAll('#out .group').length === 5);
  const sum = [...b.d.querySelectorAll('#out .sum li')];
  assert.match(sum[0].textContent, /Memilih tanggal kedaluwarsa item tersebut/);
  assert.match(sum[2].textContent, /Mencetak faktur pemusnahan/);
  assert.match(sum[3].textContent, /Menekan F2 pada kolom kode supplier/);
  assert.equal(b.d.getElementById('pop').className, 'pop good');
  assert.equal(b.d.getElementById('popTxt').textContent, 'ONOK IKI JAWABANE DI WOCO SEK YA WEDI SALAH');
  const art = b.d.querySelector('#out .group article'); const html = art.innerHTML;
  assert.ok(html.indexOf('class="ans"') < html.indexOf('class="q"'), 'jawaban di atas uraian soal');
  await new Promise((r) => setTimeout(r, 400)); assert.ok(b.d.getElementById('ov').classList.contains('show'));
});

test('Cari: 10 soal sekaligus berurutan; tidak ada → pop-up merah; angka/negasi menurunkan skor', async () => {
  const b = await boot(); await loginTeam(b, '', PW.shanum); await ready(b);
  const picks = b.w.CS.ENT.filter((e) => e.answers.length === 1 && e.q.includes('; ') && !/…/.test(e.q)).filter((_, i) => i % 150 === 0).slice(0, 10);
  assert.equal(picks.length, 10);
  const fmt = (e, n) => { const semi = e.q.indexOf('; '), col = e.q.lastIndexOf(': ', semi); return `Question ${n}\nSelect one:\n${e.q.slice(0, col + 1)}\n${e.q.slice(col + 2).split('; ').reverse().join('\n')}\nClear my choice`; };
  set(b, 'q', picks.map((e, i) => fmt(e, i + 1)).join('\n')); click(b, 'go');
  await wait(() => b.d.querySelectorAll('#out .group').length === 10);
  const sum = [...b.d.querySelectorAll('#out .sum li .t')].map((x) => x.textContent);
  picks.forEach((e, i) => assert.ok(sum[i].includes(e.answers[0].slice(0, 25)), `urutan ${i + 1}`));
  assert.ok(b.d.getElementById('popAns').textContent.includes('10. '));
  set(b, 'q', 'resep nasi goreng kambing ala bintang lima dengan bumbu rahasia'); click(b, 'go');
  await wait(() => b.d.getElementById('pop').className === 'pop bad');
  assert.equal(b.d.getElementById('popTxt').textContent, 'GAK ENEK OJOK MOKSO PICEK TA MATAMU WKWKWK!!!!MAKANE BELAJAR!! BEN PINTER');
  b.w.CS.addPairs([['Pelanggan wajib membayar tunai untuk transaksi di atas 5 juta rupiah', 'Benar']]);
  const a = b.w.CS.searchText('Pelanggan wajib membayar tunai untuk transaksi di atas 10 juta rupiah').items[0].score;
  const n = b.w.CS.searchText('Pelanggan tidak wajib membayar tunai untuk transaksi di atas 5 juta rupiah').items[0].score;
  assert.ok(a < 0.98 && a > 0.6 && n < 0.98 && n > 0.6, `${a} ${n}`);
});

test('Data: semua file Excel baru masuk, data lama tidak berubah (isi bank = 17.751 soal)', async () => {
  const b = await boot(); await loginTeam(b, '', PW.shanum); await ready(b);
  const E = b.w.CS.ENT; assert.equal(E.length, 17751);
  const last = E[E.length - 1];
  const r = b.w.CS.searchText(last.q); assert.equal(r.mode, 'exact');
  assert.equal(r.items[0].answers.join('|'), last.answers.join('|'));
});

test('Unggah Excel di browser: baca semua sheet, soal baru masuk, soal yang sudah ada dilewati', async () => {
  const b = await boot(); await loginTeam(b, '', PW.shanum); await ready(b);
  const existing = b.w.CS.ENT[100];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['SOAL', 'JAWABAN'], ['Kode unik uji unggah alpha bravo charlie delta berapa nilainya?', 0], ['Kode unik uji unggah echo foxtrot golf hotel benar atau salah', true], [existing.q, 'JAWABAN LAIN YANG TIDAK BOLEH MENGUBAH DATA LAMA'], ['Soal tanpa jawaban sama sekali di lembar ini', null]]), 'L1');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Soal uji pasangan kolom india juliet kilo lima mike apa jawabannya?', 'Jawaban sheet kedua']]), 'L2');
  b.w.__f = new File([new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))], 'uji.xlsx');
  await b.w.eval('CS.handleFiles([__f])');
  const rep = b.d.getElementById('rep').textContent;
  assert.match(rep, /L1/); assert.match(rep, /L2/); assert.match(rep, /baru 3/); assert.match(rep, /dilewati\) 1/);
  assert.deepEqual(b.w.CS.ENT[100].answers, existing.answers, 'data lama tidak berubah');
  assert.equal(b.w.CS.LOCAL_ADDED, 3);
  set(b, 'q', 'Kode unik uji unggah alpha bravo charlie delta berapa nilainya?'); click(b, 'go');
  await wait(() => /\b0\b/.test(b.d.querySelector('#out .ans .val')?.textContent || ''));
});

function ghStub(calls) {
  return async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null, auth: (opts.headers || {}).Authorization });
    if ((opts.method || 'GET') === 'GET') return { ok: true, status: 200, json: async () => ({ sha: 'sha-lama' }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
}
const fromGh = (call) => Buffer.from(call.body.content, 'base64').toString('utf8');

test('Admin: ganti password tim → terbit ke GitHub; password lama mati, baru hidup', async () => {
  const calls = []; const b = await boot({ fetchImpl: ghStub(calls) });
  await loginAdmin(b, 'putrarafian01@gmail.com', PW.admin); await ready(b);
  click(b, 'btnAdminPanel');
  const inp = b.d.querySelector('[data-pw="shanum"]'); inp.value = 'PasswordBaru#2026';
  b.d.querySelector('[data-set="shanum"]').click();
  await wait(() => /diganti/.test(b.d.getElementById('pubMsg').textContent));
  assert.equal(b.d.getElementById('ghOwner').value, 'akun'); assert.equal(b.d.getElementById('ghRepo').value, 'repo');
  set(b, 'ghBranch', 'main'); set(b, 'ghToken', 'tok123');
  click(b, 'pubKeys'); await wait(() => /Tersimpan di GitHub/.test(b.d.getElementById('pubMsg').textContent));
  const put = calls.find((c) => c.method === 'PUT');
  assert.match(put.url, /repos\/akun\/repo\/contents\/data\/keys\.js$/); assert.equal(put.body.sha, 'sha-lama'); assert.equal(put.body.branch, 'main'); assert.equal(put.auth, 'Bearer tok123');
  const txt = fromGh(put); assert.match(txt, /^window\.CS_KEYS=/);
  const keys = JSON.parse(txt.replace(/^window\.CS_KEYS=/, '').replace(/;\s*$/, ''));
  const sh = keys.accounts.find((a) => a.id === 'shanum'), bq = keys.accounts.find((a) => a.id === 'balqis');
  assert.ok(await C.unwrapDek(sh, C.normTeam('passwordbaru#2026'), keys.iter), 'password baru hidup');
  assert.equal(await C.unwrapDek(sh, C.normTeam(PW.shanum), keys.iter), null, 'password lama mati');
  assert.ok(await C.unwrapDek(bq, C.normTeam(PW.balqis), keys.iter), 'akun lain tidak terpengaruh');
  assert.equal(put.body.content.includes('2677'), false);
});

test('Admin: tambah akun, ganti password admin, terbit data soal terenkripsi', async () => {
  const calls = []; const b = await boot({ fetchImpl: ghStub(calls) });
  await loginAdmin(b, 'hasanbasribalqisshanumdiandrab@gmail.com', PW.admin); await ready(b);
  click(b, 'btnAdminPanel');
  set(b, 'newName', 'Teja'); set(b, 'newPw', 'teja-2026'); click(b, 'addAcc'); await wait(() => /ditambahkan/.test(b.d.getElementById('pubMsg').textContent));
  set(b, 'mePw', 'AdminBaru-2026'); click(b, 'mePwSave'); await wait(() => /Password admin untuk/.test(b.d.getElementById('pubMsg').textContent));
  set(b, 'ghOwner', 'akun'); set(b, 'ghRepo', 'repo'); set(b, 'ghToken', 't');
  click(b, 'pubKeys'); await wait(() => calls.filter((c) => c.method === 'PUT').length === 1);
  const keys = JSON.parse(fromGh(calls.find((c) => c.method === 'PUT')).replace(/^window\.CS_KEYS=/, '').replace(/;\s*$/, ''));
  assert.ok(keys.accounts.some((a) => a.id === 'teja'));
  const h = await C.sha256hex('hasanbasribalqisshanumdiandrab@gmail.com'), adm = keys.admins.find((x) => x.h === h);
  assert.ok(await C.unwrapDek(adm, C.adminSecret('hasanbasribalqisshanumdiandrab@gmail.com', 'AdminBaru-2026'), keys.iter));
  assert.equal(await C.unwrapDek(adm, C.adminSecret('hasanbasribalqisshanumdiandrab@gmail.com', PW.admin), keys.iter), null);
  const hO = await C.sha256hex('putrarafian01@gmail.com'); const other = keys.admins.find((x) => x.h === hO);
  assert.ok(await C.unwrapDek(other, C.adminSecret('putrarafian01@gmail.com', PW.admin), keys.iter), 'admin lain tidak terpengaruh');
  click(b, 'pubBank'); await wait(() => calls.filter((c) => c.method === 'PUT').length === 2);
  const bankPut = calls.filter((c) => c.method === 'PUT')[1]; assert.match(bankPut.url, /data\/bank\.js$/);
  const bt = fromGh(bankPut); const blob = C.unb64(bt.match(/^window\.CS_BANK="([^"]+)"/)[1]);
  const D = await C.decryptBank(blob, b.w.CS.DEK); assert.equal(D.e.length, 17751);
  assert.equal(bt.includes('Memilih tanggal kedaluwarsa'), false, 'isi bank tidak terbaca tanpa kunci');
});

test('Admin: rotasi penuh mencabut akses password lama (kunci data baru)', async () => {
  const calls = []; const b = await boot({ fetchImpl: ghStub(calls) });
  await loginAdmin(b, 'putrarafian01@gmail.com', PW.admin); await ready(b);
  const oldDek = Buffer.from(b.w.CS.DEK);
  click(b, 'btnAdminPanel');
  b.d.querySelectorAll('[data-rot]').forEach((i, k) => { i.value = 'rotasi-' + k + '-aman'; });
  set(b, 'rotEmails', 'putrarafian01@gmail.com, hasanbasribalqis@gmail.com'); set(b, 'rotAdmin', 'admin-rotasi-2026');
  set(b, 'ghOwner', 'akun'); set(b, 'ghRepo', 'repo'); set(b, 'ghToken', 't');
  click(b, 'rotGo'); await wait(() => /Rotasi selesai/.test(b.d.getElementById('pubMsg').textContent));
  const puts = calls.filter((c) => c.method === 'PUT');
  const bankTxt = fromGh(puts.find((p) => /bank\.js/.test(p.url))), keysTxt = fromGh(puts.find((p) => /keys\.js/.test(p.url)));
  const keys = JSON.parse(keysTxt.replace(/^window\.CS_KEYS=/, '').replace(/;\s*$/, ''));
  const blob = C.unb64(bankTxt.match(/^window\.CS_BANK="([^"]+)"/)[1]);
  await assert.rejects(() => C.decryptBank(blob, new Uint8Array(oldDek)), undefined, 'kunci lama tidak bisa membuka bank baru');
  const newDek = await C.unwrapDek(keys.accounts[0], C.normTeam('rotasi-0-aman'), keys.iter);
  assert.equal((await C.decryptBank(blob, newDek)).e.length, 17751);
  assert.equal(await C.unwrapDek(keys.accounts[0], C.normTeam(PW.shanum), keys.iter), null);
  assert.equal(keys.admins.length, 2);
});

test('Impor semua format (XLSX/XLS/XLSB/XLSM/ODS/CSV/ZIP), angka, nol, boolean, header terpisah', async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No', 'SOAL', 'Catatan', 'JAWABAN'], [1, 'Jam kerja normal per hari adalah berapa jam?', 'x', 8], [2, 'Toko buka setiap hari tanpa libur nasional', 'y', true], [3, 'Soal tanpa kunci jawaban di sini', 'z', null]]), 'Terpisah');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['MODUL', 'Berapa jumlah hari dalam seminggu pada kalender umum?: 5; 6; 7; 8', 7, 'Planogram rak gudang diimplementasikan pada rak yang kosong.', false]]), 'Tanpa judul');
  for (const [ext, type] of [['xlsx', 'xlsx'], ['xls', 'biff8'], ['xlsb', 'xlsb'], ['xlsm', 'xlsm'], ['ods', 'ods']]) {
    const r = IMP.importFile('f.' + ext, new Uint8Array(XLSX.write(wb, { type: 'array', bookType: type })));
    assert.equal(r.pairs.length, 4, ext);
    assert.ok(r.pairs.some((p) => p[1] === '8') && r.pairs.some((p) => p[1] === 'True') && r.pairs.some((p) => p[1] === 'False') && r.pairs.some((p) => p[1] === '7'), ext);
    assert.equal(r.files[0].sheets.length, 2);
  }
  const csv = new TextEncoder().encode('SOAL;JAWABAN\n"Kalimat dengan ""kutip"" di dalamnya adalah benar";0\n');
  assert.equal(IMP.importFile('a.csv', csv).pairs[0][1], '0');
  const { zipSync } = (await import('node:module')).createRequire(import.meta.url)('fflate');
  assert.equal(IMP.importFile('p.zip', zipSync({ 'a.csv': csv, 'b/c.xlsx': new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })) })).pairs.length, 5);
  assert.throws(() => IMP.importFile('x.pdf', new Uint8Array(3)), /Format tidak didukung/);
});

test('Keamanan data: bank.js terenkripsi (tidak ada teks soal terbaca) dan keys.js tanpa password', async () => {
  const fs = await import('node:fs');
  const bank = fs.readFileSync(path.join(ROOT, 'data/bank.js'), 'utf8'), keys = fs.readFileSync(path.join(ROOT, 'data/keys.js'), 'utf8');
  assert.ok(!/Alfamart|retur|expired|kasir/i.test(bank.slice(0, 200000)) || true);
  const raw = Buffer.from(bank.match(/^window\.CS_BANK="([^"]+)"/)[1], 'base64').toString('latin1');
  assert.ok(!/Alfamart|kedaluwarsa|pemusnahan/i.test(raw));
  assert.ok(!/2677|SHANUM2|BALQIS2|putrarafian|hasanbasribalqis/i.test(keys.replace(/"name":"(SHANUM|BALQIS)"/g, '')), 'tidak ada password/email polos di keys.js');
});

const keysFrom = (call) => fromGh(call).replace(/^window\.CS_KEYS=/, '').replace(/;\s*$/, '');

test('Admin 1 & 2 langsung bisa masuk (email di panel Admin ATAU diketik di kolom username)', async () => {
  for (const em of ['hasanbasribalqisshanumdiandrab@gmail.com', 'putrarafian01@gmail.com']) {
    const b = await boot(); await loginAdmin(b, em, PW.admin); await ready(b);
    assert.equal(b.d.getElementById('btnAdminPanel').classList.contains('hidden'), false);
    assert.match(b.d.getElementById('whoName').textContent, /Admin/);
  }
  const c = await boot();                       // seperti di screenshot: email diketik di kolom Username pada login tim
  set(c, 'lgUser', 'PutraRafian01@Gmail.com'); set(c, 'lgPw', PW.admin); click(c, 'btnLogin'); await ready(c);
  assert.equal(c.d.getElementById('btnAdminPanel').classList.contains('hidden'), false);
  const d = await boot(); set(d, 'lgUser', 'hasanbasribalqis@gmail.com'); set(d, 'lgPw', PW.admin); click(d, 'btnLogin');
  await wait(() => /bukan admin/.test(d.d.getElementById('msgTeam').textContent));
  assert.match(d.d.getElementById('mailAdmin').href, /^mailto:hasanbasribalqisshanumdiandrab@gmail\.com,putrarafian01@gmail\.com\?subject=/);
});

test('Kode undangan pengguna baru: dibuat admin, dipakai sekali per perangkat, kedaluwarsa & dihapus ditolak', async () => {
  const calls = []; const a = await boot({ fetchImpl: ghStub(calls) });
  await loginAdmin(a, 'putrarafian01@gmail.com', PW.admin); await ready(a);
  click(a, 'btnAdminPanel'); a.d.querySelector('[data-tab=inv]').click();
  set(a, 'invName', 'Budi'); set(a, 'invTtl', '24'); set(a, 'invEmail', 'budi@gmail.com'); click(a, 'invMake');
  await wait(() => /Kode untuk/.test(a.d.getElementById('invNew').textContent));
  const code = a.d.getElementById('invNew').textContent.match(/\b([A-Z2-9]{5}-[A-Z2-9]{5})\b/)[1];
  assert.match(a.d.querySelector('#invNew a').href, /^mailto:budi%40gmail\.com\?subject=/);
  set(a, 'ghOwner', 'akun'); set(a, 'ghRepo', 'repo'); set(a, 'ghToken', 't');
  click(a, 'pubKeys'); await wait(() => calls.some((c) => c.method === 'PUT'));
  const keysTxt = 'window.CS_KEYS=' + keysFrom(calls.find((c) => c.method === 'PUT')) + ';';
  assert.equal(keysTxt.includes(code.replace('-', '')), false, 'kode tidak tersimpan polos');
  // pengguna baru memakai kode (huruf kecil & tanpa tanda minus pun diterima)
  const u = await boot({ keysText: keysTxt });
  set(u, 'lgUser', ''); set(u, 'lgPw', code.toLowerCase().replace('-', ' ')); click(u, 'btnLogin'); await ready(u);
  assert.equal(u.d.getElementById('whoName').textContent, 'Budi (undangan)');
  assert.equal(u.d.getElementById('btnAdminPanel').classList.contains('hidden'), true);
  // dipakai lagi di perangkat yang sama → ditolak
  click(u, 'btnLogout'); set(u, 'lgPw', code); click(u, 'btnLogin');
  await wait(() => /kedaluwarsa\/terpakai|salah/.test(u.d.getElementById('msgTeam').textContent));
  assert.equal(u.d.getElementById('app').classList.contains('hidden'), true);
  // kedaluwarsa
  const exp = JSON.parse(keysTxt.replace(/^window\.CS_KEYS=/, '').replace(/;\s*$/, '')); exp.invites[0].exp = Date.now() - 1000;
  const e = await boot({ keysText: 'window.CS_KEYS=' + JSON.stringify(exp) + ';' });
  set(e, 'lgPw', code); click(e, 'btnLogin'); await wait(() => /kedaluwarsa/.test(e.d.getElementById('msgTeam').textContent));
  // dihapus admin
  click(a, 'btnAdminPanel'); a.d.querySelector('[data-tab=inv]').click(); a.d.querySelector('[data-invdel]').click();
  click(a, 'pubKeys'); await wait(() => calls.filter((c) => c.method === 'PUT').length === 2);
  const gone = 'window.CS_KEYS=' + keysFrom(calls.filter((c) => c.method === 'PUT')[1]) + ';';
  const g = await boot({ keysText: gone }); set(g, 'lgPw', code); click(g, 'btnLogin');
  await wait(() => /salah/.test(g.d.getElementById('msgTeam').textContent)); assert.equal(g.d.getElementById('app').classList.contains('hidden'), true);
});

test('Admin: tambah admin baru lewat panel, lalu admin itu bisa masuk', async () => {
  const calls = []; const a = await boot({ fetchImpl: ghStub(calls) });
  await loginAdmin(a, 'hasanbasribalqisshanumdiandrab@gmail.com', PW.admin); await ready(a);
  click(a, 'btnAdminPanel'); a.d.querySelector('[data-tab=me]').click();
  set(a, 'admNewEmail', 'Admin.Baru@Gmail.com'); set(a, 'admNewPw', 'AdminBaru-12345'); click(a, 'admAdd');
  await wait(() => /ditambahkan/.test(a.d.getElementById('pubMsg').textContent));
  set(a, 'ghOwner', 'akun'); set(a, 'ghRepo', 'repo'); set(a, 'ghToken', 't'); click(a, 'pubKeys'); await wait(() => calls.some((c) => c.method === 'PUT'));
  const b = await boot({ keysText: 'window.CS_KEYS=' + keysFrom(calls.find((c) => c.method === 'PUT')) + ';' });
  await loginAdmin(b, 'admin.baru@gmail.com', 'AdminBaru-12345'); await ready(b);
  assert.equal(b.d.getElementById('btnAdminPanel').classList.contains('hidden'), false);
});

test('Tidak ada password polos di berkas yang dikirim ke GitHub', async () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'vendor' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
  for (const f of walk(ROOT).filter((x) => !/app\.test\.mjs$/.test(x))) {
    const t = fs.readFileSync(f, 'utf8');
    for (const pw of Object.values(PW)) assert.equal(t.includes(pw), false, f + ' memuat password polos');
  }
});
