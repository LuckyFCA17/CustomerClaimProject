# Migrasi NCC Portal ke server internal

Panduan untuk memindahkan portal dari mesin pengembangan ke server perusahaan.
Ditujukan kepada tim IT yang menyiapkan servernya, dan kepada QA yang menerima hasilnya.

Angka-angka di sini berasal dari portal ini sendiri — bukan perkiraan umum. Sumbernya
disebut di tempat masing-masing.

---

## Ringkasan proses

| # | Langkah | Siapa | Perkiraan | Hasil yang dapat diperiksa |
|---|---------|-------|-----------|----------------------------|
| 1 | Sediakan server dan perangkat lunak dasar | IT | 1 hari | `node -v`, `psql --version`, `chromium --version` menjawab |
| 2 | Pasang portal dan bangun sekali | IT | 2 jam | `http://IP:3000/login` terbuka |
| 3 | Pindahkan basis data **dan** folder unggahan | IT | 1 jam | Jumlah klaim dan lampiran sama dengan asal |
| 4 | Sambungkan SMTP perusahaan dan penjadwal pengingat | IT | 1 jam | Email uji sampai ke kotak sungguhan |
| 5 | Uji terima | QA + IT | setengah hari | Daftar periksa di §8 lulus seluruhnya |
| 6 | Pindah resmi | QA + IT | 1 jam | Portal lama dibekukan, pengguna memakai alamat baru |

Langkah 3 adalah satu-satunya yang tidak boleh dipecah: basis data dan folder unggahan
harus dipindahkan dari titik waktu yang sama. Alasannya ada di §6.

---

## 1. Spesifikasi server

### Mesin

| | Disarankan | Minimum yang masih jalan |
|---|---|---|
| Arsitektur | x86-64, Linux **glibc** | sama — bukan musl, bukan ARM |
| Sistem operasi | Ubuntu Server 24.04 LTS | RHEL/Rocky 9, Debian 12 |
| CPU | 4 vCPU | 2 vCPU |
| RAM | 8 GB | 4 GB |
| Disk | 100 GB SSD | 40 GB |
| Jaringan | LAN/intranet saja | — |

**Mengapa glibc.** Dua komponen memakai binary prebuilt yang ditautkan ke glibc: `sharp`
(kompresi foto unggahan) dan schema-engine milik Prisma. Di lingkungan bionic seperti
Termux keduanya tidak dapat dijalankan, dan portal ini membawa jalan memutar untuk itu
(`scripts/apply-migrations.mjs`). Di server glibc jalan memutar itu tidak lagi diperlukan,
tetapi tetap aman dipakai.

**Mengapa RAM segitu.** Terukur pada portal ini, tercatat di `next.config.ts` dan
`scripts/run.mjs`:

| Proses | Puncak memori |
|---|---|
| `next start` — portal yang sedang melayani | ±290 MB |
| `next build` — hanya saat memasang versi baru | ±1.700 MB |
| Chromium headless untuk cetak PDF | ±300–500 MB |
| PostgreSQL 16, konfigurasi bawaan | ±200 MB + shared_buffers |

Dengan 4 GB portal berjalan nyaman, tetapi `next build` harus dilakukan saat portal
sepi — atau dibangun di mesin lain lalu hasilnya disalin. Dengan 8 GB build dapat
dijalankan kapan saja tanpa mengganggu pemakaian.

### Perkiraan disk

Diukur dari data yang ada sekarang: basis data 10 MB untuk 14 klaim; folder unggahan
4,6 MB untuk 22 lampiran, rata-rata ±210 KB per lampiran sesudah dikompresi `sharp`.

Yang menentukan pertumbuhan adalah lampiran, bukan baris basis data. Satu klaim yang
lengkap — foto Standard dan Actual, dokumen awal CPAR, bukti tiap baris tindakan, bukti
tiap periode pemantauan — realistisnya memuat 30–50 lampiran.

| Asumsi | Angka |
|---|---|
| Klaim per tahun (dari Dashboard V1 tahun 2026: 15 + 15 + 8) | ±38 |
| Lampiran per klaim lengkap | 40 |
| Ukuran rata-rata sesudah kompresi | 250 KB |
| **Unggahan per tahun** | **±400 MB** |
| Arsip ISO 7 tahun, ditambah cadangan harian 30 hari | **±10 GB** |

