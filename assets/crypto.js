/* Kunci & enkripsi bank soal (WebCrypto). Dipakai di browser dan di Node (uji/pembangun).
   - Bank soal dienkripsi AES-256-GCM dengan kunci data (DEK) acak.
   - DEK "dibungkus" (dienkripsi) terpisah oleh kunci turunan password (PBKDF2-SHA256) per akun.
   - Ganti password = bungkus ulang DEK saja (bank tidak perlu dienkripsi ulang). */
(function (root) {
  'use strict';
  const subtle = (root.crypto || require('node:crypto').webcrypto).subtle;
  const rnd = (n) => (root.crypto || require('node:crypto').webcrypto).getRandomValues(new Uint8Array(n));
  const enc = new TextEncoder(), dec = new TextDecoder();
  const ITER = 600000;

  function b64(u8) {
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  function unb64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  const concat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

  async function sha256hex(text) {
    const h = new Uint8Array(await subtle.digest('SHA-256', enc.encode(text)));
    return [...h].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  async function kek(secret, saltU8, iter) {
    const base = await subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: saltU8, iterations: iter || ITER }, base,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const normTeam = (pw) => String(pw || '').trim().toLowerCase();          // password tim: huruf besar/kecil tidak dibedakan
  const adminSecret = (email, pw) => String(email || '').trim().toLowerCase() + '|' + String(pw || '');

  async function wrapDek(dekU8, secret, iter) {
    const salt = rnd(16), iv = rnd(12);
    const k = await kek(secret, salt, iter);
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, k, dekU8));
    return { salt: b64(salt), iv: b64(iv), wrap: b64(ct) };
  }
  async function unwrapDek(entry, secret, iter) {
    try {
      const k = await kek(secret, unb64(entry.salt), iter);
      return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(entry.iv) }, k, unb64(entry.wrap)));
    } catch (e) { return null; }
  }
  const dekKey = (dekU8, usage) => subtle.importKey('raw', dekU8, 'AES-GCM', false, usage);

  async function gzip(u8) {
    const s = new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function gunzip(u8) {
    const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  /** bank = {meta, e:[[soal, jawaban...]...]} → Uint8Array(iv || ciphertext) */
  async function encryptBank(bank, dekU8) {
    const iv = rnd(12);
    const plain = await gzip(enc.encode(JSON.stringify(bank)));
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, await dekKey(dekU8, ['encrypt']), plain));
    return concat(iv, ct);
  }
  async function decryptBank(blobU8, dekU8) {
    const iv = blobU8.subarray(0, 12), ct = blobU8.subarray(12);
    const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, await dekKey(dekU8, ['decrypt']), ct));
    return JSON.parse(dec.decode(await gunzip(plain)));
  }

  const api = { ITER, b64, unb64, sha256hex, normTeam, adminSecret, wrapDek, unwrapDek, encryptBank, decryptBank, rnd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CSCrypto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
