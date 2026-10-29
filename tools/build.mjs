#!/usr/bin/env node
// Pembangun data awal (opsional — admin juga bisa melakukan semuanya dari panel Admin di web).
//   node tools/build.mjs entries.json "label sumber"
// Menghasilkan data/bank.js (bank soal terenkripsi) dan data/keys.js (kunci per akun).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../assets/crypto.js');

const entriesFile = process.argv[2], label = process.argv[3] || 'Bank soal';
// Password TIDAK ditulis di berkas ini (repo bisa publik). Berikan lewat variabel lingkungan:
//   CS_TEAM="shanum:SHANUM:sandi1;balqis:BALQIS:sandi2"  CS_ADMIN_EMAILS="a@x.com,b@y.com"  CS_ADMIN_PASSWORD="sandiadmin"
if (!process.env.CS_TEAM || !process.env.CS_ADMIN_EMAILS || !process.env.CS_ADMIN_PASSWORD) { console.error('Isi CS_TEAM, CS_ADMIN_EMAILS, CS_ADMIN_PASSWORD (lihat komentar di berkas ini).'); process.exit(1); }
const TEAM = process.env.CS_TEAM.split(';').map((x) => { const [id, name, ...pw] = x.split(':'); return { id, name, password: pw.join(':') }; });
const ADMIN_EMAILS = process.env.CS_ADMIN_EMAILS.split(',').map((x) => x.trim()).filter(Boolean);
const ADMIN_PASSWORD = process.env.CS_ADMIN_PASSWORD;

const entries = JSON.parse(fs.readFileSync(entriesFile, 'utf8'));
const dek = C.rnd(32);
const bank = { meta: { n: entries.length, source: label, built: new Date().toISOString().slice(0, 16).replace('T', ' ') }, e: entries };
const blob = await C.encryptBank(bank, dek);
fs.writeFileSync(new URL('../data/bank.js', import.meta.url), 'window.CS_BANK="' + C.b64(blob) + '";\n');

const keys = { v: 1, iter: C.ITER, updated: new Date().toISOString(), accounts: [], admins: [] };
for (const t of TEAM) keys.accounts.push({ id: t.id, name: t.name, ...(await C.wrapDek(dek, C.normTeam(t.password))) });
for (const em of ADMIN_EMAILS) keys.admins.push({ h: await C.sha256hex(em.toLowerCase()), ...(await C.wrapDek(dek, C.adminSecret(em, ADMIN_PASSWORD))) });
fs.writeFileSync(new URL('../data/keys.js', import.meta.url), 'window.CS_KEYS=' + JSON.stringify(keys) + ';\n');
console.log('soal:', entries.length, '| bank.js:', (fs.statSync(new URL('../data/bank.js', import.meta.url)).size / 1e6).toFixed(2), 'MB');