100 GB memberi ruang lapang; 40 GB cukup untuk beberapa tahun pertama bila cadangan
disimpan di tempat lain. Batas unggahan per berkas adalah 25 MB (`src/lib/uploads.ts`).

### Jam dan zona waktu

NTP harus aktif. Zona waktu sistem bebas: portal memakai `APP_TIMEZONE=Asia/Jakarta`
untuk menentukan tenggat yang selalu jatuh pukul 17:00 WIB. Jam server yang meleset
membuat chip tenggat salah dan pengingat terkirim di hari yang keliru.

---

## 2. Perangkat lunak

### Wajib

| Komponen | Versi | Mengapa versi itu |
|---|---|---|
| Node.js | 22 LTS | `package.json` mensyaratkan ≥ 20.11; Next 15.5 dan React 19 berjalan pada 20 maupun 22. Pilih 22 karena dukungannya paling panjang |
| pnpm | 10 | Lockfile proyek adalah `pnpm-lock.yaml`. npm atau yarn akan menyelesaikan versi yang berbeda |
| PostgreSQL | **16** (minimum 15) | Indeks unik `GeneratedDocument` memakai `NULLS NOT DISTINCT`, yang baru ada sejak PostgreSQL 15. Pilih 16 karena itu yang dipakai selama pengembangan dan pengujian |
| Chromium | stabil terbaru | `puppeteer-core` tidak mengunduh peramban sendiri. Tanpa Chromium terpasang, seluruh pencetakan PDF gagal |
| Git | apa saja | Mengambil dan memperbarui kode |

### Disarankan

| Komponen | Untuk apa |
|---|---|
| Nginx | TLS internal dan satu nama host tetap. Tanpa ini portal tetap jalan di `http://IP:3000` |
| systemd | Menjaga portal hidup dan menyalakannya kembali setelah server reboot |
| cron | Memicu pengingat harian |
| `logrotate` | Membatasi log pengingat |

### Tidak diperlukan

| | Alasan |
|---|---|
| Docker | `docker-compose.yml` hanya untuk pengembangan — PostgreSQL dan MailHog di laptop. Di server, PostgreSQL dipasang langsung |
| Redis atau antrean pesan | Sesi memakai JWT (`src/lib/auth.config.ts`), jadi tidak ada state sesi yang perlu dibagi. Pengingat dipicu cron, bukan worker |
| Object storage (S3/MinIO) | Penyimpanan lokal cukup. `STORAGE_DRIVER` sudah diabstraksi di `src/lib/storage.ts` bila nanti ingin dipindah, tanpa menyentuh satu pun server action |
| Load balancer | Satu instance melayani seluruh departemen dengan nyaman pada beban ini |

---

## 3. Yang perlu disiapkan IT sebelum hari H

- [ ] VM sesuai §1, dengan satu pengguna Linux non-root (`ncc`) dan hak `sudo` untuk pemasangan
- [ ] Nama host internal, mis. `ncc.nifco.co.id`, diarahkan ke IP server
- [ ] Sertifikat TLS internal untuk nama host itu, bila memakai HTTPS
- [ ] Relay SMTP perusahaan: host, port, TLS, dan satu akun pengirim
- [ ] **Sertifikat SMTP yang tepercaya.** Dalam mode produksi portal memverifikasi sertifikat SMTP dengan ketat (`src/lib/mailer.ts`). Relay dengan sertifikat tanda tangan sendiri akan menolak koneksi, dan email tidak akan terkirim sama sekali
- [ ] Firewall: 80/443 dari LAN ke server; server → relay SMTP; **server → dirinya sendiri** pada alamat `APP_URL` (lihat §5)
- [ ] Jadwal cadangan dan tempat penyimpanannya
- [ ] Daftar alamat email asli seluruh pengguna portal

---

## 4. Pemasangan

Perintah di bawah ditulis untuk Ubuntu Server 24.04. Sesuaikan nama paket untuk distro lain.

### 4.1 Pengguna dan folder

Folder unggahan sengaja diletakkan **di luar** folder kode, supaya `git pull` dan
pemasangan versi baru tidak pernah menyentuh berkas milik klaim.

```bash
sudo adduser --system --group --home /opt/ncc-portal ncc
sudo mkdir -p /var/lib/ncc-portal/uploads /var/log/ncc-portal
sudo chown -R ncc:ncc /opt/ncc-portal /var/lib/ncc-portal /var/log/ncc-portal
```

### 4.2 Node, pnpm, PostgreSQL, Chromium

