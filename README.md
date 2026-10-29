# Cari Jawaban Soal — versi GitHub Pages (hosting statis, tanpa server)

Bank soal **17.751 soal** (data lama tidak diubah + 780 soal baru dari 10 file Excel terbaru), login password tim,
panel Admin untuk mengganti password, baca 1–50 soal sekaligus, soal dari gambar, unggah Excel, referensi AI.

## A. Pasang di GitHub Pages (±5 menit)
1. Buka https://github.com → **New repository** → nama bebas (mis. `cari-soal`) → **Public** → Create.
2. Di halaman repo klik **uploading an existing file**, lalu **tarik ISI folder ini** (bukan zip-nya): `index.html`, folder `assets`, folder `data`, folder `tools`, folder `test`, `README.md`, dan `.nojekyll`.
   Pastikan folder `data` ikut (isinya `bank.js` dan `keys.js`). Klik **Commit changes**.
3. **Settings → Pages** → *Build and deployment* → Source: **Deploy from a branch** → Branch: `main` / folder `/ (root)` → **Save**.
4. Tunggu 1–2 menit. Alamatnya: `https://USERNAME.github.io/NAMA-REPO/`.

## B. Login (versi Authenticator tim)
- **Anggota tim (mis. Ari):** isi nama (opsional) + **kode 6 angka dari Google Authenticator admin**. Tanpa password. Kode **diminta ke admin setiap login** (berubah tiap 30 detik). Sesi maksimal **2 jam**, atau sampai admin memutus perangkatnya.
- Belum punya kontak admin? Tautan **Hubungi admin lewat email** di layar login membuka email berisi nama, jenis perangkat, dan ID perangkat.
- **Admin:** “Masuk sebagai Admin” → email + password admin → kode Authenticator admin pribadi (bila sudah dihubungkan). Tidak berubah.

### Pasang pertama kali
1. Unggah hanya `index.html`, folder `assets`, `tools/Code.gs`, `README.md` (**jangan menimpa folder `data/`** — berisi akun & kunci terbaru dari panel Admin).
2. Login Admin → ⚙️ Admin → tab **Authenticator tim** → *Buat Authenticator tim* → pindai QR → konfirmasi. Tab itu juga menampilkan **kode saat ini** untuk diberikan ke anggota tim (perlu token GitHub agar langsung aktif).
3. Tab **Perangkat** → pasang **Pusat Perangkat** (Apps Script gratis, sekali): tempel `tools/Code.gs`, ganti `ADMIN_KEY`, Deploy → Web app (Execute as *Me*, access *Anyone*), tempel alamat `/exec` + kunci di panel → *Simpan & hubungkan*.

### Perangkat & memutus
Tab **Perangkat** menampilkan nama, jenis HP/PC (mis. “Android SM-S918B · Chrome”, “iPhone · Safari”), waktu masuk, terakhir aktif, dan status 🟢/⚪/🔴. **Putuskan** → perangkat keluar otomatis ±45 detik dan ditolak login sampai **Izinkan lagi**. **Ganti Authenticator tim** memutus semua sekaligus.

### Catatan keamanan (jujur)
Hosting statis tidak punya server, jadi rahasia Authenticator tim ikut tersimpan di `data/keys.js` (publik) agar halaman bisa memeriksa kode. Artinya ini **gerbang di layar login**, bukan enkripsi yang kuat terhadap orang yang membaca berkas repo dan paham TOTP. Akun & password tim lama dihapus dari login. Bila khawatir, pakai Rotasi penuh secara berkala. Memutus perangkat berdasarkan ID per browser: pengguna yang menghapus data browser mendapat ID baru (akan muncul lagi di daftar) — gunakan *Ganti Authenticator tim* bila perlu.

## C. Ganti password tim (Panel Admin)
Login Admin → tombol **⚙️ Admin**:
1. **Akun tim**: ketik password baru lalu **Ganti**; bisa **Tambah akun** / **Hapus**.
2. **Terbitkan ke GitHub** → isi *token* → klik **Terbitkan akun & password**. Situs diperbarui ±1 menit; setelah itu password lama mati.
   - Membuat token: GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate →
     Repository access: *Only select repositories* → pilih repo ini → Permissions: **Contents: Read and write** → Generate. Tempel di kolom Token
     (hanya disimpan di tab itu, hilang saat tab ditutup).
   - Tanpa token: klik **Unduh keys.js**, lalu di repo ganti file `data/keys.js` (Add file → Upload files).
