/* Impor Excel/CSV/ODS/ZIP langsung di browser (memakai SheetJS + fflate yang disertakan di assets/vendor).
   Semua sheet diproses; jawaban angka/0/benar-salah didukung; header SOAL/JAWABAN boleh terpisah; laporan per sheet. */
(function (root) {
  'use strict';
  const XLSX = root.XLSX || require('xlsx');
  const fflate = root.fflate || require('fflate');
  const MAX_UPLOAD = 50 * 1024 * 1024, MAX_ZIP_TOTAL = 150 * 1024 * 1024;
  const SUPPORTED = /\.(xlsx|xls|xlsm|xlsb|csv|ods)$/i;
  const HEAD_Q = /^(soal|pertanyaan|question|no\.?\s*soal|butir soal)$/i;
  const HEAD_A = /^(jawaban|jawab|answer|kunci|kunci jawaban|jawaban benar)$/i;
  const JUNK = /^(soal|jawaban?|jawab|pertanyaan|question\s*\d*|right answer\s*\d*|answer|quiz|modul|no|nomor|data\.column\d+)$/i;
  const TF = /^(true|false|benar|salah|ya|tidak)$/i;

  function cellText(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    return s === '' ? null : s;
  }
  const isText = (v) => typeof v === 'string' && v.trim() !== '';

  function parseCsv(text) {
    text = text.replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/, 1)[0] || '';
    const delim = [',', ';', '\t', '|'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function sheetRows(ws) {
    const ref = ws['!ref']; if (!ref) return { rows: [], c0: 1, r0: 1 };
    const rg = XLSX.utils.decode_range(ref);
    return { rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }), c0: rg.s.c + 1, r0: rg.s.r + 1 };
  }

  function analyseSheet(name, rows, c0, r0) {
    const rep = { sheet: name, rows: 0, pairs: 0, unpaired: 0, unpairedSample: [], mode: 'kosong' };
    const pairs = [], seen = new Set();
    const get = (r, c) => { const v = rows[r] && rows[r][c - c0]; return v === undefined ? null : v; };
    const note = (r, text) => { rep.unpaired++; if (rep.unpairedSample.length < 25) rep.unpairedSample.push({ baris: r + r0, teks: String(text).slice(0, 90) }); };
    const add = (q, a) => { const k = q + '\u0001' + a; if (!seen.has(k)) { seen.add(k); pairs.push([q, a]); rep.pairs++; } };
    const width = rows.reduce((m, r) => Math.max(m, r ? r.length : 0), 0);
    rep.rows = rows.filter((r) => r && r.some((v) => cellText(v) !== null)).length;
    if (!rep.rows) return { rep, pairs };

    // 1) header SOAL / JAWABAN (boleh terpisah, banyak pasang)
    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const qc = [], ac = [];
      for (let i = 0; i < width; i++) {
        const t = cellText(rows[r] && rows[r][i]); if (!t) continue;
        if (HEAD_Q.test(t)) qc.push(i + c0); else if (HEAD_A.test(t)) ac.push(i + c0);
      }
      if (qc.length && ac.length) {
        const used = new Set(), map = [];
        for (const q of qc) {
          let best = null;
          for (const a of ac) { if (used.has(a)) continue; const d = a > q ? a - q : (q - a) + 0.5; if (!best || d < best.d) best = { a, d }; }
          if (best) { used.add(best.a); map.push([q, best.a]); }
        }
        rep.mode = 'header SOAL/JAWABAN (' + map.length + ' pasang kolom)';
        for (let rr = r + 1; rr < rows.length; rr++) for (const [q, a] of map) {
          const qt = cellText(get(rr, q)), at = cellText(get(rr, a));
          if (qt && at) { if (!JUNK.test(qt)) add(qt, at); }
          else if (qt && !JUNK.test(qt)) note(rr, qt + ' → (jawaban kosong)');
          else if (at && !qt) note(rr, '(soal kosong) → ' + at);
        }
        return { rep, pairs };
      }
    }
    // 2) susunan vertikal (kolom label 'soal'/'jawaban')
    for (let c = c0; c < c0 + width - 1; c++) {
      let nq = 0;
      for (let r = 0; r < rows.length; r++) { const t = cellText(get(r, c)); if (t && /^soal$/i.test(t) && cellText(get(r, c + 1))) nq++; }
      if (nq >= 3) {
        rep.mode = 'vertikal (label soal/jawaban di kolom ' + c + ')';
        let q = null, qr = 0;
        for (let r = 0; r < rows.length; r++) {
          const lab = cellText(get(r, c)), val = cellText(get(r, c + 1));
          if (lab && /^soal$/i.test(lab)) { if (q) note(qr, q + ' → (jawaban kosong)'); q = val; qr = r; }
          else if (lab && /^jawab/i.test(lab)) { if (q && val) add(q, val); else if (q) note(qr, q + ' → (jawaban kosong)'); q = null; }
        }
        if (q) note(qr, q + ' → (jawaban kosong)');
        return { rep, pairs };
      }
    }
    // 3) pasangan kolom bersebelahan, paritas dari isi
    const vote = [0, 0];
    for (let r = 0; r < Math.min(rows.length, 3000); r++) for (let i = 0; i < width; i++) {
      const v = rows[r] && rows[r][i], t = cellText(v); if (!t || JUNK.test(t)) continue;
      const col = i + c0;
      if (typeof v !== 'string' || TF.test(t)) vote[(col + 1) % 2] += 2;
      else if ((t.includes(': ') && t.includes('; ')) || /[?…:]$/.test(t)) vote[col % 2] += 3;
      else if (t.length >= 40) vote[col % 2] += 1;
    }
    const p = vote[1] >= vote[0] ? 1 : 0;
    rep.mode = 'pasangan kolom bersebelahan (soal di kolom ' + (p ? 'ganjil A/C/E…' : 'genap B/D/F…') + ')';
    for (let r = 0; r < rows.length; r++) for (let i = 0; i < width; i++) {
      const col = i + c0; if (col % 2 !== p) continue;
      const qv = rows[r] && rows[r][i], qt = cellText(qv);
      if (!isText(qv) || !qt || JUNK.test(qt)) continue;
      const at = cellText(get(r, col + 1));
      if (at && !JUNK.test(at)) add(qt, at); else if (!at && qt.length >= 12) note(r, qt + ' → (jawaban kosong)');
    }
    return { rep, pairs };
  }

  function importOne(name, bytes) {
    const sheets = [], pairs = [];
    let list;
    if (/\.csv$/i.test(name)) list = [{ name: 'CSV', rows: parseCsv(new TextDecoder().decode(bytes)), c0: 1, r0: 1 }];
    else { const wb = XLSX.read(bytes, { type: 'array', cellDates: true }); list = wb.SheetNames.map((sn) => ({ name: sn, ...sheetRows(wb.Sheets[sn]) })); }
    for (const { name: sn, rows, c0, r0 } of list) {
      const r = analyseSheet(sn, rows, c0, r0); sheets.push(r.rep);
      for (const [q, a] of r.pairs) pairs.push([q, a, name + ' / ' + sn]);
    }
    return { sheets, pairs };
  }

  function importFile(name, bytes) {
    const out = { files: [], pairs: [] };
    const handle = (fname, data) => {
      try { const r = importOne(fname, data); out.files.push({ file: fname, sheets: r.sheets, totalPairs: r.pairs.length }); out.pairs.push(...r.pairs); }
      catch (e) { out.files.push({ file: fname, error: 'Gagal dibaca: ' + (e.message || e), sheets: [], totalPairs: 0 }); }
    };
    if (/\.zip$/i.test(name)) {
      let total = 0, entries;
      try {
        entries = fflate.unzipSync(bytes, { filter: (f) => {
          if (f.name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(f.name) || /\/~\$/.test(f.name) || !SUPPORTED.test(f.name)) return false;
          total += f.originalSize; if (total > MAX_ZIP_TOTAL) throw new Error('Isi ZIP terlalu besar (maks 150 MB setelah diekstrak).'); return true;
        } });
      } catch (e) { throw new Error(/terlalu besar/.test(e.message) ? e.message : 'File ZIP tidak valid atau rusak.'); }
      const names = Object.keys(entries);
      if (!names.length) throw new Error('Tidak ada file XLSX/XLS/XLSM/XLSB/CSV/ODS di dalam ZIP.');
      for (const n of names) handle(n, entries[n]);
    } else if (SUPPORTED.test(name)) handle(name, bytes);
    else throw new Error('Format tidak didukung. Gunakan XLSX, XLS, XLSM, XLSB, CSV, ODS, atau ZIP berisi file tersebut.');
    return out;
  }
  const api = { importFile, cellText, MAX_UPLOAD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CSImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