```bash
# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm
sudo corepack enable
sudo corepack prepare pnpm@10 --activate

# PostgreSQL 16 dan Git
sudo apt-get install -y postgresql-16 git
```

**Chromium perlu perhatian khusus di Ubuntu 24.04.** Paket `chromium` di sana adalah
pembungkus Snap, dan Chromium dalam kurungan Snap sering gagal diluncurkan oleh
`puppeteer-core` dari proses lain. Yang paling mudah diprediksi adalah memasang Google
Chrome stabil dari paket `.deb` resminya:

```bash
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt-get install -y ./google-chrome-stable_current_amd64.deb
which google-chrome-stable        # biasanya /usr/bin/google-chrome-stable
```

Pada Debian 12 atau RHEL/Rocky 9, `apt-get install -y chromium` dan
`dnf install -y chromium` memasang binary biasa tanpa kurungan, dan itu cukup.

Apa pun yang dipilih, catat jalurnya dan isikan ke `PUPPETEER_EXECUTABLE_PATH` di §5.
Portal juga mencari sendiri di `/usr/bin/chromium`, `/usr/bin/chromium-browser`, dan
`/usr/bin/google-chrome` bila variabel itu dikosongkan (`src/lib/pdf.ts`) — tetapi
menyebutnya terang-terangan menghemat satu gangguan yang sulit ditebak nanti.

```bash
# Pastikan semuanya menjawab
node -v && pnpm -v && psql --version && google-chrome-stable --version
```

### 4.3 Basis data

```bash
sudo -u postgres psql <<'SQL'
CREATE USER ncc WITH PASSWORD 'ganti-dengan-kata-sandi-kuat';
CREATE DATABASE ncc_portal OWNER ncc;
SQL
```

Basis data hanya diakses dari mesin yang sama, jadi biarkan PostgreSQL mendengarkan di
`localhost` saja — jangan buka port 5432 ke jaringan.

### 4.4 Kode dan dependensi

```bash
sudo -u ncc -H bash
cd /opt
git clone <url-repo> ncc-portal
cd ncc-portal
pnpm install --frozen-lockfile
```

`pnpm install` menjalankan `prisma generate` sendiri lewat `postinstall`.

### 4.5 Berkas `.env`

```bash
cp .env.example .env
pnpm env:init          # membuatkan AUTH_SECRET
nano .env              # isi sisanya sesuai §5
chmod 600 .env
```

### 4.6 Skema dan build pertama

```bash
node scripts/apply-migrations.mjs       # menerapkan 15 migrasi
pnpm db:seed                            # HANYA pada pemasangan baru tanpa data lama
pnpm boot                               # build bila perlu, lalu next start
```

Pada pemasangan yang akan menerima data dari portal lama, **lewati `pnpm db:seed`** dan
lanjutkan ke §6 — pemulihan cadangan membawa skema beserta isinya.

Buka `http://IP-SERVER:3000/login` dari peramban lain di jaringan yang sama untuk
memastikan portal benar-benar melayani sebelum melanjutkan.

---

## 5. Variabel lingkungan