3. **Rotasi penuh** (bagian bawah tab itu): dipakai bila password lama sudah bocor. Membuat kunci data baru, mengenkripsi ulang bank soal,
   dan memaksa semua password diganti. Perubahan password biasa **tidak** mencabut akses orang yang sudah menyimpan file `keys.js` lama.

## C1. Panel Admin, sinkron langsung, & kode pengguna baru
- Tombol **⚙️ Admin** meminta **password admin** lagi sebelum panel terbuka (tetap terbuka 5 menit setelah benar; 5 salah berturut-turut = jeda 30 detik).
- **Sinkron langsung (tanpa deploy):** isi *token GitHub* sekali di tab "Terbitkan ke GitHub". Setelah itu setiap buat/hapus kode, ganti password, tambah/hapus akun otomatis disimpan ke GitHub.
  Halaman login membaca data akun terbaru langsung dari GitHub (bukan dari cache situs), jadi akun/kode baru bisa dipakai dalam hitungan detik tanpa menunggu GitHub Pages.
- **Nonaktif otomatis:** perangkat yang sedang login memeriksa data terbaru tiap ±1 menit dan saat kembali ke tab. Akun/kode yang dihapus atau password yang diganti → pengguna otomatis keluar.
- **Login pengguna (non-admin) pakai Google Authenticator:** Panel Admin → tab "Pengguna Authenticator" → isi nama → *Buat pengguna & kode aktivasi*.
  Admin memberi **kode aktivasi** (10 karakter) ke pengguna. Pengguna: (1) buka halaman login, ketik kode aktivasi di kolom *Kode*; (2) pindai QR dengan Google Authenticator; (3) ketik kode 6 angka → masuk.
  Seterusnya di perangkat itu **cukup kode 6 angka** (username boleh dikosongkan). HP baru / ganti HP: buat ulang pengguna dengan nama yang sama → kode aktivasi baru.
  Hapus pengguna di tab itu → langsung nonaktif di semua perangkat (±1 menit). Perlu token GitHub agar perubahan langsung terbit (lihat C1b).
  Rahasia Authenticator tidak pernah tersimpan polos di `keys.js`: dibungkus kode aktivasi, dan kunci data dibungkus rahasia itu. Password akun tim lama tetap bisa dipakai di kolom yang sama.
- **Auto-tempel:** tombol "Tempel & Cari" + opsi Auto-tempel (saat kotak soal kosong diketuk / saat kembali ke halaman). Butuh HTTPS (GitHub Pages sudah) dan izin "tempel" browser.

## C1b. Token GitHub bermasalah ("Resource not accessible by personal access token")
Artinya token ditolak GitHub untuk menulis file. Perbaiki salah satu:
- Token **klasik** (paling mudah): GitHub → Settings → Developer settings → Personal access tokens → *Tokens (classic)* → Generate → centang **repo** → salin.
- Token **fine-grained**: Repository access = repo situs ini; Permissions → **Contents = Read and write**. Token harus dibuat dari akun **pemilik repo**.
Panel Admin kini menampilkan petunjuk spesifik (termasuk bila token milik akun lain) dan status 🟢/🟡/🔴. Centang "Ingat token di perangkat ini" agar tidak mengisi ulang (hanya di perangkat pribadi).

## C1c. Google Authenticator untuk admin
Panel Admin → tab **Authenticator** → *Hubungkan* → pindai QR di aplikasi → ketik kode 6 angka → Konfirmasi. Setelah itu login admin meminta kode setelah password.
Catatan jujur: hosting statis tidak punya server, jadi ini lapisan tambahan di layar login, bukan pengganti password kuat (data tetap dienkripsi oleh password). Berlaku untuk admin, bukan pengguna tim.
Bila HP hilang: admin lain buka tab Authenticator → *Reset Authenticator admin lain*. Jika semua admin terkunci: hapus bagian `"tp":{...}` pada entri admin di `data/keys.js` lalu unggah.
Rotasi penuh menghapus Authenticator semua admin (perlu dihubungkan ulang).

