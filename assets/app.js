/* Cari Jawaban Soal — aplikasi statis untuk GitHub Pages (tanpa server). */
(function () {
  'use strict';
  const C = window.CSCrypto, IMP = window.CSImport;
  const $ = (id) => document.getElementById(id);
  const show = (el, on) => el.classList.toggle('hidden', !on);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ====================== KONFIGURASI ====================== */
  const MIN_SCORE = 0.70, SHOW_FIRST = 8, MAX_PARTS = 50, SESSION_MS = 2 * 60 * 60 * 1000;
  const MSG_OK = 'ONOK IKI JAWABANE DI WOCO SEK YA WEDI SALAH';
  const MSG_BAD = 'GAK ENEK OJOK MOKSO PICEK TA MATAMU WKWKWK!!!!MAKANE BELAJAR!! BEN PINTER';
  const NEGATION = new Set(['tidak', 'bukan', 'kecuali', 'tanpa', 'jangan', 'belum', 'salah', 'not', 'no']);
  const ADMIN_CONTACT = ['hasanbasribalqisshanumdiandrab@gmail.com', 'putrarafian01@gmail.com'];
  const AI_DEFAULT = { gemini: 'gemini-2.5-flash', claude: 'claude-haiku-5-5' };

  /* ====================== PENYIMPANAN BROWSER (aman bila diblokir) ====================== */
  const mk = (kind) => ({
    get(k) { try { return window[kind].getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window[kind].setItem(k, v); } catch (e) { /* diblokir */ } },
    del(k) { try { window[kind].removeItem(k); } catch (e) { /* diblokir */ } },
  });
  const ls = mk('localStorage'), ss = mk('sessionStorage');

  /* ====================== STATE ====================== */
  let KEYS = null, DEK = null, SESS = null;
  let META = null, ENT = [], exactMap = new Map(), LOCAL_ADDED = 0;
  let tickT = null, LAST = null;
  let tokenOk = null, PEND = null, TSETUP = null, TMSETUP = null, AI_SHARED = null;
  let pingT = null, tmT = null, devT = null, tFails = 0, tLock = 0, DEVS = [];
  let LIVE = null, adminDirty = false, liveAt = 0, watchT = null, gateUntil = 0, gateFails = 0, gateLock = 0;
  
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const tokenize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const sortedKey = (t) => [...t].sort().join(' ');
  const normA = (s) => tokenize(s).join(' ');

  /* ====================== PENYIMPANAN LOKAL (tambahan Excel di perangkat ini) ====================== */
  function idb() {
    return new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
      const r = indexedDB.open('cari-soal-github', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idbGet() { try { const d = await idb(); return await new Promise((res) => { const q = d.transaction('kv').objectStore('kv').get('user'); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); } catch (e) { return []; } }
  async function idbSet(v) { try { const d = await idb(); await new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, 'user'); t.oncomplete = res; t.onerror = () => rej(t.error); }); return true; } catch (e) { return false; } }

  /* ====================== BANK SOAL ====================== */
  function indexBank(entries) {
    ENT = []; exactMap = new Map();
    for (const e of entries) {
      const tk = tokenize(e[0]); const x = { id: ENT.length, q: e[0], answers: e.slice(1), tk, key: sortedKey(tk) };
      ENT.push(x); const l = exactMap.get(x.key); if (l) l.push(x); else exactMap.set(x.key, [x]);
    }
  }
  /** Tambah pasangan baru. Soal yang SUDAH ADA dilewati (isi data lama tidak diubah). */
  function addPairs(pairs) {
    let added = 0, skipped = 0; const fresh = [];
    for (const [q0, a0] of pairs) {
      const q = String(q0).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(), a = String(a0).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      if (!q || !a || /^soal$/i.test(q) || /^jawaban$/i.test(a)) continue;
      if (/^question\s*\d+$/i.test(q) || /^right answer\s*\d+$/i.test(a)) continue;
      const tk = tokenize(q); if (tk.length < 2) continue;
      const key = sortedKey(tk), ex = exactMap.get(key);
      if (ex) {
        if (ex[0].fromUpload && !ex[0].answers.some((x) => normA(x) === normA(a))) ex[0].answers.push(a);   // jawaban lain dari unggahan yang sama
        else skipped++;
      } else {
        const e = { id: ENT.length, q, answers: [a], tk, key, fromUpload: true };
        ENT.push(e); exactMap.set(key, [e]); added++; fresh.push([q, a]);
      }
    }
    return { added, skipped, fresh };
  }
  function updateCounts() {
    $('statusTxt').textContent = 'Siap · ' + ENT.length.toLocaleString('id-ID') + ' soal';
    $('srcN').textContent = ENT.length.toLocaleString('id-ID');
    $('srcLocal').textContent = LOCAL_ADDED.toLocaleString('id-ID');
    if (META) { $('srcName').textContent = META.source; $('srcDate').textContent = META.built; }
  }
  async function loadBank() {
    show($('prog'), true); $('progBar').style.width = '15%';
    $('status').className = 'chip'; $('statusTxt').textContent = 'Membuka bank soal…';
    if (!window.CS_BANK) throw new Error('File data/bank.js tidak ditemukan di hosting.');
    await new Promise((r) => setTimeout(r, 20));
    $('progBar').style.width = '40%';
    const D = await C.decryptBank(C.unb64(window.CS_BANK), DEK);
    $('progBar').style.width = '80%';
    META = D.meta; indexBank(D.e);
    const st = await idbGet(); LOCAL_ADDED = 0;
    if (st.length) LOCAL_ADDED = addPairs(st).added;
    $('progBar').style.width = '100%'; setTimeout(() => show($('prog'), false), 300);
    $('status').className = 'chip ready'; updateCounts();
  }

  /* ====================== PEMBERSIH & PEMECAH SOAL ====================== */
  function cleanQuery(t) {
    t = t.replace(/\r/g, '').replace(/\u00a0/g, ' ');
    t = t.replace(/(the\s+correct\s+answers?\s+(is|are)|jawaban\s+(yang\s+)?(benar|tepat)\s+(adalah|ialah)|right\s+answers?\s*:|correct\s+answer\s*:|kunci\s+jawaban)[\s\S]*$/i, ' ');
    t = t.replace(/clear my choice|hapus pilihan saya/gi, ' ');
    t = t.replace(/(^|\n)[ \t]*question text[ \t]*(?=\n|$)/gi, '\n');
    t = t.replace(/(^|\s)(question|pertanyaan)\s*\d+/gi, ' ');
    t = t.replace(/not yet answered|belum dijawab|answer saved|marked out of\s*[\d.,]+|points? out of\s*[\d.,]+|flag question|remove flag|tandai pertanyaan|nilai maksimal\s*[\d.,]+/gi, ' ');
    t = t.replace(/select one( or more)?\s*:?|pilih satu( atau lebih)?\s*:?|pilih salah satu\s*:?/gi, ' ');
    t = t.replace(/(^|\n)\s*[a-eA-E][\.\)]\s+/g, '\n');
    return t;
  }
  function splitQuestions(raw) {
    const t = raw.replace(/\r/g, '').replace(/\u00a0/g, ' ');
    const seg = t.split(/clear my choice|hapus pilihan saya/i).map((x) => x.trim()).filter((x) => x.length >= 10);
    if (seg.length >= 2) return seg.slice(0, MAX_PARTS);
    const re = /(?:^|\n)[ \t]*(?:question|pertanyaan|soal)[ \t]*(\d+)/gi, marks = []; let m, last = null;
    while ((m = re.exec(t))) { if (m[1] !== last) { marks.push(m.index); last = m[1]; } }
    if (marks.length >= 2) {
      if (marks[0] > 25 && /^\s*(question|pertanyaan|soal)\s*\d+\s*select one/i.test(t.slice(marks[0]))) marks[0] = 0;
      return marks.map((s, i) => t.slice(s, marks[i + 1] ?? t.length).trim()).filter((x) => x.length > 5).slice(0, MAX_PARTS);
    }
    const lines = t.split('\n'), starts = []; let expect = 1;
    lines.forEach((ln, i) => { const mm = ln.match(/^\s*(\d{1,3})\s*[\.\)]\s+\S/); if (mm && +mm[1] === expect && ln.trim().length >= 25) { starts.push(i); expect++; } });
    if (starts.length >= 2) return starts.map((s, i) => lines.slice(s, starts[i + 1] ?? lines.length).join('\n').trim()).slice(0, MAX_PARTS);
    const blocks = t.split(/\n\s*\n+/).map((x) => x.trim()).filter(Boolean);
    if (blocks.length >= 2 && blocks.filter((b) => b.length >= 25).length >= 2) return blocks.slice(0, MAX_PARTS);
    return [t.trim()];
  }

  /* ====================== PENCARIAN ====================== */
  function features(toks) {
    const nums = new Map(), neg = new Map();
    for (const t of toks) { if (/^\d+$/.test(t)) nums.set(t, (nums.get(t) || 0) + 1); if (NEGATION.has(t)) neg.set(t, (neg.get(t) || 0) + 1); }
    return { nums, neg };
  }
  const sameMap = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
  function scoreOf(qTok, eTok, qf) {
    const m = new Map(); for (const t of eTok) m.set(t, (m.get(t) || 0) + 1);
    let inter = 0;
    for (const t of qTok) { const c = m.get(t); if (c) { inter++; m.set(t, c - 1); } }
    const nq = qTok.length, ne = eTok.length, dice = 2 * inter / (nq + ne), cont = inter / nq;
    let score = Math.max(dice, cont * (nq >= 8 ? 0.99 : nq >= 4 ? 0.9 : 0.75));
    const ef = features(eTok);
    if (!sameMap(qf.nums, ef.nums)) score = Math.min(score * 0.88, 0.97);   // angka beda → bisa berlawanan makna
    if (!sameMap(qf.neg, ef.neg)) score = Math.min(score * 0.85, 0.97);     // kata negasi beda
    return { score, dice };
  }
  function searchBase(raw) {
    const qTok = tokenize(cleanQuery(raw));
    if (!qTok.length) return { mode: 'empty', items: [] };
    const ex = exactMap.get(sortedKey(qTok));
    if (ex) return { mode: 'exact', items: ex.map((e) => ({ ...e, score: 1 })), total: ex.length };
    const qf = features(qTok), scored = [];
    for (const e of ENT) { const s = scoreOf(qTok, e.tk, qf); if (s.score >= MIN_SCORE) scored.push({ ...e, ...s }); }
    scored.sort((a, b) => b.score - a.score || b.dice - a.dice);
    return scored.length ? { mode: 'similar', items: scored, total: scored.length } : { mode: 'none', items: [], total: 0 };
  }

  /* Cadangan: bila soal+pilihan tidak ketemu, cari hanya dengan pokok soal (tanpa pilihan jawaban & teks halaman). */
  function stemTokens(raw) {
    const opts = parseOptions(raw).map((o) => o.text);
    const lines = String(raw).replace(/\r/g, '').split('\n').map((x) => x.trim()).filter(Boolean);
    const k = lines.findIndex((l) => /select one|pilih satu|pilih salah satu/i.test(l));
    let body = lines;
    if (k > 0) body = lines.slice(0, k + 1);
    else if (opts.length) body = lines.filter((l) => !opts.some((o) => l.replace(/^\(?[a-hA-H][\.\)\/:]\s*/, '') === o));
    return tokenize(cleanQuery(body.join('\n')));
  }
  function searchStem(raw) {
    const qTok = stemTokens(raw); if (qTok.length < 5) return null;
    const qf = features(qTok), scored = [];
    for (const e of ENT) {
      if (!e.stk) e.stk = tokenize(splitQ(e.q).stem);
      if (e.stk.length < 4) continue;
      const s = scoreOf(qTok, e.stk, qf);
      if (s.score >= 0.75) scored.push({ ...e, ...s });
    }
    scored.sort((a, b) => b.score - a.score || b.dice - a.dice);
    return scored.length ? { mode: 'similar', items: scored, total: scored.length } : null;
  }
  function searchText(raw) {
    const r = searchBase(raw);
    if (r.items.length) return r;
    return searchStem(raw) || r;
  }

  /* ====================== PILIHAN & HURUF JAWABAN (a/b/c/d/e) ====================== */
  const OPT_STOP = /^(clear my choice|hapus pilihan saya|next page|previous page|halaman (berikutnya|sebelumnya)|finish attempt.*|selesaikan percobaan.*|question\s*\d+.*|pertanyaan\s*\d+.*|question text|flag question|remove flag|tandai pertanyaan|not yet answered|belum dijawab|answer saved|marked out of.*|points? out of.*)$/i;
  function parseOptions(raw) {
    const lines = String(raw || '').replace(/\r/g, '').replace(/\u00a0/g, ' ').split('\n').map((l) => l.trim());
    const LET = /^\(?([a-hA-H])\s*[\.\)\/:]\s*(\S.*)$/;
    const out = [];
    let at = -1;
    for (let i = 0; i < lines.length; i++) if (/(select one( or more)?|pilih (satu|salah satu)( atau lebih)?)\s*:?\s*$/i.test(lines[i])) { at = i; break; }
    if (at >= 0) {
      for (let i = at + 1; i < lines.length; i++) {
        const l = lines[i]; if (!l) continue;
        if (OPT_STOP.test(l)) break;
        const m = l.match(LET);
        out.push({ letter: m ? m[1].toLowerCase() : '', text: m ? m[2].trim() : l });
        if (out.length >= 8) break;
      }
    } else {
      for (const l of lines) { const m = l.match(LET); if (m) out.push({ letter: m[1].toLowerCase(), text: m[2].trim() }); }
      if (out.length < 2 || out[0].letter !== 'a') return [];
    }
    if (out.length < 2) return [];
    out.forEach((o, i) => { if (!o.letter) o.letter = String.fromCharCode(97 + i); });
    return out;
  }
  function diceTok(a, b) {
    const ta = tokenize(a), tb = tokenize(b); if (!ta.length || !tb.length) return 0;
    if (ta.join(' ') === tb.join(' ')) return 1;
    const m = new Map(); for (const t of tb) m.set(t, (m.get(t) || 0) + 1);
    let n = 0; for (const t of ta) { const c = m.get(t); if (c) { n++; m.set(t, c - 1); } }
    return 2 * n / (ta.length + tb.length);
  }
  function bestOpt(ans, opts) {
    const r = opts.map((o) => ({ o, s: diceTok(ans, o.text) })).sort((x, y) => y.s - x.s);
    if (!r.length || r[0].s < 0.6) return null;
    if (r[0].s < 0.99 && r[1] && r[0].s - r[1].s < 0.05) return null;      // ragu: dua pilihan sama miripnya
    return r[0].o;
  }
  const matchAnswers = (it, opts) => it.answers.map((t) => { const o = bestOpt(t, opts); return { l: o ? o.letter : '', t }; });
  /** Pilih hasil yang jawabannya paling cocok dengan salah satu pilihan di soal yang ditempel. */
  function pickAnswer(p) {
    const items = p.res.items; p.opts = parseOptions(p.text);
    if (!items.length) return (p.pk = null);
    const top = items[0];
    if (p.opts.length >= 2) {
      const cands = items.slice(0, 6).filter((it, i) => i === 0 || it.score >= Math.max(0.6, top.score - 0.08));
      for (const it of cands) { const lines = matchAnswers(it, p.opts); if (lines.some((x) => x.l)) return (p.pk = { it, lines }); }
    }
    return (p.pk = { it: top, lines: top.answers.map((t) => ({ l: '', t })) });
  }
  const fmtLine = (x) => (x.l ? x.l + '/' : '') + x.t;
  const lineText = (pk) => pk.lines.map(fmtLine).join(' | ');
  const lineHtml = (pk) => pk.lines.map((x) => (x.l ? '<b class="lt">' + esc(x.l) + '/</b>' : '') + esc(x.t)).join('<br>');
  const keyOf = (pk) => { const l = pk && pk.lines.filter((x) => x.l).map((x) => x.l).sort().join(''); return l || '?'; };

  /* ====================== TAMPILAN HASIL ====================== */
  function splitQ(q) {
    const semi = q.indexOf('; ');
    if (semi > 0) { const col = q.lastIndexOf(': ', semi); if (col > 0) return { stem: q.slice(0, col + 1), opts: q.slice(col + 2).split('; ') }; }
    return { stem: q, opts: [] };
  }
  const pctOf = (s) => (s >= 0.9999 ? 100 : Math.min(99, Math.floor(s * 100)));
  const topAnswerText = (it) => it.answers.join(' / ');
  const ansBlock = (answers, label) => answers.map((a, i) => '<div class="ans"><div class="grow"><div class="lbl">' + (label || 'Jawaban') + (answers.length > 1 ? ' ' + (i + 1) : '') + '</div><div class="val">' + esc(a) + '</div></div><button class="copy" data-copy="' + esc(a) + '">Salin</button></div>').join('');
  function card(it, idx, part) {
    const { stem, opts } = splitQ(it.q), ansN = new Set(it.answers.map(normA)), p = pctOf(it.score);
    const shown = part && part.opts && part.opts.length >= 2 ? matchAnswers(it, part.opts).map(fmtLine) : it.answers;
    const optsHtml = opts.length ? '<div class="sec">Pilihan</div><ul class="opts">' + opts.map((o) => '<li class="' + (ansN.has(normA(o)) ? 'ok' : '') + '">' + esc(o) + '</li>').join('') + '</ul>' : '';
    return '<article class="card res' + (idx === 0 ? ' top' : '') + '"><div class="badges"><span class="pill' + (p === 100 ? ' p100' : '') + '">' + p + '% mirip teks</span>' +
      (idx === 0 ? '<span class="tag">⭐ paling mirip</span>' : '<span class="tag">#' + (idx + 1) + '</span>') + '</div>' +
      ansBlock(shown) + '<div class="sec">Soal</div><p class="q">' + esc(stem) + '</p>' + optsHtml +
      (idx === 0 ? '<div class="warnbox">Persentase = kemiripan teks, bukan jaminan jawabannya benar. Cek kembali bila soal tampak sedikit berbeda.</div>' : '') + '</article>';
  }
  const shortText = (text, n) => { const c = cleanQuery(text).replace(/\s+/g, ' ').trim(); return c.length > n ? c.slice(0, n) + '…' : c; };
  const noneCard = (i, p) => '<article class="card res none"><div class="badges"><span class="pill bad">Tidak ada di bank soal</span></div><p class="q">' + esc(shortText(p.text, 220)) + '</p>' + (p.aiState === 'loading' ? '' : '<button class="btn btn-sm" data-ai="' + i + '">🤖 ' + (p.ai ? 'Tanya AI lagi' : 'Tanya Referensi AI') + '</button>') + '<div data-aibox="' + i + '">' + aiBoxHtml(p) + '</div></article>';

  function renderAll() {
    const out = $('out');
    if (!LAST || !LAST.parts.length) { out.innerHTML = ''; return; }
    const { parts, multi } = LAST; let html = '';
    if (multi) {
      const found = parts.filter((p) => p.res.items.length).length;
      html += '<div class="info-line">Terbaca <b>' + parts.length + '</b> soal · ditemukan <b>' + found + '</b>' + (found < parts.length ? ' · tidak ada <b>' + (parts.length - found) + '</b>' : '') + ' · jawaban diurut sesuai soal yang dikirim</div>';
      const plain = parts.map((p, i) => (i + 1) + '. ' + (p.pk ? lineText(p.pk) + (p.ai ? '  [AI: ' + aiLine(p.ai) + ']' : '') : p.ai ? aiLine(p.ai) + '  (AI)' : '(tidak ada di bank soal)')).join('\n');
      const quick = parts.map((p, i) => (i + 1) + (p.pk ? '-' + keyOf(p.pk) : p.ai && p.ai.huruf ? '-' + p.ai.huruf + '🤖' : '-×')).join('  ');
      html += '<article class="card res top sum"><div class="badges"><span class="pill p100">📋 Ringkasan jawaban</span><button class="copy" data-copy="' + esc(plain) + '">Salin semua</button></div><div class="quick"><span class="tag">Kunci cepat</span> <b>' + esc(quick) + '</b></div><ol>' +
        parts.map((p, i) => '<li class="' + (p.res.items.length || p.ai ? '' : 'miss') + '"><span class="n">' + (i + 1) + '.</span><span class="t">' + (p.pk ? lineHtml(p.pk) + ' <small class="tag">(' + pctOf(p.pk.it.score) + '%)</small>' + (p.ai ? ' <small class="tag">🤖 AI: ' + aiHtml(p.ai) + '</small>' : '') : p.ai ? '🤖 ' + aiHtml(p.ai) + ' <small class="tag">(AI' + (p.ai.sumber === 'luar' ? ', referensi luar' : '') + ')</small>' : p.aiState === 'loading' ? '<small class="tag">AI sedang mencari…</small>' : 'tidak ada di bank soal') + '</span></li>').join('') + '</ol></article>';
    }
    parts.forEach((p, i) => {
      html += '<div class="group">';
      if (multi) html += '<div class="ghead"><b>Soal ' + (i + 1) + '</b><span class="qs">' + esc(shortText(p.text, 110)) + '</span></div>';
      const r = p.res;
      if (!r.items.length) html += noneCard(i, p);
      else {
        if (!multi) html += '<div class="info-line">' + (r.mode === 'exact' ? '✅ Isi kata <b>sama persis</b> — hanya jawaban yang cocok ditampilkan.' : '🟢 Tidak ada yang persis. Menampilkan <b>' + r.total + '</b> soal paling mirip (tertinggi di atas).') + '</div>';
        const limit = multi ? 1 : SHOW_FIRST;
        html += r.items.slice(0, p.showAll ? r.items.length : limit).map((it, k) => card(it, k, p)).join('');
        if (!p.showAll && r.items.length > limit) html += '<button class="btn btn-sm more" data-more="' + i + '">Lihat ' + (r.items.length - limit) + ' yang mirip lainnya</button>';
        html += (p.aiState === 'loading' ? '' : '<button class="btn btn-sm" data-ai="' + i + '">🤖 ' + (p.ai ? 'Simpulkan lagi dengan AI' : 'Simpulkan dengan AI') + '</button>') + '<div data-aibox="' + i + '">' + aiBoxHtml(p) + '</div>';
      }
      html += '</div>';
    });
    out.innerHTML = html;
    out.querySelectorAll('[data-more]').forEach((b) => { b.onclick = () => { LAST.parts[+b.dataset.more].showAll = true; renderAll(); }; });
    out.querySelectorAll('[data-ai]').forEach((b) => { b.onclick = () => runAI(+b.dataset.ai); });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.copy) : Promise.resolve()).then(() => { const t = b.textContent; b.textContent = 'Tersalin ✓'; setTimeout(() => { b.textContent = t; }, 1200); }).catch(() => {});
  });

  /* ====================== POP-UP (tidak menutup sendiri) ====================== */
  function popup(found, answerHtml, sub) {
    $('pop').className = 'pop ' + (found ? 'good' : 'bad');
    $('popIco').textContent = found ? '✅' : '❌';
    $('popTxt').textContent = found ? MSG_OK : MSG_BAD;
    show($('popAns'), !!answerHtml); $('popAns').innerHTML = answerHtml || '';
    $('popSub').textContent = sub || '';
    $('ov').classList.add('show');
  }
  const closePop = () => $('ov').classList.remove('show');
  $('popOk').onclick = closePop;
  $('ov').addEventListener('click', (e) => { if (e.target === $('ov')) closePop(); });
  function popupFor(L) {
    const found = L.parts.filter((p) => p.res.items.length || p.ai);
    if (!found.length) return popup(false, '', '');
    const disc = 'Persentase = kemiripan teks, bukan jaminan jawaban benar.';
    if (!L.multi) {
      const p = found[0];
      if (!p.pk) return popup(true, '🤖 ' + aiHtml(p.ai) + '<small>Jawaban AI' + (p.ai.sumber === 'luar' ? ' (referensi luar)' : '') + ' — bukan dari bank soal, cek lagi.</small>', '');
      const t = p.pk.it; return popup(true, lineHtml(p.pk) + '<small>' + pctOf(t.score) + '% mirip teks' + (pctOf(t.score) === 100 ? ' (isi kata sama persis)' : '') + '</small>' + (p.ai ? '<small>🤖 AI: ' + aiHtml(p.ai) + '</small>' : ''), disc);
    }
    const lines = L.parts.map((p, i) => p.pk ? (i + 1) + '. ' + lineHtml(p.pk) + ' <small style="display:inline">(' + pctOf(p.pk.it.score) + '%)</small>' + (p.ai ? ' <small style="display:inline">🤖 ' + aiHtml(p.ai) + '</small>' : '') : p.ai ? (i + 1) + '. 🤖 ' + aiHtml(p.ai) + ' <small style="display:inline">(AI)</small>' : (i + 1) + '. <small style="display:inline">' + (p.aiState === 'loading' ? 'AI mencari…' : 'tidak ada') + '</small>').join('<br>');
    popup(true, lines, 'Ditemukan ' + L.parts.filter((p) => p.res.items.length).length + ' dari ' + L.parts.length + ' soal' + (L.parts.some((p) => p.ai) ? ' + simpulan AI' : '') + '. ' + disc);
  }

  /* ====================== AI (API key milik pengguna, dari browser) ====================== */
  /* Kunci AI bersama: disimpan admin di keys.js TERENKRIPSI (dengan kunci data), jadi sinkron ke semua perangkat dan hanya terbaca setelah login.
     Pengguna tidak perlu menempel kunci lagi. Kunci pribadi di perangkat (bila ada) didahulukan. */
  const personalAi = () => { try { const c = JSON.parse(ls.get('cs_ai') || 'null'); return c && c.key ? c : null; } catch (e) { return null; } };
  const getAi = () => personalAi() || AI_SHARED;
  const refreshAi = () => { const c = getAi(); $('aiState').textContent = c && c.key ? (c.provider === 'claude' ? 'Claude' : 'Gemini') + ' · aktif' + (personalAi() ? '' : ' (otomatis)') : 'belum aktif'; };
  async function loadSharedAi() {
    try { AI_SHARED = KEYS && KEYS.ai && DEK ? await C.decryptBank(C.unb64(KEYS.ai), DEK) : null; } catch (e) { AI_SHARED = null; }
    refreshAi();
  }
  $('aiBtn').onclick = () => {
    const c = personalAi() || { provider: (AI_SHARED && AI_SHARED.provider) || 'gemini', key: '', model: '' };
    $('aiProv').value = c.provider; $('aiKey').value = c.key; $('aiModel').value = c.model || ''; $('aiModel').placeholder = AI_DEFAULT[c.provider];
    const adm = SESS && SESS.role === 'admin'; show($('aiAdminRow'), adm); $('aiMsg').innerHTML = '';
    $('aiNote').innerHTML = AI_SHARED ? '✅ AI sudah <b>aktif otomatis</b> dari admin untuk semua pengguna — tidak perlu mengisi apa pun.' + (adm ? ' Untuk mengganti kunci: isi kolom di bawah lalu klik <b>Simpan &amp; sinkronkan ke semua</b>.' : '') : (adm ? 'Isi API key sekali lalu klik <b>Simpan &amp; sinkronkan ke semua</b> — semua pengguna langsung bisa memakai AI tanpa menempel kunci.' : 'AI belum diaktifkan admin. Minta admin menyimpannya, atau pakai kunci Anda sendiri di bawah.');
    $('ovAi').classList.add('show');
  };
  $('aiProv').onchange = () => { $('aiModel').placeholder = AI_DEFAULT[$('aiProv').value]; };
  $('aiClose').onclick = () => $('ovAi').classList.remove('show');
  $('aiSave').onclick = () => { ls.set('cs_ai', JSON.stringify({ provider: $('aiProv').value, key: $('aiKey').value.trim(), model: $('aiModel').value.trim() })); refreshAi(); $('ovAi').classList.remove('show'); };
  $('aiOff').onclick = () => { ls.del('cs_ai'); refreshAi(); $('ovAi').classList.remove('show'); };
  $('aiSaveAll').onclick = async () => {
    const key = $('aiKey').value.trim(); if (!key) { $('aiMsg').innerHTML = '<div class="alert err">Isi API key dulu.</div>'; return; }
    const cfg = { provider: $('aiProv').value, key, model: $('aiModel').value.trim() };
    $('aiSaveAll').disabled = true; $('aiMsg').innerHTML = '<div class="alert warn"><span class="spin"></span>Menyimpan & menyinkronkan…</div>';
    try {
      KEYS.ai = C.b64(await C.encryptBank(cfg, DEK)); AI_SHARED = cfg; ls.del('cs_ai'); refreshAi();
      await commitKeys('AI bersama disimpan (terenkripsi).');
      $('aiMsg').innerHTML = $('pubMsg').innerHTML; $('aiKey').value = '';
    } finally { $('aiSaveAll').disabled = false; }
  };
  $('aiOffAll').onclick = async () => {
    if (!confirm('Hapus AI bersama? Semua pengguna tidak lagi memakai AI otomatis.')) return;
    delete KEYS.ai; AI_SHARED = null; refreshAi(); await commitKeys('AI bersama dihapus.'); $('aiMsg').innerHTML = $('pubMsg').innerHTML;
  };

  async function callAI(system, parts, opt) {            // parts: [{text}] atau [{image:{mime,data}},{text}]
    const c = getAi(); if (!c || !c.key) throw new Error('NOKEY');
    const model = c.model || AI_DEFAULT[c.provider];
    if (c.provider === 'claude') {
      const content = parts.map((p) => p.image ? { type: 'image', source: { type: 'base64', media_type: p.image.mime, data: p.image.data } } : { type: 'text', text: p.text });
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model, max_tokens: 1500, system, messages: [{ role: 'user', content }] }) });
      const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
      return j.content.map((x) => x.text || '').join('').trim();
    }
    const gp = parts.map((p) => p.image ? { inline_data: { mime_type: p.image.mime, data: p.image.data } } : { text: p.text });
    const eps = ['https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent'];
    if (/^AQ\./.test(c.key)) eps.push('https://aiplatform.googleapis.com/v1/publishers/google/models/' + encodeURIComponent(model) + ':generateContent');   // kunci format baru (Vertex express)
    let lastErr = new Error('AI tidak merespons');
    for (const withSearch of (opt && opt.search ? [true, false] : [false])) {            // pencarian Google = referensi luar (dicoba dulu; bila ditolak, tanpa pencarian)
      for (const url of eps) {
        try {
          const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': c.key }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: gp }], ...(withSearch ? { tools: [{ google_search: {} }] } : {}) }) });
          const j = await r.json();
          if (r.ok) { const cand = (j.candidates || [])[0]; return ((cand && cand.content && cand.content.parts) || []).map((x) => x.text || '').join('').trim(); }
          lastErr = new Error((j.error && j.error.message) || 'HTTP ' + r.status);
          if (r.status === 429 || r.status >= 500) throw lastErr;                       // kuota/gangguan: jangan coba jalur lain
        } catch (e) { lastErr = e; if (/kuota|quota|429|HTTP 5/i.test(String(e.message))) throw e; }
      }
    }
    throw lastErr;
  }
  const AI_SYS = 'Kamu asisten yang menjawab soal pelatihan karyawan minimarket (Alfamart/Alfamidi). Kamu diberi: (1) soal beserta pilihan jawabannya, (2) KUTIPAN dari database bank soal (soal mirip beserta jawabannya). ' +
    'Cara kerja: baca kutipan database dan simpulkan jawaban yang paling tepat; PRIORITASKAN database bila ada kutipan yang relevan. Bila database tidak memuat jawaban yang relevan, boleh memakai pengetahuan umum / referensi luar (prosedur ritel, kebijakan perusahaan, logika) dan tandai sumber "luar". ' +
    'Jika ada pilihan, pilih TEPAT SATU (atau lebih bila soal minta beberapa) dari pilihan yang diberikan. Balas HANYA JSON valid: {"huruf":"huruf pilihan, mis. a (kosong bila tanpa pilihan)","jawaban":"teks jawaban persis seperti pilihan","sumber":"database atau luar","penjelasan":"alasan 1-3 kalimat"}. Jika benar-benar ragu isi jawaban "Tidak yakin". Bahasa Indonesia.';
  const aiLine = (o) => (o.huruf ? o.huruf + '/' : '') + o.jawaban;
  const aiHtml = (o) => (o.huruf ? '<b class="lt">' + esc(o.huruf) + '/</b>' : '') + esc(o.jawaban);
  function aiHints(p, q) {
    const seen = new Set(), hints = [], add = (e, sc) => { if (seen.has(e.q) || hints.length >= 6) return; seen.add(e.q); hints.push('- [kemiripan ' + Math.round(sc * 100) + '%] SOAL: ' + String(e.q).slice(0, 450) + '\n  JAWABAN DATABASE: ' + e.answers.join(' | ')); };
    (p.res.items || []).slice(0, 4).forEach((it) => add(it, it.score));
    const qTok = tokenize(q), qf = features(qTok);
    if (qTok.length) ENT.map((e) => ({ e, s: scoreOf(qTok, e.tk, qf).dice })).filter((x) => x.s >= 0.3).sort((a, b) => b.s - a.s).slice(0, 5).forEach((x) => add(x.e, x.s));
    return hints;
  }
  async function runAI(i, auto) {
    const L = LAST, p = L && L.parts[i]; if (!p || p.aiState === 'loading') return;
    if (!getAi()) { p.aiState = 'nokey'; if (!auto) renderAll(); return; }
    p.aiState = 'loading'; renderAll();
    try {
      const q = cleanQuery(p.text).replace(/\n{2,}/g, '\n').trim(), hints = aiHints(p, q), opts = p.opts || [];
      const txt = await callAI(AI_SYS, [{ text: 'SOAL:\n' + q + (opts.length ? '\n\nPILIHAN (urut):\n' + opts.map((o) => o.letter + '. ' + o.text).join('\n') : '') + '\n\nKUTIPAN DATABASE:\n' + (hints.length ? hints.join('\n') : '(tidak ada yang mirip — gunakan referensi luar)') }], { search: true });
      let o; try { const m = txt.match(/\{[\s\S]*\}/); o = JSON.parse(m ? m[0] : txt); } catch (e) { o = { jawaban: txt.slice(0, 300) }; }
      let huruf = String(o.huruf || '').toLowerCase().replace(/[^a-h]/g, '').slice(0, 3), jawaban = String(o.jawaban || 'Tidak yakin').trim();
      if (opts.length) {
        const byL = (l) => opts.find((x) => x.letter === l);
        if (huruf && byL(huruf[0])) { if (!jawaban || jawaban === 'Tidak yakin' || diceTok(jawaban, byL(huruf[0]).text) < 0.5) jawaban = byL(huruf[0]).text; }
        else { const b = bestOpt(jawaban, opts); huruf = b ? b.letter : ''; }
      } else huruf = '';
      p.ai = { huruf, jawaban, sumber: /luar/i.test(String(o.sumber || '')) ? 'luar' : 'database', penjelasan: String(o.penjelasan || '') }; p.aiState = 'done';
    } catch (e) { p.aiState = 'err'; p.aiErr = e.message || String(e); }
    if (LAST === L) { renderAll(); if ($('ov').classList.contains('show')) popupFor(L); }
  }
  /** Otomatis: soal yang tidak ada di bank, atau jawabannya kurang yakin (<80% mirip), disimpulkan AI (maks 10 soal, 2 sekaligus). */
  async function autoAi(L) {
    if (!getAi()) return;
    const idx = L.parts.map((p, i) => i).filter((i) => { const p = L.parts[i]; return !p.res.items.length || (p.pk && p.pk.it.score < 0.8); }).slice(0, 10);
    let k = 0; const worker = async () => { while (k < idx.length && LAST === L) await runAI(idx[k++], true); };
    await Promise.all([worker(), worker()]);
  }
  function aiBoxHtml(p) {
    if (p.aiState === 'loading') return '<article class="card res ai"><span class="spin"></span>AI membaca data bank soal & mencari referensi…</article>';
    if (p.aiState === 'err') return '<article class="card res none"><p class="q">AI tidak tersedia: ' + esc(p.aiErr) + '</p></article>';
    if (p.aiState === 'nokey') return '<div class="card empty"><p>AI belum diaktifkan. Admin cukup menyimpan API key sekali di <b>🤖 Referensi AI → Simpan &amp; sinkronkan ke semua</b>.</p></div>';
    if (p.ai) return '<article class="card res ai"><div class="badges"><span class="pill ai">🤖 Simpulan AI</span><span class="tag">' + (p.ai.sumber === 'luar' ? 'dari referensi luar (bukan bank soal) — cek lagi' : 'disimpulkan dari data bank soal — cek lagi') + '</span></div>' + ansBlock([aiLine(p.ai)], 'Jawaban AI') + (p.ai.penjelasan ? '<div class="sec">Penjelasan</div><p class="expl">' + esc(p.ai.penjelasan) + '</p>' : '') + '</article>';
    return '';
  }

  /* ====================== KONTROL PENCARIAN ====================== */
  let runId = 0, liveT;
  async function run(explicit) {
    const id = ++runId, raw = $('q').value;
    if (!raw.trim()) { LAST = null; renderAll(); return; }
    if (!ENT.length) return;
    $('go').disabled = true; await new Promise((r) => setTimeout(r));
    if (id !== runId) { $('go').disabled = false; return; }
    const whole = searchText(raw); let parts;
    if (whole.items.length && whole.items[0].score >= 0.9) parts = [{ text: raw.trim(), res: whole }];
    else { const texts = splitQuestions(raw); parts = texts.length > 1 ? texts.map((t) => ({ text: t, res: searchText(t) })) : [{ text: raw.trim(), res: whole }]; }
    parts.forEach(pickAnswer);
    $('go').disabled = false; LAST = { parts, multi: parts.length > 1 }; renderAll();
    if (explicit) { popupFor(LAST); autoAi(LAST); }
  }
  $('go').onclick = () => run(true);
  $('clr').onclick = () => { $('q').value = ''; LAST = null; renderAll(); runId++; $('ocrNote').textContent = ''; $('q').focus(); };
  $('q').addEventListener('input', () => { clearTimeout(liveT); liveT = setTimeout(() => run(false), 350); });
  $('q').addEventListener('paste', () => setTimeout(() => { if ($('q').value.trim().length > 15) { clearTimeout(liveT); run(true); } }, 30));
  $('q').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(true); } });

  /* ====================== TEMPEL OTOMATIS (HP & PC) ====================== */
  let lastPasted = '', pasting = false;
  const pnote = (t) => { $('pasteNote').textContent = t || ''; };
  async function pasteNow(auto, minLen) {
    if (pasting || !SESS) return; pasting = true;
    try {
      if (!(navigator.clipboard && navigator.clipboard.readText)) throw new Error('tidak didukung');
      const t = (await navigator.clipboard.readText()) || '';
      if (t.trim().length < (minLen || 6)) { if (!auto) pnote('Clipboard kosong — salin soalnya dulu, lalu tekan tombol ini lagi.'); return; }
      if (auto && (t === lastPasted || t === $('q').value)) return;
      lastPasted = t; $('q').value = t; pnote('Soal ditempel otomatis dari clipboard.'); run(true);
    } catch (e) {
      if (!auto) { $('q').focus(); pnote('Browser tidak mengizinkan baca clipboard. Ketuk lama di kotak soal → Tempel; hasil langsung muncul.'); }
    } finally { pasting = false; }
  }
  $('pasteBtn').onclick = () => pasteNow(false);
  $('autoPaste').checked = ls.get('cs_autopaste') !== '0';
  $('autoPaste').onchange = () => ls.set('cs_autopaste', $('autoPaste').checked ? '1' : '0');
  $('q').addEventListener('focus', () => { if ($('autoPaste').checked && !$('q').value.trim()) pasteNow(true); });
  window.addEventListener('focus', () => { if ($('autoPaste').checked && SESS && !$('ovAdmin').classList.contains('show')) pasteNow(true, 25); });

  /* ====================== GAMBAR → TEKS ====================== */
  async function shrinkImage(file) {
    try {
      if (file.size <= 1.5 * 1024 * 1024 || typeof createImageBitmap === 'undefined') return file;
      const bmp = await createImageBitmap(file), k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.88));
      return blob && blob.size < file.size ? blob : file;
    } catch (e) { return file; }
  }
  async function ocrAI(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    return callAI('Kamu mesin OCR. Salin SELURUH teks soal pada gambar apa adanya (soal + semua pilihan jawaban, satu pilihan per baris). Jangan menjawab, jangan menambah komentar.', [{ image: { mime: file.type || 'image/jpeg', data: C.b64(buf) } }, { text: 'Salin teks pada gambar ini.' }]);
  }
  async function ocrLocal(file) {
    if (!window.Tesseract) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; s.onload = res; s.onerror = () => rej(new Error('OCR di browser gagal dimuat (butuh internet)')); document.head.appendChild(s); });
    return (await window.Tesseract.recognize(file, 'ind+eng')).data.text;
  }
  $('imgBtn').onclick = () => $('imgFile').click();
  $('imgFile').onchange = async (e) => {
    const f0 = e.target.files[0]; e.target.value = ''; if (!f0) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f0.type)) return alert('Gambar harus JPG, PNG, atau WebP.');
    const old = $('imgBtn').textContent; $('imgBtn').disabled = true; $('imgBtn').innerHTML = '<span class="spin"></span>Membaca gambar…';
    try {
      const f = await shrinkImage(f0); let text = '', via = 'AI';
      try { if (!getAi() || !getAi().key) throw new Error('NOKEY'); text = await ocrAI(f); }
      catch (aiErr) { $('imgBtn').innerHTML = '<span class="spin"></span>Membaca di browser…'; via = 'OCR browser'; text = await ocrLocal(f); }
      if (!text || !text.trim()) throw new Error('Tidak ada teks yang terbaca pada gambar.');
      $('q').value = text.trim(); run(true);
      $('ocrNote').textContent = 'Teks gambar dibaca via ' + via + ' — periksa/koreksi di kotak soal, lalu klik Cari lagi bila perlu.';
    } catch (err) { alert('Gagal membaca gambar: ' + err.message); }
    $('imgBtn').disabled = false; $('imgBtn').textContent = old;
  };

  /* ====================== UNGGAH EXCEL (di browser) ====================== */
  function renderReport(items) {
    let html = '';
    for (const it of items) {
      html += '<div class="f">📄 ' + esc(it.upload) + (it.error ? ' <span class="bad">— ' + esc(it.error) + '</span>' : '') + '</div>';
      if (it.error) continue;
      html += '<div>Terbaca ' + it.pairsRead.toLocaleString('id-ID') + ' pasangan · <b>baru ' + it.added.toLocaleString('id-ID') + '</b> · sudah ada (dilewati) ' + it.skipped.toLocaleString('id-ID') + '</div>';
      for (const f of it.files) {
        html += '<div class="f" style="font-weight:600">• ' + esc(f.file) + (f.error ? ' <span class="bad">' + esc(f.error) + '</span>' : ' (' + f.totalPairs + ' pasangan)') + '</div>';
        if (!f.sheets.length) continue;
        html += '<table><tr><th>Sheet</th><th>Cara baca</th><th>Baris</th><th>Pasangan</th><th>Tanpa pasangan</th></tr>' + f.sheets.map((s) => '<tr><td>' + esc(s.sheet) + '</td><td>' + esc(s.mode) + '</td><td>' + s.rows + '</td><td>' + s.pairs + '</td><td>' + (s.unpaired ? '<span class="bad">' + s.unpaired + '</span>' : '0') + '</td></tr>').join('') + '</table>';
        for (const s of f.sheets) if (s.unpairedSample.length) html += '<details><summary>' + esc(s.sheet) + ': ' + s.unpaired + ' baris belum lengkap (contoh ' + s.unpairedSample.length + ')</summary>' + s.unpairedSample.map((u) => '<div>baris ' + u.baris + ': ' + esc(u.teks) + '</div>').join('') + '</details>';
      }
    }
    $('rep').innerHTML = html;
  }
  async function handleFiles(list) {
    const results = [], fresh = [];
    for (const f of list) {
      if (!/\.(xlsx|xls|xlsm|xlsb|csv|ods|zip)$/i.test(f.name)) { results.push({ upload: f.name, error: 'Format tidak didukung (XLSX, XLS, XLSM, XLSB, CSV, ODS, ZIP).' }); continue; }
      if (f.size > IMP.MAX_UPLOAD) { results.push({ upload: f.name, error: 'Lebih dari 50 MB. Pecah jadi beberapa file.' }); continue; }
      $('rep').innerHTML = '<span class="spin"></span>Membaca ' + esc(f.name) + '…'; await new Promise((r) => setTimeout(r, 30));
      try {
        const r = IMP.importFile(f.name, new Uint8Array(await f.arrayBuffer()));
        const a = addPairs(r.pairs.map((p) => [p[0], p[1]])); fresh.push(...a.fresh); LOCAL_ADDED += a.added;
        results.push({ upload: f.name, files: r.files, pairsRead: r.pairs.length, added: a.added, skipped: a.skipped });
      } catch (e) { results.push({ upload: f.name, error: e.message }); }
    }
    if (fresh.length) { const old = await idbGet(); await idbSet(old.concat(fresh)); }
    renderReport(results); updateCounts();
    if ($('q').value.trim()) run(false);
  }
  $('drop').onclick = () => $('file').click();
  $('file').onchange = (e) => { handleFiles([...e.target.files]); e.target.value = ''; };
  ['dragenter', 'dragover'].forEach((ev) => $('drop').addEventListener(ev, (e) => { e.preventDefault(); $('drop').classList.add('on'); }));
  ['dragleave', 'drop'].forEach((ev) => $('drop').addEventListener(ev, (e) => { e.preventDefault(); $('drop').classList.remove('on'); }));
  $('drop').addEventListener('drop', (e) => handleFiles([...e.dataTransfer.files]));

  /* ====================== SINKRON LANGSUNG (tanpa menunggu deploy GitHub Pages) ====================== */
  const ghDefaults = () => {
    const h = location.hostname, seg = location.pathname.split('/').filter(Boolean)[0];
    const owner = ls.get('cs_gh_owner') || (h.endsWith('.github.io') ? h.split('.')[0] : '');
    const repo = ls.get('cs_gh_repo') || (h.endsWith('.github.io') ? (seg && !/\.html?$/.test(seg) ? seg : owner + '.github.io') : '');
    return { owner, repo, branch: ls.get('cs_gh_branch') || 'main' };
  };
  const parseKeys = (txt) => {
    try { const k = JSON.parse(String(txt).replace(/^\s*window\.CS_KEYS\s*=\s*/, '').replace(/;\s*$/, '')); return k && k.v === 1 && Array.isArray(k.admins) ? k : null; } catch (e) { return null; }
  };
  /** Ambil keys.js terbaru langsung dari GitHub (bukan dari cache situs). Gagal/offline → null (tidak mengganggu). */
  async function fetchLiveKeys() {
    const g = ghDefaults(); if (!g.owner || !g.repo || location.protocol === 'file:') return null;
    let to = null;
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; if (ctl) to = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch('https://raw.githubusercontent.com/' + encodeURIComponent(g.owner) + '/' + encodeURIComponent(g.repo) + '/' + encodeURIComponent(g.branch) + '/data/keys.js?t=' + Date.now(), { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      return r.ok ? parseKeys(await r.text()) : null;
    } catch (e) { return null; } finally { if (to) clearTimeout(to); }
  }
  async function refreshKeys(force) {
    if (!force && Date.now() - liveAt < 15000) return false;
    liveAt = Date.now();
    const k = await fetchLiveKeys(); if (!k) return false;
    LIVE = k;
    if (adminDirty) return false;                                   // jangan menimpa perubahan admin yang belum terbit
    if (String(k.updated || '') >= String((KEYS && KEYS.updated) || '')) { KEYS = JSON.parse(JSON.stringify(k)); if (DEK) loadSharedAi(); return true; }
    return false;
  }
  function sessionValid(k) {
    if (!SESS || !k) return true;
    if (SESS.role === 'admin') return k.admins.some((x) => x.h === SESS.h);
    if (SESS.team) return !!k.team && (!SESS.wrap || k.team.wrap === SESS.wrap);   // kode tim diganti admin → semua keluar
    return true;
  }
  async function watchSession() {
    if (!SESS) return;
    await refreshKeys(false);
    if (SESS && LIVE && !sessionValid(LIVE)) loggedOut('Akses Anda sudah dinonaktifkan oleh admin (kode tim diganti). Minta kode baru ke admin.');
  }
  window.addEventListener('focus', () => { if (SESS) watchSession(); });
  window.addEventListener('storage', (e) => { if (e.key === 'cs_session' && !e.newValue && SESS) loggedOut('Anda sudah keluar (di tab lain).'); });

  /* ====================== LOGIN & SESI (maks 2 jam) ====================== */
  const msg = (id, t, ok) => { const m = $(id); m.textContent = t || ''; m.className = 'msg' + (ok ? ' ok' : ''); };
  const toggle = (admin) => { $('lg').classList.toggle('active', admin); msg('msgTeam', ''); msg('msgAdmin', ''); };
  $('toAdmin').onclick = () => toggle(true); $('toTeam').onclick = () => toggle(false);

  /** Sesi disimpan di perangkat (localStorage) supaya TETAP ADA walau tab/browser ditutup. Batas 2 jam dihitung dari login pertama
      (exp tidak pernah diperpanjang) — Authenticator hanya diminta sekali per sesi. Dihapus saat keluar, habis, atau diputus admin. */
  const saveSess = (dek) => { ls.set('cs_session', JSON.stringify({ ...SESS, dek: C.b64(dek) })); ss.del('cs_session'); };
  function loadSess() {
    let s = null;
    try { s = JSON.parse(ls.get('cs_session') || ss.get('cs_session') || 'null'); } catch (e) { s = null; }
    if (!s || !s.dek || !(s.exp > Date.now()) || s.exp > Date.now() + SESSION_MS + 60000) { ls.del('cs_session'); ss.del('cs_session'); return null; }   // habis / tidak wajar → hapus
    return s;
  }
  async function startSession(info, dek) {
    DEK = dek; SESS = { ...info, exp: Date.now() + SESSION_MS };
    saveSess(dek);
    await enter();
  }
  async function enter() {
    show($('login'), false); show($('app'), true);
    $('whoName').textContent = SESS.role === 'admin' ? 'Admin · ' + SESS.email : SESS.name;
    show($('btnAdminPanel'), SESS.role === 'admin');
    clearInterval(tickT); tick(); tickT = setInterval(tick, 1000);
    clearInterval(watchT); watchT = setInterval(watchSession, 60000); setTimeout(watchSession, 3000);
    clearInterval(pingT); if (SESS.team) { pingNow(); pingT = setInterval(pingNow, 45000); }
    await loadSharedAi();
    try { await loadBank(); } catch (e) { console.error(e); $('status').className = 'chip err'; $('statusTxt').textContent = 'Gagal membuka data: ' + (e.message || e); }
  }
  function loggedOut(note) {
    if (SESS && SESS.team) relay({ a: 'bye', id: devId() });                          // kabari Pusat Perangkat: sesi selesai
    clearInterval(tickT); clearInterval(watchT); clearInterval(pingT); clearInterval(tmT); clearInterval(devT); gateUntil = 0; $('ovGate').classList.remove('show'); DEK = null; SESS = null; LAST = null; ENT = []; exactMap = new Map(); META = null;
    ls.del('cs_session'); ss.del('cs_session'); ss.del('cs_gh_token');
    $('out').innerHTML = ''; $('q').value = ''; $('rep').innerHTML = ''; closePop(); $('ovAdmin').classList.remove('show'); $('ovAi').classList.remove('show');
    show($('app'), false); show($('login'), true); $('lgPw').value = ''; $('adPw').value = ''; toggle(false);
    if (note) msg('msgTeam', note);
    show($('lgWarn'), location.protocol === 'file:');
  }
  function tick() {
    const left = Math.floor((SESS.exp - Date.now()) / 1000);
    if (left <= 0) return loggedOut('Sesi 2 jam sudah habis. Silakan login lagi.');
    const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
    $('timer').textContent = h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    $('timer').classList.toggle('low', left < 300);
  }
  /* ---------- Perangkat: ID acak per browser + jenis HP/PC (dikirim ke Pusat Perangkat bila admin memasangnya) ---------- */
  const DEV_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let devMem = '';
  function devId() {
    let v = ls.get('cs_dev');
    if (!v || !/^[A-Z0-9]{6,12}$/.test(v)) { v = devMem; if (!v) { for (const x of C.rnd(8)) v += DEV_ALPHA[x % DEV_ALPHA.length]; devMem = v; } ls.set('cs_dev', v); }
    return v;
  }
  function devLabel() {
    const ua = navigator.userAgent || '', pf = navigator.platform || '', m = ua.match(/Android\s[\d.]+;\s*([^;)]+)/);
    let os = 'Perangkat';
    if (/iPhone/.test(ua)) os = 'iPhone';
    else if (/iPad/.test(ua) || (pf === 'MacIntel' && navigator.maxTouchPoints > 1)) os = 'iPad';
    else if (/Android/.test(ua)) os = 'Android' + (m && m[1].trim().length > 1 && !/^K$/.test(m[1].trim()) ? ' ' + m[1].trim() : '');
    else if (/Windows/.test(ua)) os = 'Windows PC';
    else if (/CrOS/.test(ua)) os = 'Chromebook';
    else if (/Mac/.test(ua)) os = 'Mac';
    else if (/Linux/.test(ua)) os = 'Linux';
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
    return br ? os + ' · ' + br : os;
  }
  /** Panggil Pusat Perangkat (Apps Script milik admin). Tidak terpasang / gagal → null (login tetap jalan). */
  async function relay(params) {
    const base = KEYS && KEYS.reg; if (!base || !/^https:\/\/script\.google(usercontent)?\.com\//.test(base)) return null;
    let to = null;
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; if (ctl) to = setTimeout(() => ctl.abort(), 9000);
      const qs = Object.keys(params).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
      const r = await fetch(base + (base.includes('?') ? '&' : '?') + qs + '&_=' + Date.now(), { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      const j = await r.json(); return j && typeof j === 'object' ? j : null;
    } catch (e) { return null; } finally { if (to) clearTimeout(to); }
  }
  async function pingNow() {
    if (!SESS || !SESS.team) return;
    const r = await relay({ a: 'ping', id: devId(), n: SESS.name, l: devLabel(), x: SESS.exp });
    if (SESS && r && r.blocked) loggedOut('Akses perangkat ini diputus oleh admin. Hubungi admin untuk diaktifkan lagi.');
  }
  function mailAdminHref() {
    const body = 'Halo Admin,\n\nSaya ingin minta kode Authenticator untuk login Cari Jawaban Soal.\nNama: ' + ($('lgUser').value.trim() || '') + '\nToko/Area: \nPerangkat: ' + devLabel() + '\nID perangkat: ' + devId() + '\n\nTerima kasih.';
    return 'mailto:' + ADMIN_CONTACT.join(',') + '?subject=' + encodeURIComponent('Minta kode login Cari Jawaban Soal') + '&body=' + encodeURIComponent(body);
  }
  $('lgDev').textContent = devLabel() + ' · ID ' + devId();
  $('mailAdmin').addEventListener('click', () => { $('mailAdmin').href = mailAdminHref(); });
  $('mailAdmin').href = mailAdminHref(); $('lgUser').addEventListener('input', () => { $('mailAdmin').href = mailAdminHref(); });

  /** Login tim: HANYA kode 6 angka dari Google Authenticator admin (Authenticator tim yang tertanam di web ini).
      Nama boleh diisi supaya admin tahu siapa yang masuk. Kode diminta ke admin setiap kali login; sesi maksimal 2 jam. */
  async function loginTeam() {
    const raw = $('lgUser').value.trim(), codeRaw = $('lgPw').value;
    if (!codeRaw.trim()) return msg('msgTeam', 'Isi kode Authenticator 6 angka dari admin dulu.');
    if (raw.includes('@')) return loginAdminWith(raw.toLowerCase(), codeRaw, 'msgTeam');     // email diketik di kolom nama → login admin
    if (Date.now() < tLock) return msg('msgTeam', 'Terlalu banyak kode salah. Tunggu ' + Math.ceil((tLock - Date.now()) / 1000) + ' detik.');
    const digits = codeRaw.replace(/\D/g, '');
    if (digits.length !== 6) return msg('msgTeam', 'Kode harus 6 angka — minta kode terbaru ke admin.');
    $('btnLogin').disabled = true; msg('msgTeam', 'Memeriksa…', true);
    try {
      await refreshKeys(true);                                       // pakai data terbaru dari GitHub
      const T = KEYS.team;
      if (!T) return msg('msgTeam', 'Login tim belum diaktifkan admin. Hubungi admin lewat email di bawah.');
      if (!(await totpVerify(b32dec(T.s), digits))) {
        if (++tFails >= 5) { tFails = 0; tLock = Date.now() + 30000; }
        return msg('msgTeam', 'Kode salah atau sudah berganti. Minta kode terbaru ke admin (kode berubah tiap 30 detik).');
      }
      const dek = await C.unwrapDek(T, 'tpt|' + T.s, KEYS.iter);
      if (!dek) return msg('msgTeam', 'Data login tim rusak. Hubungi admin.');
      const st = await relay({ a: 'chk', id: devId() });
      if (st && st.blocked) return msg('msgTeam', 'Perangkat ini diputus oleh admin. Hubungi admin lewat email di bawah.');
      tFails = 0; $('lgPw').value = ''; msg('msgTeam', '');
      await startSession({ role: 'team', name: (raw || 'TIM').replace(/[\u0000-\u001f<>]/g, '').toUpperCase().slice(0, 30), team: 1, wrap: T.wrap }, dek);
    } finally { $('btnLogin').disabled = false; }
  }
  async function loginAdminWith(em, pw, msgId) {
    if (!em || !pw) return msg(msgId, 'Isi email dan password admin.');
    const btn = msgId === 'msgAdmin' ? $('btnAdmin') : $('btnLogin'); btn.disabled = true; msg(msgId, 'Memeriksa…', true);
    try {
      await refreshKeys(true);
      const h = await C.sha256hex(em), entry = KEYS.admins.find((x) => x.h === h);
      if (!entry) return msg(msgId, 'Email ini bukan admin. Anggota tim: kosongkan username atau isi nama akun, bukan email.');
      const dek = await C.unwrapDek(entry, C.adminSecret(em, pw), KEYS.iter);
      if (!dek) return msg(msgId, 'Password admin salah.');
      $('adPw').value = ''; $('lgPw').value = ''; msg(msgId, '');
      const info = { role: 'admin', name: 'Admin', email: em, h };
      if (entry.tp) {                                                  // Authenticator aktif → minta kode 6 angka
        const sec = await C.unwrapDek(entry.tp, 'tp|' + C.b64(dek), KEYS.iter);
        if (!sec) return msg(msgId, 'Data Authenticator rusak. Minta admin lain memakai “Reset Authenticator admin lain”.');
        return askTotp(info, dek, sec);
      }
      await startSession(info, dek);
    } finally { btn.disabled = false; }
  }
  const loginAdmin = () => loginAdminWith($('adEmail').value.trim().toLowerCase(), $('adPw').value, 'msgAdmin');
  $('btnLogin').onclick = loginTeam; $('btnAdmin').onclick = loginAdmin;
  $('lgPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') loginTeam(); });
  $('lgUser').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('lgPw').focus(); });
  $('adPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') loginAdmin(); });
  $('adEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('adPw').focus(); });
  $('btnLogout').onclick = () => loggedOut('Anda sudah keluar.');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); $('ovAi').classList.remove('show'); $('ovGate').classList.remove('show'); } });

  /* ====================== AUTHENTICATOR (TOTP, Google Authenticator) ====================== */
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function b32enc(u8) {
    let bits = 0, val = 0, out = '';
    for (const b of u8) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } val &= (1 << bits) - 1; }
    if (bits > 0) out += B32[(val << (5 - bits)) & 31];
    return out;
  }
  function b32dec(str) {
    let bits = 0, val = 0; const out = [];
    for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) { val = (val << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; val &= (1 << bits) - 1; } }
    return new Uint8Array(out);
  }
  async function totpCode(secretU8, step) {
    const msgb = new Uint8Array(8); let t = step; for (let i = 7; i >= 0; i--) { msgb[i] = t & 255; t = Math.floor(t / 256); }
    const key = await window.crypto.subtle.importKey('raw', secretU8, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const h = new Uint8Array(await window.crypto.subtle.sign('HMAC', key, msgb)), o = h[19] & 15;
    const n = (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000;
    return String(n).padStart(6, '0');
  }
  async function totpVerify(secretU8, code) {
    const c = String(code || '').replace(/\D/g, ''); if (c.length !== 6) return false;
    const st = Math.floor(Date.now() / 30000);
    for (const d of [0, -1, 1]) if (await totpCode(secretU8, st + d) === c) return true;      // toleransi selisih jam ±30 dtk
    return false;
  }
  function askTotp(info, dek, sec) {
    PEND = { info, dek, sec, fails: 0 }; $('totpCode').value = ''; msg('totpMsg', '');
    $('ovTotp').classList.add('show'); setTimeout(() => $('totpCode').focus(), 60);
  }
  async function submitTotp() {
    if (!PEND) return;
    if ($('totpCode').value.replace(/\D/g, '').length !== 6) return msg('totpMsg', 'Masukkan 6 angka dari aplikasi Authenticator.');
    $('totpGo').disabled = true;
    try {
      if (await totpVerify(PEND.sec, $('totpCode').value)) { const P = PEND; PEND = null; $('ovTotp').classList.remove('show'); $('totpCode').value = ''; return await startSession(P.info, P.dek); }
      if (++PEND.fails >= 5) { PEND = null; $('ovTotp').classList.remove('show'); msg('msgAdmin', 'Terlalu banyak kode salah. Login ulang.'); return msg('msgTeam', 'Terlalu banyak kode salah. Login ulang.'); }
      msg('totpMsg', 'Kode salah atau sudah berganti. Coba kode terbaru.');
    } finally { $('totpGo').disabled = false; }
  }
  $('totpGo').onclick = submitTotp;
  $('totpCancel').onclick = () => { PEND = null; $('ovTotp').classList.remove('show'); };
  $('totpCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitTotp(); });

  /* ====================== PANEL ADMIN ====================== */
  const keysText = () => { KEYS.updated = new Date().toISOString(); delete KEYS.invites; delete KEYS.users; KEYS.accounts = []; return 'window.CS_KEYS=' + JSON.stringify(KEYS) + ';\n'; };
  const adMsg = (html, cls) => { $('pubMsg').innerHTML = html ? '<div class="alert ' + (cls || 'ok') + '">' + html + '</div>' : ''; };

  $('mePwSave').onclick = async () => {
    const pw = $('mePw').value; if (pw.length < 8) return adMsg('Password admin minimal 8 karakter.', 'err');
    const i = KEYS.admins.findIndex((x) => x.h === SESS.h); if (i < 0) return adMsg('Entri admin tidak ditemukan.', 'err');
    KEYS.admins[i] = { h: SESS.h, ...(await C.wrapDek(DEK, C.adminSecret(SESS.email, pw), KEYS.iter)), ...(KEYS.admins[i].tp ? { tp: KEYS.admins[i].tp } : {}) };
    $('mePw').value = ''; await commitKeys('Password admin untuk <b>' + esc(SESS.email) + '</b> diganti.');
  };
  const fmtDate = (t) => new Date(t).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
  $('admAdd').onclick = async () => {
    const em = $('admNewEmail').value.trim().toLowerCase(), pw = $('admNewPw').value;
    if (!/^\S+@\S+\.\S+$/.test(em)) return adMsg('Email admin tidak valid.', 'err');
    if (pw.length < 8) return adMsg('Password admin minimal 8 karakter.', 'err');
    if (KEYS.admins.length >= 6) return adMsg('Maksimal 6 admin.', 'err');
    const h = await C.sha256hex(em), entry = { h, ...(await C.wrapDek(DEK, C.adminSecret(em, pw), KEYS.iter)) };
    const i = KEYS.admins.findIndex((x) => x.h === h); if (i >= 0) { if (KEYS.admins[i].tp) entry.tp = KEYS.admins[i].tp; KEYS.admins[i] = entry; } else KEYS.admins.push(entry);
    $('admNewEmail').value = ''; $('admNewPw').value = ''; await commitKeys('Admin <b>' + esc(em) + '</b> disimpan.');
  };
  const qrSvg = (uri) => { try { const q = window.qrcode(0, 'M'); q.addData(uri); q.make(); return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch (e) { return ''; } };
  const teamUri = (key) => 'otpauth://totp/' + encodeURIComponent('Cari Jawaban Soal:Tim') + '?secret=' + key + '&issuer=' + encodeURIComponent('Cari Jawaban Soal') + '&algorithm=SHA1&digits=6&period=30';

  /* ---------- Authenticator tim: satu Authenticator milik admin, dipakai semua anggota tim untuk login ---------- */
  function renderTeam() {
    const T = KEYS.team, on = !!T; TMSETUP = null; show($('tmSetup'), false);
    $('tmState').className = 'alert ' + (on ? 'ok' : 'warn');
    $('tmState').innerHTML = on ? '🟢 <b>Authenticator tim aktif</b> — anggota tim login hanya dengan kode 6 angka dari Authenticator admin ini. Dibuat ' + (T.at ? esc(fmtDate(T.at)) : '—') + '.' : '⚪ <b>Belum dibuat.</b> Buat dulu supaya anggota tim bisa login memakai kode dari admin.';
    if (on && tokenOk !== true) { $('tmState').className = 'alert warn'; $('tmState').innerHTML += '<br>⚠️ <b>Belum terbit ke GitHub</b> — anggota tim belum bisa login sampai token GitHub diterima (tab “Terbitkan ke GitHub” → isi token → <b>Terbitkan pengaturan</b>).'; }
    show($('tmOn'), on); $('tmStart').textContent = on ? 'Ganti Authenticator tim (putuskan semua)' : 'Buat Authenticator tim';
    if (on) { $('tmQr').innerHTML = qrSvg(teamUri(T.s)) || ''; $('tmKey').textContent = T.s.match(/.{1,4}/g).join(' '); tmTick(); }
  }
  async function tmTick() {
    const T = KEYS && KEYS.team; if (!T || $('tab-tm').classList.contains('hidden')) return;
    const now = Date.now(), code = await totpCode(b32dec(T.s), Math.floor(now / 30000));
    $('tmLive').textContent = code.slice(0, 3) + ' ' + code.slice(3); $('tmLeft').textContent = 30 - Math.floor(now / 1000) % 30;
  }
  $('tmStart').onclick = () => {
    if (KEYS.team && !confirm('Semua anggota tim yang sedang login akan keluar, dan semua admin harus memindai QR baru. Lanjutkan?')) return;
    TMSETUP = C.rnd(20); const key = b32enc(TMSETUP);
    $('tmQrNew').innerHTML = qrSvg(teamUri(key)) || '<div class="note" style="color:#111">QR gagal dibuat — ketik kunci manual di bawah.</div>';
    $('tmKeyNew').textContent = key.match(/.{1,4}/g).join(' '); $('tmCodeIn').value = ''; show($('tmSetup'), true);
  };
  $('tmConfirm').onclick = async () => {
    if (!TMSETUP) return;
    if (!(await totpVerify(TMSETUP, $('tmCodeIn').value))) return adMsg('Kode belum cocok. Pastikan jam HP otomatis, lalu coba kode terbaru.', 'err');
    const key = b32enc(TMSETUP);
    KEYS.team = { s: key, ...(await C.wrapDek(DEK, 'tpt|' + key, KEYS.iter)), at: new Date().toISOString() };
    TMSETUP = null; renderTeam();
    await commitKeys('Authenticator tim aktif. Anggota tim login dengan kode 6 angka dari Authenticator ini.');
  };
  $('tmCopy').onclick = async () => { try { await navigator.clipboard.writeText($('tmLive').textContent.replace(/\s/g, '')); $('tmCopy').textContent = 'Tersalin ✓'; setTimeout(() => { $('tmCopy').textContent = 'Salin kode'; }, 1500); } catch (e) { /* diblokir */ } };

  /* ---------- Perangkat: daftar HP/PC yang terhubung + putuskan kapan saja (butuh Pusat Perangkat) ---------- */
  const regKey = () => ($('regKey').value || '').trim() || ss.get('cs_reg_key') || ls.get('cs_reg_key_p') || '';
  function renderDevices() {
    const on = !!KEYS.reg; show($('devSetup'), !on || $('devCfgOpen').dataset.open === '1'); show($('devList'), on);
    $('regUrl').value = KEYS.reg || ''; $('regKey').value = ss.get('cs_reg_key') || ls.get('cs_reg_key_p') || ''; $('regRemember').checked = !!ls.get('cs_reg_key_p');
    if (on) loadDevices();
  }
  const ago = (t) => { const d = Math.max(0, Math.floor((Date.now() - t) / 1000)); return d < 60 ? d + ' dtk lalu' : d < 3600 ? Math.floor(d / 60) + ' mnt lalu' : d < 86400 ? Math.floor(d / 3600) + ' jam lalu' : fmtDate(t); };
  async function loadDevices(quiet) {
    if (!KEYS.reg) return; if (!quiet) $('devTbl').innerHTML = '<tr><td class="note"><span class="spin"></span>Memuat perangkat…</td></tr>';
    const r = await relay({ a: 'list', k: regKey() });
    if (!r) { $('devTbl').innerHTML = '<tr><td class="note">Tidak bisa menghubungi Pusat Perangkat. Cek alamat Apps Script & pengaturan akses “Siapa saja”.</td></tr>'; return; }
    if (!r.ok) { $('devTbl').innerHTML = '<tr><td class="note">' + (r.err === 'key' ? 'Kunci admin salah / belum diisi. Buka “Pengaturan Pusat Perangkat”.' : esc(r.err || 'Gagal memuat.')) + '</td></tr>'; return; }
    DEVS = (r.list || []).slice().sort((a, b) => (b.t || 0) - (a.t || 0));
    const now = Date.now(), online = (d) => !d.b && !d.o && d.x > now && now - d.t < 120000;
    $('devCount').textContent = DEVS.filter(online).length + ' online · ' + DEVS.length + ' tercatat';
    $('devTbl').innerHTML = DEVS.length ? '<tr><th>Nama</th><th>Perangkat</th><th>Masuk</th><th>Terakhir aktif</th><th>Status</th><th></th></tr>' + DEVS.map((d) =>
      '<tr><td><b>' + esc(d.n || '—') + '</b><div class="note" style="margin:0">ID ' + esc(d.id) + '</div></td><td>' + esc(d.l || '—') + '</td><td>' + (d.f ? esc(fmtDate(d.f)) : '—') + '</td><td>' + (d.t ? ago(d.t) : '—') + '</td><td>' +
      (d.b ? '🔴 Diputus' : online(d) ? '🟢 Online' : '⚪ ' + (d.o ? 'Keluar' : 'Offline')) + '</td><td style="white-space:nowrap">' +
      (d.b ? '<button class="btn btn-sm btn-acc" data-dev="unblock" data-id="' + esc(d.id) + '">Izinkan lagi</button>' : '<button class="btn btn-sm btn-danger" data-dev="block" data-id="' + esc(d.id) + '">Putuskan</button>') +
      ' <button class="btn btn-sm" data-dev="del" data-id="' + esc(d.id) + '">Hapus</button></td></tr>').join('') : '<tr><td class="note">Belum ada perangkat tim yang login.</td></tr>';
  }
  $('devTbl').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dev]'); if (!b) return;
    const op = b.dataset.dev, id = b.dataset.id;
    if (op === 'del' && !confirm('Hapus catatan perangkat ini? (Bila sedang diputus, ia bisa login lagi.)')) return;
    b.disabled = true; const r = await relay({ a: op, id, k: regKey() });
    if (!r || !r.ok) adMsg('Gagal menghubungi Pusat Perangkat' + (r && r.err ? ': ' + esc(r.err) : '') + '.', 'err');
    else adMsg(op === 'block' ? 'Perangkat <b>' + esc(id) + '</b> diputus — ia keluar otomatis dalam ±45 detik dan tidak bisa login lagi sampai diizinkan.' : op === 'unblock' ? 'Perangkat <b>' + esc(id) + '</b> diizinkan lagi (perlu kode baru dari admin).' : 'Catatan perangkat dihapus.', 'ok');
    loadDevices(true);
  });
  $('devRefresh').onclick = () => loadDevices();
  $('devCutAll').onclick = async () => {
    const now = Date.now(), live = DEVS.filter((d) => !d.b && !d.o && d.x > now && now - d.t < 120000);
    if (!live.length) return adMsg('Tidak ada perangkat online.', 'warn');
    if (!confirm('Putuskan ' + live.length + ' perangkat yang sedang online?')) return;
    for (const d of live) await relay({ a: 'block', id: d.id, k: regKey() });
    adMsg(live.length + ' perangkat diputus.', 'ok'); loadDevices(true);
  };
  $('devCfgOpen').onclick = () => { $('devCfgOpen').dataset.open = $('devCfgOpen').dataset.open === '1' ? '0' : '1'; show($('devSetup'), $('devCfgOpen').dataset.open === '1' || !KEYS.reg); };
  $('regSave').onclick = async () => {
    const url = $('regUrl').value.trim(), key = $('regKey').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\/\S+$/.test(url)) return adMsg('Alamat harus berawalan https://script.google.com/… (alamat Web app hasil Deploy).', 'err');
    if (key.length < 8) return adMsg('Isi kunci admin (sama dengan ADMIN_KEY di Apps Script, min. 8 karakter).', 'err');
    ss.set('cs_reg_key', key); if ($('regRemember').checked) ls.set('cs_reg_key_p', key); else ls.del('cs_reg_key_p');
    const test = await (async () => { const old = KEYS.reg; KEYS.reg = url; const r = await relay({ a: 'list', k: key }); if (!r || !r.ok) KEYS.reg = old; return r; })();
    if (!test) return adMsg('Tidak ada respons dari alamat itu. Pastikan sudah di-Deploy sebagai Web app dengan akses “Siapa saja”.', 'err');
    if (!test.ok) return adMsg(test.err === 'key' ? 'Kunci admin tidak cocok dengan ADMIN_KEY di Apps Script.' : 'Ditolak: ' + esc(test.err || ''), 'err');
    $('devCfgOpen').dataset.open = '0'; renderDevices();
    await commitKeys('Pusat Perangkat terhubung. Perangkat tim akan muncul di daftar setelah login.');
  };
  $('regCopy').onclick = async () => { try { const t = await (await fetch('tools/Code.gs', { cache: 'no-store' })).text(); await navigator.clipboard.writeText(t); $('regCopy').textContent = 'Kode tersalin ✓'; } catch (e) { adMsg('Tidak bisa menyalin otomatis. Buka berkas <code>tools/Code.gs</code> di repo lalu salin isinya.', 'warn'); } };

  function renderTotp() {
    const me = KEYS.admins.find((x) => x.h === SESS.h), on = !!(me && me.tp);
    $('totpState').className = 'alert ' + (on ? 'ok' : 'warn');
    $('totpState').innerHTML = on ? '🟢 <b>Authenticator aktif</b> untuk ' + esc(SESS.email) + ' — setiap login admin meminta kode 6 angka setelah password.' : '⚪ Belum terhubung untuk ' + esc(SESS.email) + '.';
    show($('totpOff'), on); $('totpStart').textContent = on ? 'Hubungkan ulang (ganti HP)' : 'Hubungkan Google Authenticator';
    show($('totpSetup'), false); TSETUP = null;
  }
  $('totpStart').onclick = () => {
    TSETUP = C.rnd(20); const key = b32enc(TSETUP);
    const uri = 'otpauth://totp/' + encodeURIComponent('Cari Jawaban Soal:' + SESS.email) + '?secret=' + key + '&issuer=' + encodeURIComponent('Cari Jawaban Soal') + '&algorithm=SHA1&digits=6&period=30';
    let img = ''; try { const q = window.qrcode(0, 'M'); q.addData(uri); q.make(); img = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch (e) { img = ''; }
    $('totpQr').innerHTML = img || '<div class="note" style="color:#111">QR gagal dibuat — ketik kunci manual di bawah.</div>';
    $('totpKey').textContent = key.match(/.{1,4}/g).join(' '); $('totpCodeIn').value = ''; show($('totpSetup'), true);
  };
  $('totpConfirm').onclick = async () => {
    if (!TSETUP) return;
    if (!(await totpVerify(TSETUP, $('totpCodeIn').value))) return adMsg('Kode belum cocok. Pastikan jam HP otomatis, lalu coba kode terbaru.', 'err');
    const i = KEYS.admins.findIndex((x) => x.h === SESS.h); if (i < 0) return;
    KEYS.admins[i] = { ...KEYS.admins[i], tp: await C.wrapDek(TSETUP, 'tp|' + C.b64(DEK), KEYS.iter) };
    TSETUP = null; renderTotp();
    await commitKeys('Authenticator terhubung untuk <b>' + esc(SESS.email) + '</b>. Login admin berikutnya meminta kode 6 angka.');
  };
  $('totpOffBtn').onclick = async () => {
    const i = KEYS.admins.findIndex((x) => x.h === SESS.h); if (i < 0) return; delete KEYS.admins[i].tp; renderTotp();
    await commitKeys('Authenticator dimatikan untuk <b>' + esc(SESS.email) + '</b>.');
  };
  $('totpResetOthers').onclick = async () => {
    if (!confirm('Matikan Authenticator semua admin lain? Mereka bisa hubungkan ulang setelah login.')) return;
    KEYS.admins.forEach((x) => { if (x.h !== SESS.h) delete x.tp; });
    await commitKeys('Authenticator admin lain direset.');
  };
  function showTab(t) {
    if (t === 'pub-hint') t = 'dev';
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    ['dev', 'tm', 'tot', 'me', 'pub'].forEach((x) => show($('tab-' + x), t === x));
    clearInterval(tmT); clearInterval(devT);
    if (t === 'tm') { tmTick(); tmT = setInterval(tmTick, 1000); }
    if (t === 'dev') devT = setInterval(() => { if (KEYS && KEYS.reg) loadDevices(true); }, 15000);
  }
  document.querySelectorAll('.tab').forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });
  async function openAdminPanel() {
    await refreshKeys(true);                                         // mulai dari data akun terbaru
    KEYS = JSON.parse(JSON.stringify(KEYS)); $('meEmail').textContent = SESS.email; $('rotAdmin').value = ''; $('rotEmails').value = SESS.email;
    const h = location.hostname, seg = location.pathname.split('/').filter(Boolean)[0];
    const owner = ls.get('cs_gh_owner') || (h.endsWith('.github.io') ? h.split('.')[0] : '');
    $('ghOwner').value = owner; $('ghRepo').value = ls.get('cs_gh_repo') || (h.endsWith('.github.io') ? (seg && !/\.html?$/.test(seg) ? seg : owner + '.github.io') : '');
    $('ghBranch').value = ls.get('cs_gh_branch') || 'main'; $('ghToken').value = ss.get('cs_gh_token') || ls.get('cs_gh_token_p') || ''; $('ghRemember').checked = !!ls.get('cs_gh_token_p');
    renderTotp(); renderTeam(); adMsg(''); syncBar(); $('ovAdmin').classList.add('show'); showTab('dev'); renderDevices();
  }
  function openGate() { $('gatePw').value = ''; msg('gateMsg', ''); $('gateEmail').textContent = SESS.email; $('ovGate').classList.add('show'); setTimeout(() => $('gatePw').focus(), 60); }
  async function submitGate() {
    if (Date.now() < gateLock) return msg('gateMsg', 'Terlalu banyak percobaan. Tunggu ' + Math.ceil((gateLock - Date.now()) / 1000) + ' detik.');
    const pw = $('gatePw').value; if (!pw) return msg('gateMsg', 'Isi password admin.');
    $('gateGo').disabled = true; msg('gateMsg', 'Memeriksa…', true);
    try {
      const entry = KEYS.admins.find((x) => x.h === SESS.h), dek = entry && await C.unwrapDek(entry, C.adminSecret(SESS.email, pw), KEYS.iter);
      if (!dek) { if (++gateFails >= 5) { gateFails = 0; gateLock = Date.now() + 30000; } return msg('gateMsg', 'Password admin salah.'); }
      gateFails = 0; gateUntil = Date.now() + 5 * 60 * 1000; $('gatePw').value = ''; msg('gateMsg', ''); $('ovGate').classList.remove('show'); await openAdminPanel();
    } finally { $('gateGo').disabled = false; }
  }
  $('btnAdminPanel').onclick = () => (Date.now() < gateUntil ? openAdminPanel() : openGate());
  $('gateGo').onclick = submitGate; $('gateClose').onclick = () => $('ovGate').classList.remove('show');
  $('gatePw').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitGate(); });
  $('adClose').onclick = () => { clearInterval(tmT); clearInterval(devT); $('ovAdmin').classList.remove('show'); };

  const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  async function bankText(dek) {
    const e = ENT.map((x) => [x.q, ...x.answers]);
    const meta = { n: e.length, source: (META && META.source || 'Bank soal').replace(/ \+ unggahan admin$/, '') + (LOCAL_ADDED ? ' + unggahan admin' : ''), built: new Date().toISOString().slice(0, 16).replace('T', ' ') };
    return 'window.CS_BANK="' + C.b64(await C.encryptBank({ meta, e }, dek)) + '";\n';
  }
  const ghCfg = () => {
    const d = ghDefaults();
    const c = { owner: $('ghOwner').value.trim() || d.owner, repo: $('ghRepo').value.trim() || d.repo, branch: $('ghBranch').value.trim() || d.branch, token: $('ghToken').value.trim() || ss.get('cs_gh_token') || ls.get('cs_gh_token_p') || '' };
    if (!c.owner || !c.repo || !c.token) throw new Error('Isi pemilik, nama repo, dan token GitHub dulu.');
    ls.set('cs_gh_owner', c.owner); ls.set('cs_gh_repo', c.repo); ls.set('cs_gh_branch', c.branch); ss.set('cs_gh_token', c.token);
    if ($('ghRemember').checked) ls.set('cs_gh_token_p', c.token); else ls.del('cs_gh_token_p');
    return c;
  };
  /** Ubah penolakan GitHub menjadi petunjuk perbaikan yang jelas (token salah akun / izin kurang). */
  async function ghFail(cfg, status, message) {
    let who = '', bad = false;
    try {
      const u = await fetch('https://api.github.com/user', { headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json' } });
      if (u.ok) who = (await u.json()).login || ''; else if (u.status === 401) bad = true;
    } catch (e) { /* abaikan */ }
    tokenOk = false;
    const steps = [];
    if (bad) steps.push('Token <b>tidak valid</b> (salah tempel, sudah kedaluwarsa, atau dihapus). Buat token baru.');
    else {
      if (who && cfg.owner && who.toLowerCase() !== cfg.owner.toLowerCase()) steps.push('Token ini milik akun <b>' + esc(who) + '</b>, sedangkan repo milik <b>' + esc(cfg.owner) + '</b>. Buat token dari akun <b>' + esc(cfg.owner) + '</b>.');
      steps.push('Buka github.com/settings/personal-access-tokens → klik token Anda → <b>Repository access</b>: pilih repo <b>' + esc(cfg.repo) + '</b> → <b>Permissions → Contents = Read and write</b> → Update. Cara termudah: buat <i>Tokens (classic)</i> dengan centang <b>repo</b>.');
      steps.push('Pastikan kolom Pemilik, Nama repo, dan Branch di atas sudah benar.');
    }
    const err = new Error('GitHub menolak (' + status + (message ? ': ' + message : '') + ').');
    err.html = 'GitHub menolak (' + status + (message ? ': ' + esc(message) : '') + '). Yang perlu dicek:<ul style="margin:6px 0 0 18px;padding:0">' + steps.map((x) => '<li>' + x + '</li>').join('') + '</ul>';
    syncBar();
    return err;
  }
  async function ghPut(cfg, path, text, message) {
    const url = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) + '/contents/' + path;
    const h = { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    let sha; const g = await fetch(url + '?ref=' + encodeURIComponent(cfg.branch), { headers: h });
    if (g.ok) sha = (await g.json()).sha; else if (g.status !== 404) throw await ghFail(cfg, g.status, '');
    const content = C.b64(new TextEncoder().encode(text));
    const r = await fetch(url, { method: 'PUT', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ message, content, branch: cfg.branch, ...(sha ? { sha } : {}) }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw await ghFail(cfg, r.status, j.message || ''); }
  }
  const busy = (btn, on) => { btn.disabled = on; };
  const tokenReady = () => !!(($('ghToken').value || '').trim() || ss.get('cs_gh_token') || ls.get('cs_gh_token_p'));
  function syncBar() {
    const b = $('syncState');
    if (!tokenReady()) { b.className = 'alert warn'; b.innerHTML = '🔴 <b>Belum aktif</b> — isi <b>token GitHub</b> sekali di tab “Terbitkan ke GitHub” agar perubahan akun & kode langsung berlaku (tanpa deploy).'; }
    else if (tokenOk === true) { b.className = 'alert ok'; b.innerHTML = '🟢 <b>Sinkron langsung aktif</b> — token diterima GitHub. Perubahan akun & kode langsung berlaku tanpa deploy ulang.'; }
    else if (tokenOk === false) { b.className = 'alert err'; b.innerHTML = '🔴 <b>Token ditolak GitHub</b> — ikuti petunjuk perbaikan di bawah, lalu klik “Terbitkan pengaturan” lagi.'; }
    else { b.className = 'alert warn'; b.innerHTML = '🟡 <b>Token terisi, belum diuji</b> — klik <b>Terbitkan pengaturan</b> (tab Terbitkan ke GitHub) sekali untuk mengujinya.'; }
  }
  $('ghToken').addEventListener('change', () => { const v = $('ghToken').value.trim(); tokenOk = null; if (v) { ss.set('cs_gh_token', v); if ($('ghRemember').checked) ls.set('cs_gh_token_p', v); } syncBar(); });
  $('ghRemember').addEventListener('change', () => { const v = $('ghToken').value.trim(); if ($('ghRemember').checked && v) ls.set('cs_gh_token_p', v); else ls.del('cs_gh_token_p'); });
  /** Simpan keys.js ke GitHub sekarang juga; pengguna membacanya langsung dari GitHub (tanpa menunggu Pages). */
  async function commitKeys(okHtml) {
    adminDirty = true;
    if (!tokenReady()) { adMsg(okHtml + '<br>⚠️ <b>Belum aktif untuk pengguna.</b> Isi token GitHub di tab “Terbitkan ke GitHub” (cukup sekali per sesi), lalu klik <b>Terbitkan pengaturan</b>. Berikutnya otomatis.', 'warn'); return false; }
    try {
      const cfg = ghCfg(); adMsg('<span class="spin"></span>Mengaktifkan…', 'warn');
      await ghPut(cfg, 'data/keys.js', keysText(), 'Admin: perbarui akun & kode pengguna');
      adminDirty = false; liveAt = 0; tokenOk = true; syncBar();
      adMsg(okHtml + '<br>✅ <b>Langsung aktif</b> — tidak perlu deploy ulang. Pengguna yang sedang login ikut diperbarui dalam ±1 menit.', 'ok'); return true;
    } catch (e) { adMsg(okHtml + '<br>❌ Gagal mengaktifkan: ' + (e.html || esc(e.message)), 'err'); return false; }
  }
  $('pubKeys').onclick = async () => {
    busy($('pubKeys'), true); adMsg('<span class="spin"></span>Menyimpan akun ke GitHub…', 'warn');
    try { await ghPut(ghCfg(), 'data/keys.js', keysText(), 'Admin: perbarui akun & password tim'); adminDirty = false; liveAt = 0; tokenOk = true; syncBar(); adMsg('✅ Tersimpan di GitHub dan <b>langsung berlaku</b> (tanpa menunggu deploy). Akun yang dihapus / password yang diganti otomatis nonaktif di perangkat pengguna dalam ±1 menit. Mulai sekarang perubahan akun & kode otomatis tersimpan.', 'ok'); }
    catch (e) { adMsg('❌ ' + (e.html || esc(e.message)), 'err'); } finally { busy($('pubKeys'), false); }
  };
  $('pubBank').onclick = async () => {
    busy($('pubBank'), true); adMsg('<span class="spin"></span>Mengenkripsi dan menyimpan data soal…', 'warn');
    try { const text = await bankText(DEK); await ghPut(ghCfg(), 'data/bank.js', text, 'Admin: perbarui data soal (' + ENT.length + ' soal)'); adMsg('✅ Data soal (' + ENT.length.toLocaleString('id-ID') + ') tersimpan di GitHub. Terlihat oleh semua pengguna setelah ±1 menit.', 'ok'); }
    catch (e) { adMsg('❌ ' + (e.html || esc(e.message)), 'err'); } finally { busy($('pubBank'), false); }
  };
  $('dlKeys').onclick = () => { download('keys.js', keysText()); adMsg('keys.js terunduh. Ganti file <code>data/keys.js</code> di repo GitHub dengan file ini.', 'ok'); };
  $('dlBank').onclick = async () => { download('bank.js', await bankText(DEK)); adMsg('bank.js terunduh. Ganti file <code>data/bank.js</code> di repo GitHub dengan file ini.', 'ok'); };
  $('rotGo').onclick = async () => {
    const adm = $('rotAdmin').value;
    if (adm.length < 8) return adMsg('Isi password admin baru (min 8 karakter).', 'err');
    if (!confirm('Rotasi penuh: kunci data baru, bank soal dienkripsi ulang, Authenticator tim diganti, dan semua perangkat tim keluar. Lanjutkan?')) return;
    busy($('rotGo'), true); adMsg('<span class="spin"></span>Rotasi kunci & menerbitkan…', 'warn');
    try {
      const cfg = ghCfg(), nd = C.rnd(32), emails = $('rotEmails').value.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^\S+@\S+\.\S+$/.test(x));
      if (!emails.includes(SESS.email)) throw new Error('Email admin yang sedang masuk harus ada di daftar.');
      const nk = { v: 1, iter: KEYS.iter, updated: '', accounts: [], admins: [], ...(KEYS.reg ? { reg: KEYS.reg } : {}) };
      for (const em of [...new Set(emails)]) nk.admins.push({ h: await C.sha256hex(em), ...(await C.wrapDek(nd, C.adminSecret(em, adm), KEYS.iter)) });
      const sec = C.rnd(20), key = b32enc(sec); nk.team = { s: key, ...(await C.wrapDek(nd, 'tpt|' + key, KEYS.iter)), at: new Date().toISOString() };
      if (AI_SHARED) nk.ai = C.b64(await C.encryptBank(AI_SHARED, nd));
      const btext = await bankText(nd);
      await ghPut(cfg, 'data/bank.js', btext, 'Admin: rotasi kunci (bank terenkripsi ulang)');
      KEYS = nk; DEK = nd; await ghPut(cfg, 'data/keys.js', keysText(), 'Admin: rotasi kunci (admin & Authenticator tim baru)');
      SESS.exp = Math.min(SESS.exp, Date.now() + SESSION_MS); saveSess(nd); renderTeam(); renderTotp();
      adMsg('✅ Rotasi selesai: kunci data baru, password admin baru, dan <b>Authenticator tim baru</b> sudah diterbitkan. Buka tab “Authenticator tim” → pindai QR baru. Authenticator admin pribadi perlu dihubungkan ulang.', 'ok');
    } catch (e) { adMsg('❌ ' + (e.html || esc(e.message)), 'err'); } finally { busy($('rotGo'), false); }
  };

  /* ====================== BOOT ====================== */
  refreshAi();
  KEYS = window.CS_KEYS ? JSON.parse(JSON.stringify(window.CS_KEYS)) : null;
  show($('lgWarn'), location.protocol === 'file:');
  (async function boot() {
    if (!KEYS) { msg('msgTeam', 'File data/keys.js tidak ditemukan di hosting.'); return; }
    refreshKeys(true);
    try {
      const s = loadSess();
      if (s) { SESS = { role: s.role, name: s.name, email: s.email, h: s.h, team: s.team, wrap: s.wrap, exp: s.exp }; DEK = C.unb64(s.dek); await enter(); }
    } catch (e) { /* sesi tidak valid → tetap di layar login */ }
  })();

  window.CS = { get ENT() { return ENT; }, get KEYS() { return KEYS; }, get DEK() { return DEK; }, get LOCAL_ADDED() { return LOCAL_ADDED; }, searchText, splitQuestions, cleanQuery, addPairs, handleFiles };
})();