| Variabel | Isi di server | Yang terjadi bila salah |
|---|---|---|
| `DATABASE_URL` | `postgresql://ncc:SANDI@localhost:5432/ncc_portal?schema=public` | Portal tidak menyala |
| `AUTH_SECRET` | `openssl rand -base64 32` | **Login gagal seluruhnya.** Nilainya harus tetap sama selamanya: menggantinya mengeluarkan semua orang dari sesinya |
| `AUTH_URL` | Kosongkan, kecuali di belakang reverse proxy dengan satu nama tetap — lalu isi `https://ncc.nifco.co.id` | Bila diisi keliru, login dari perangkat lain dilempar ke host itu dan gagal tanpa pesan |
| `APP_URL` | `https://ncc.nifco.co.id` | Dipakai dua hal: tautan "Open in portal" di email, **dan Puppeteer saat mencetak PDF**. Portal membuka dirinya sendiri lewat alamat ini, jadi alamat itu harus dapat dihubungi dari dalam server. Bila tidak, pencetakan menggantung lalu gagal |
| `APP_TIMEZONE` | `Asia/Jakarta` | Tenggat dan pengingat jatuh pada jam yang salah |
| `STORAGE_DRIVER` | `local` | — |
| `STORAGE_ROOT` | `/var/lib/ncc-portal/uploads` | Jalur absolut, di luar folder kode. Bila dibiarkan relatif, berkas ikut hilang saat folder kode diganti |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASSWORD` | Dari relay perusahaan | Email tidak terkirim. Perpindahan status tetap tersimpan — pengiriman sengaja dipisah dari transaksi (`src/lib/mailer.ts`) |
| `MAIL_FROM` | `NCC Portal <ncc-portal@nifco.co.id>` | Relay dapat menolak pengirim yang tidak dikenal |
| `PUPPETEER_EXECUTABLE_PATH` | Jalur Chromium/Chrome dari §4.2 | Tidak ada di `.env.example`; tambahkan sendiri. Bila dikosongkan, portal menebak dari daftar jalur bawaan — berhasil di banyak server, tetapi gagal diam-diam bila Chrome dipasang di tempat lain |
| `REMINDER_TOKEN` | `openssl rand -hex 24` | Kosong berarti `/api/reminders` menolak semua panggilan — gagal tertutup, bukan terbuka |
| `NODE_ENV` | `production` | Disetel sendiri oleh `next start`. Dalam mode ini verifikasi sertifikat SMTP menjadi ketat |

---

## 6. Memindahkan data dari portal lama

### Mengapa urutannya penting

Basis data menyimpan **jalur relatif** ke tiap lampiran, bukan isinya. Folder unggahan
menyimpan berkasnya. Keduanya hanya bermakna bersama-sama.

Dan keduanya dapat terpisah: nomor klaim berasal dari basis data sedangkan nama folder
ada di disk, sehingga basis data yang dipulihkan dari cadangan yang lebih tua daripada
folder unggahannya akan menghasilkan lampiran yang tercatat tetapi tidak ada berkasnya —
atau sebaliknya. Perilaku ini disadari dan ditangani di `src/lib/storage.ts`, tetapi
jalan keluarnya tetap: ambil keduanya dari titik waktu yang sama.

### Perintah

Di portal lama:

```bash
# 1. Hentikan portal supaya tidak ada klaim yang masuk di tengah pemindahan
#    (Termux: tutup sesi yang menjalankan `pnpm boot`)

# 2. Cadangkan basis data
pg_dump --format=custom --no-owner --no-acl \
  "$DATABASE_URL" -f ncc_portal.dump

# 3. Cadangkan folder unggahan
tar -czf ncc-uploads.tar.gz -C ./storage uploads

# 4. Catat angka pembanding
psql "$DATABASE_URL" -At -F'|' -c \
  'select (select count(*) from "Claim"), (select count(*) from "Cpar"),
          (select count(*) from "Attachment"), (select count(*) from "User");'
```

Di server baru:

```bash
# 5. Pulihkan basis data
pg_restore --no-owner --no-acl -d "postgresql://ncc:SANDI@localhost:5432/ncc_portal" \
  ncc_portal.dump

# 6. Pulihkan folder unggahan ke STORAGE_ROOT
sudo -u ncc tar -xzf ncc-uploads.tar.gz -C /var/lib/ncc-portal --strip-components=1

# 7. Pastikan skema sudah mutakhir (aman diulang; tidak melakukan apa-apa bila sudah)
cd /opt/ncc-portal && node scripts/apply-migrations.mjs

# 8. Bandingkan angkanya dengan langkah 4 — harus sama persis
psql "$DATABASE_URL" -At -F'|' -c \
  'select (select count(*) from "Claim"), (select count(*) from "Cpar"),
          (select count(*) from "Attachment"), (select count(*) from "User");'