## C2. Huruf jawaban (a/b/c/d/e)
Untuk soal pilihan ganda yang ditempel lengkap dengan pilihannya, hasil ditampilkan dengan huruf di depan, mis. `a/Keluhan pelanggan kategori place`.
Huruf dicari dari pilihan yang paling mirip dengan jawaban di bank soal (urutan pilihan mengikuti soal yang ditempel). Bila pilihan tidak terbaca atau ragu, hanya teks jawaban yang tampil.
Untuk banyak soal sekaligus ada baris **Kunci cepat** (mis. `1-a 2-c 3-ab`).

## D. Menambah soal
- **Semua orang:** kotak “Tambah soal dari Excel” (XLSX, XLS, XLSM, XLSB, CSV, ODS, ZIP). Tersimpan **di perangkat itu saja**.
  Soal yang sudah ada dilewati (isi lama tidak diubah).
- **Agar semua orang melihatnya:** Admin → Terbitkan ke GitHub → **Terbitkan data soal** (atau Unduh bank.js lalu ganti `data/bank.js`).

## E. Soal dari gambar & Referensi AI
Tombol “Referensi AI → Pengaturan”: pilih Gemini/Claude dan tempel API key Anda (disimpan di perangkat, dikirim langsung ke penyedia AI).
Tanpa key, gambar dibaca dengan OCR di browser (Tesseract, perlu internet, hasil lebih kasar).

## F. Keamanan — baca ini
Hosting statis tidak punya server, jadi pengamanan memakai **enkripsi**: file `data/bank.js` terenkripsi AES-256; password membuka kuncinya
(PBKDF2 600.000 putaran). Isi soal tidak terbaca tanpa password. Tetapi file terenkripsi itu publik, jadi orang yang menebak password secara offline
tidak dibatasi percobaan — **pakai password yang panjang & sulit ditebak** (mis. 12+ karakter). Password pendek seperti angka+nama mudah ditebak.
Kode email sekali pakai tidak mungkin tanpa server, karena itu 3 email dipakai sebagai identitas **admin** (email + password admin).

## G. Membangun ulang data dari nol (opsional)
`CS_TEAM="shanum:SHANUM:sandi1;balqis:BALQIS:sandi2" CS_ADMIN_EMAILS="a@x.com,b@y.com" CS_ADMIN_PASSWORD="sandiadmin" node tools/build.mjs entries.json "label"`
Uji: `npm i jsdom xlsx fflate && node --test test/app.test.mjs`.


## Sesi login (tetap ada walau web ditutup)
Setelah login (kode Authenticator tim, atau email + password + Authenticator untuk admin), sesi disimpan di perangkat itu dan **berlaku 2 jam sejak login pertama**.
Menutup tab/browser lalu membukanya lagi **tidak meminta Authenticator lagi**, dan hitungan 2 jam tidak diperpanjang. Sesi berakhir bila: lewat 2 jam, tombol Keluar, admin mengganti Authenticator tim, atau admin memutus perangkat.
Sesi tidak berpindah antar perangkat: di HP/PC lain pengguna login sekali lagi. Data akun admin (password, Authenticator, Authenticator tim) tersinkron lewat GitHub, jadi berlaku di perangkat mana pun.


## AI bersama (langsung aktif untuk semua)
API key AI disimpan admin **terenkripsi** di `data/keys.js` (kunci yang sama dengan bank soal), jadi ikut sinkron ke semua perangkat dan hanya terbaca setelah login. Pengguna tidak perlu menempel kunci.
- Admin: tombol **🤖 Referensi AI → Simpan & sinkronkan ke semua** (butuh token GitHub di Panel Admin). Mengganti kunci cukup mengulang langkah ini.
- Cara kerja: AI membaca kutipan soal-jawaban terdekat dari bank soal, menyimpulkan jawaban (dengan huruf a/b/c…). Jika data tidak memuatnya, AI boleh memakai referensi luar (pencarian Google bila tersedia) dan ditandai "referensi luar".
- Otomatis berjalan untuk soal yang tidak ada di bank atau yang kemiripannya di bawah 80% (maks 10 soal per pencarian). Tombol "Simpulkan dengan AI" ada di tiap soal.
- Catatan keamanan: pengguna yang sudah login secara teknis bisa membaca kunci dari browser mereka. Batasi kunci di Google AI Studio / Cloud Console (kuota harian, pembatasan API) dan ganti bila bocor. Rotasi penuh mengenkripsi ulang kunci AI secara otomatis.