```

### Verifikasi lampiran

Angka yang sama belum membuktikan berkasnya ada. Periksa beberapa lampiran secara acak
lewat portal — buka satu klaim lama, buka evidence-nya, pastikan gambarnya tampil. Bila
muncul galat berkas tidak ditemukan, `STORAGE_ROOT` menunjuk ke tempat yang salah atau
`--strip-components` pada langkah 6 tidak cocok dengan struktur arsipnya.

---

## 7. Menjalankan sebagai layanan

### systemd

`/etc/systemd/system/ncc-portal.service`:

```ini
[Unit]
Description=NCC Portal — NIFCO Customer Claim
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=ncc
Group=ncc
WorkingDirectory=/opt/ncc-portal
# .env dibaca sendiri oleh Next saat start — satu sumber, sama dengan `pnpm boot`.
Environment=PORT=3000
ExecStart=/opt/ncc-portal/node_modules/.bin/next start -p 3000
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=/var/lib/ncc-portal /opt/ncc-portal/.next

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ncc-portal
sudo systemctl status ncc-portal
```

Portal harus **sudah pernah di-build** sebelum layanan dinyalakan — `next start` menyajikan
isi `.next` apa adanya dan menolak jalan bila folder itu belum ada. Gunakan `pnpm boot`
sekali, atau `pnpm build` pada tiap pemasangan versi baru.

### Nginx

`/etc/nginx/sites-available/ncc-portal`:

```nginx
server {
    listen 80;
    server_name ncc.nifco.co.id;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ncc.nifco.co.id;

    ssl_certificate     /etc/ssl/certs/ncc.nifco.co.id.crt;
    ssl_certificate_key /etc/ssl/private/ncc.nifco.co.id.key;

    # Batas unggahan portal 25 MB; bawaan Nginx 1 MB akan menolaknya dengan 413
    # sebelum kode aplikasi sempat berjalan.
    client_max_body_size 30m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Paket klaim (ZIP) dan pencetakan PDF dapat berjalan lebih dari satu menit.
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}
```

Bila memakai Nginx, isi `AUTH_URL` dan `APP_URL` dengan `https://ncc.nifco.co.id`, dan
pastikan nama itu dapat dihubungi **dari dalam server** — Puppeteer membuka portal lewat
`APP_URL` saat mencetak. Bila DNS internal tidak menjawab dari server itu sendiri,
tambahkan barisnya di `/etc/hosts`.

### Pengingat harian

```bash
sudo -u ncc crontab -e
```

```cron
# Pengingat tenggat, hari kerja pukul 07:30 WIB.
# Aman diulang: pengingat yang sudah terkirim hari ini tidak terkirim dua kali.
30 7 * * 1-5 cd /opt/ncc-portal && /usr/bin/node scripts/reminders.mjs >> /var/log/ncc-portal/reminders.log 2>&1
```

Skrip itu membaca `REMINDER_TOKEN` dari `.env` sendiri dan memanggil
`POST /api/reminders` — persis yang dijalankan tangan lewat `pnpm reminders`.

---

## 8. Uji terima

Jangan umumkan pindah sebelum seluruh baris ini lulus di server baru.

| # | Yang diuji | Cara | Lulus bila |
|---|---|---|---|
| 1 | Login | Masuk dengan akun asli, bukan akun demo | Masuk ke Dashboard |
| 2 | Hak akses | Masuk sebagai User Dept., buka klaim milik departemen lain | Ditolak, bukan ditampilkan |
| 3 | Unggah dari ponsel | Unggah foto kamera ±5 MB | Tersimpan, pratinjau tampil |
| 4 | Kompresi `sharp` | Periksa ukuran berkas di `STORAGE_ROOT` | Jauh lebih kecil dari aslinya. Bila sama persis, `sharp` gagal dimuat — periksa log |
| 5 | **Cetak PDF** | Terbitkan klaim, tekan Print Bad News Information | PDF terunduh. Ini yang membuktikan Chromium dan `APP_URL` benar |
| 6 | Cetak A3 | Buka CPAR, Print CPAR | Lembar A3 mendatar, dua halaman |
| 7 | **Email** | Terbitkan satu klaim | Email masuk ke kotak sungguhan, bukan antrean yang menggantung |
| 8 | Tautan email | Tekan "Open in portal" di email | Mendarat di klaim yang benar lewat nama host baru |
| 9 | Paket klaim | Download claim package | ZIP terunduh utuh, tidak terputus di tengah |
| 10 | Export Excel | Menu Claims → Export Excel | Berkas terbuka, isinya mengikuti penyaring aktif |
| 11 | Pengingat | `cd /opt/ncc-portal && node scripts/reminders.mjs` | Membalas `ok: true` |
| 12 | Tenggat WIB | Lihat chip tenggat pada CPAR | Jatuh pukul 17:00, bukan 00:00 |
| 13 | Data lama | Buka klaim terlama, buka evidence-nya | Gambar tampil, bukan galat berkas |
| 14 | Hidup kembali | `sudo reboot` | Portal melayani lagi tanpa disentuh |

### Perkakas pemeriksaan bawaan

Portal membawa skripnya sendiri untuk sebagian uji di atas. Lebih cepat daripada
mengklik, dan pesan galatnya lebih terang:

```bash
cd /opt/ncc-portal

pnpm checkup                              # .env, koneksi basis data, dan SMTP (bukan Chromium)
pnpm login:check --list                   # daftar akun yang ada
pnpm login:check nama@nifco.co.id         # periksa satu akun langsung ke basis data
pnpm upload:check                         # uji jalur simpan unggahan tanpa peramban
pnpm pdf:check --claim <claimId>          # cetak kelima dokumen, periksa ukuran kertasnya
pnpm mail:test --to nama@nifco.co.id      # kirim satu contoh tiap template email
pnpm mail:test --dry                      # render saja, tidak mengirim
```

`pnpm pdf:check` adalah pembuktian tercepat bahwa Chromium dan `APP_URL` sudah benar —
bila yang ini lulus, uji nomor 5 dan 6 hampir pasti ikut lulus.

---

## 9. Cadangan

Cadangan basis data tanpa folder unggahan tidak ada gunanya, dan sebaliknya. Jadwalkan
keduanya dalam satu skrip, pada jam yang sama.

`/opt/ncc-portal/ops/backup.sh`:

```bash
#!/bin/sh
set -eu
STAMP=$(date +%F)
DEST=/var/backups/ncc-portal
mkdir -p "$DEST"

pg_dump --format=custom --no-owner --no-acl \
  "postgresql://ncc:SANDI@localhost:5432/ncc_portal" \
  -f "$DEST/db-$STAMP.dump"

tar -czf "$DEST/uploads-$STAMP.tar.gz" -C /var/lib/ncc-portal uploads

# Simpan 30 hari terakhir.
find "$DEST" -type f -mtime +30 -delete
```

```cron
0 1 * * * /opt/ncc-portal/ops/backup.sh >> /var/log/ncc-portal/backup.log 2>&1
```

Salin hasilnya ke luar server — cadangan yang hanya ada di mesin yang sama tidak
menyelamatkan apa pun saat mesin itu yang hilang.

**Uji pemulihan sekali, sebelum dibutuhkan.** Pulihkan cadangan ke basis data lain,
jalankan hitungan di §6 langkah 8, dan buka satu lampiran. Cadangan yang belum pernah
dipulihkan belum terbukti ada.

---

## 10. Memasang versi baru

```bash
sudo -u ncc -H bash
cd /opt/ncc-portal
git pull
pnpm install --frozen-lockfile
node scripts/apply-migrations.mjs     # aman diulang
pnpm build
exit
sudo systemctl restart ncc-portal
```

`pnpm build` memuncak di ±1.700 MB. Pada server 4 GB, jalankan saat portal sepi.
Jangan menyunting berkas selama build berjalan: hasilnya akan berupa bundel yang tidak
cocok dengan commit mana pun.

---

## 11. Risiko dan jalan mundur

| Risiko | Tandanya | Penanganan |
|---|---|---|
| Chromium tidak ditemukan | Pencetakan gagal dengan "Chromium tidak ditemukan" | Isi `PUPPETEER_EXECUTABLE_PATH` di `.env` dengan jalur hasil `which chromium` |
| `APP_URL` tidak terjangkau dari dalam server | Pencetakan menggantung lalu gagal, padahal portal terbuka normal dari peramban | Tambahkan nama host ke `/etc/hosts` server, atau pakai `http://127.0.0.1:3000` sementara |
| Sertifikat SMTP tidak tepercaya | Email tidak pernah sampai, status tetap berpindah | Pasang CA internal ke trust store server. Jangan mematikan verifikasi |
| Unggahan ditolak 413 | Gagal pada berkas besar saja | `client_max_body_size` di Nginx kurang dari 30m |
| `AUTH_SECRET` berubah | Semua orang tiba-tiba logout | Kembalikan nilai lama dari cadangan `.env` |
| Lampiran lama tidak tampil | Galat berkas tidak ditemukan pada klaim lama | `STORAGE_ROOT` salah, atau arsip unggahan diekstrak ke tingkat folder yang keliru |

**Jalan mundur.** Jangan hapus apa pun di portal lama sampai uji terima di §8 lulus dan
portal baru dipakai setidaknya satu minggu penuh dengan klaim sungguhan. Selama masa itu
portal lama cukup dibekukan — dapat dibuka untuk dibaca, tetapi tidak menerima klaim baru.
Bila harus mundur, portal lama masih memegang data sampai detik pemindahan, dan yang
hilang hanya klaim yang masuk setelah itu.
