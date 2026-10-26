# NCC Portal — NIFCO Customer Claim

Customer Complaint Handling Portal untuk **PT Nifco Indonesia (NID)**. Menggantikan alur manual
(Excel log + email + PDF manual) dengan satu record klaim hidup yang bergerak lewat *action button*
dari input sampai `Verified Closed`.

> **Status: Fase 4 selesai** — klaim berjalan dari `DRAFT` sampai `CPAR_ISSUED` atau `IGNORED`
> lewat UI, mencetak kedua PDF, dan mengirim lima dari empat belas notifikasi §8. Pengisian CPAR
> menyusul pada Fase 5.
> Rujukan rancangan: [`PLAN.md`](./PLAN.md) (skema Prisma final, matriks permission, diagram state)
> dan [`ASSUMPTIONS.md`](./ASSUMPTIONS.md) (aturan bisnis yang diasumsikan).

## Empat proses inti

1. **Issue Customer Claim Information** — pencatatan klaim, review & approval QA Head, distribusi
   notifikasi + PDF (*Bad News Information Form*, *Quick Information for Abnormal Part*).
2. **Issue Problem Countermeasure Request (CPAR)** — penetapan penanggung jawab dan penerbitan CPAR ID,
   atau penutupan klaim sebagai *Ignored*.
3. **CPAR Filling & Evidence Collection** — pengisian CPAR multi-departemen per section, upload evidence,
   rantai verifikasi berjenjang dengan siklus revisi.
4. **CAPA Implementation Monitoring** — monitoring efektivitas countermeasure sampai `Verified Closed`.

## Prinsip

- **Satu klaim = satu record hidup.** Semua dokumen adalah turunan data yang sama, bukan file terpisah.
- **Action button–driven.** Tombol muncul kondisional sesuai status × role.
- **Tidak ada state yang bisa dilompati.** Validasi transisi ada di server, bukan sekadar tombol disembunyikan.
- **Setiap perpindahan status** menulis `AuditLog` dan meng-enqueue notifikasi email.

## Tech stack

| Layer | Pilihan |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions, TypeScript strict) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | PostgreSQL + Prisma ORM |
| Auth | Auth.js (NextAuth v5), credentials + bcrypt, session JWT |
| Form & validasi | react-hook-form + Zod (skema dipakai ulang client & server) |
| Tabel | TanStack Table (server-side) |
| Storage | lokal `/storage/uploads/{claimNo}/...`, diabstraksi `lib/storage.ts` |
| PDF | Puppeteer merender route `/print/[doc]/[id]` |
| Email | Nodemailer + React Email, dibungkus `lib/mailer.ts` |
| Cron | node-cron di worker terpisah (`worker/index.ts`) |
| Charting | Recharts |
| Testing | Vitest (state machine + Zod) · Playwright (E2E) |

## Setup

Prasyarat: Node.js ≥ 20.11, pnpm 10, Docker (untuk Postgres & MailHog).

```bash
pnpm install                  # postinstall menjalankan prisma generate
pnpm env:init                 # membuat .env dan mengisi AUTH_SECRET
pnpm db:up                    # Postgres :5432 + MailHog :8025
pnpm db:migrate               # terapkan migrasi
pnpm db:seed                  # role, departemen, pengguna, master data, 3 klaim contoh
pnpm dev                      # http://localhost:3000
```

| Layanan | Alamat | Kredensial |
|---|---|---|
| Portal | http://localhost:3000 | lihat [Akun demo](#akun-demo) |
| Postgres | `localhost:5432` | `ncc` / `ncc`, database `ncc_portal` |
| MailHog (SMTP) | `localhost:1025` | — |
| MailHog (web) | http://localhost:8025 | — |

Seluruh email portal mendarat di MailHog selama pengembangan dan tidak pernah keluar ke penerima sungguhan.

`pnpm env:init` tidak menimpa `.env` yang sudah ada; ia hanya mengisi `AUTH_SECRET` bila masih
kosong, jadi aman dijalankan ulang. Tambahkan `--force` untuk memutar nilainya — seluruh sesi
yang sedang berjalan akan ikut berakhir karena cookie lama tidak lagi dapat diverifikasi.
Bila `AUTH_SECRET` kosong, **setiap** login gagal dengan pesan yang menyebut variabel itu;
kegagalan non-kredensial lain (mis. basis data tidak terjangkau) dibedakan dari kata sandi
salah, dan rinciannya tercatat di log server.

<details>
<summary>Tanpa Docker (mis. container CI tanpa daemon)</summary>

Jalankan PostgreSQL 16 langsung di host dengan kredensial yang sama, sehingga `DATABASE_URL`
di `.env.example` tetap berlaku apa adanya:

```bash
service postgresql start
su postgres -c "psql -c \"CREATE ROLE ncc LOGIN PASSWORD 'ncc' CREATEDB;\""
su postgres -c "createdb -O ncc ncc_portal"
```

Untuk SMTP, jalankan penangkap bawaan repo di terminal terpisah:

```bash
pnpm mail:sink        # mendengarkan 127.0.0.1:1025, menyimpan .eml ke ./.mail
```

Email tidak pernah diteruskan ke mana pun; berkas `.eml`-nya dapat dibuka langsung beserta
lampiran PDF-nya.
</details>

<details>
<summary>Menjalankan di Android lewat Termux</summary>

Portal berjalan di Termux, tetapi **tiga komponen butuh binary native yang tidak tersedia di
Android**, jadi ada bagian yang tidak berfungsi. Ketahui ini dulu sebelum memasang:

| Komponen | Di Termux | Sebabnya |
|---|---|---|
| Next.js, Prisma Client, Auth.js | **jalan** | Prisma 7 memakai query compiler WASM, bukan engine Rust |
| PostgreSQL | **jalan** | tersedia sebagai paket Termux |
| Penangkap SMTP + template email | **jalan** | JavaScript murni |
| `prisma migrate` | **tidak** | schema-engine hanya ada untuk Linux glibc → pakai `pnpm db:apply-sql` |
| Kompresi foto (`sharp`) | **opsional** | prebuilt-nya glibc; tanpa sharp foto tersimpan tanpa kompresi |
| **Cetak PDF (Puppeteer)** | **tidak** | Chromium headless tidak tersedia di Android tanpa proot/X11 |

Artinya: pencatatan klaim, review, CPAR, RBAC, dan email berfungsi penuh; **Bad News Information
dan Quick Information tidak akan tercetak**. Portal sudah menangani itu dengan baik — kegagalan
pencetakan dicatat di log dan tidak membatalkan perpindahan status klaim.

```bash
# 1. Paket dasar
pkg update && pkg upgrade
pkg install nodejs-lts postgresql git
npm install -g pnpm

# 2. Nyalakan PostgreSQL (Termux tidak punya root, jadi datadir ada di $PREFIX)
initdb $PREFIX/var/lib/postgresql
pg_ctl -D $PREFIX/var/lib/postgresql start
createdb ncc_portal
psql -d ncc_portal -c "CREATE ROLE ncc LOGIN PASSWORD 'ncc' CREATEDB;"
psql -d ncc_portal -c "GRANT ALL ON SCHEMA public TO ncc;"

# 3. Ambil kode
git clone https://github.com/LuckyFCA17/CustomerClaimProject.git
cd CustomerClaimProject
git checkout claude/nid-customer-claim-portal-tcippa

# 4. Pasang dependensi. Lewati build script supaya sharp tidak menggagalkan install.
pnpm install --ignore-scripts
pnpm exec prisma generate

# 5. Siapkan .env (AUTH_SECRET dibuatkan otomatis)
pnpm env:init

# 6. Terapkan migrasi tanpa schema-engine, lalu isi data awal
pnpm db:apply-sql
pnpm db:seed

# 7. Jalankan
pnpm dev
```

Buka `http://localhost:3000` di peramban ponsel yang sama. Masuk dengan akun demo di bawah.

`pnpm db:apply-sql` menjalankan berkas `prisma/migrations/*/migration.sql` yang sama persis dengan
yang dipakai `prisma migrate`, satu migrasi satu transaksi, lalu mencatatnya di `_prisma_migrations`
dengan checksum yang sama. Basis data hasilnya tetap dianggap mutakhir oleh `prisma migrate status`
di mesin biasa — bukan jalur bercabang yang nanti bentrok. Perintah ini idempotent dan punya
`--dry-run`.

Bila ingin kompresi foto aktif, pasang `libvips` lebih dulu lalu bangun sharp dari sumber:

```bash
pkg install libvips build-essential python
pnpm rebuild sharp
```

Tanpa itu foto tetap terunggah, hanya saja disimpan apa adanya tanpa diperkecil ke 1600px.
</details>

### Perintah

| Perintah | Kegunaan |
|---|---|
| `pnpm dev` | Server pengembangan |
| `pnpm build` | Build produksi |
| `pnpm typecheck` | `tsc --noEmit` (TypeScript strict, tanpa `any`) |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit test Vitest |
| `pnpm db:up` / `pnpm db:down` | Menyalakan/mematikan Postgres + MailHog |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:seed` | Mengisi data awal (idempotent) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:reset` | Menghapus database dan menjalankan ulang migrasi + seed |
| `pnpm db:apply-sql` | Menerapkan migrasi tanpa schema-engine (untuk Termux) |
| `pnpm env:init` | Membuat `.env` dari `.env.example` dan mengisi `AUTH_SECRET` |
| `pnpm mail:sink` | Penangkap SMTP lokal di port 1025 bila MailHog tidak tersedia |

### Catatan komponen UI

`ui.shadcn.com` diblokir oleh network policy lingkungan pengembangan ini, sehingga CLI `shadcn add`
tidak bisa mengambil komponen. Karena shadcn/ui memang berupa komponen *copy-paste* ke dalam repo,
komponennya ditulis langsung di `src/components/ui/` di atas primitif Radix dari npm — bentuknya sama
dengan keluaran CLI. `components.json` tetap disediakan agar `pnpm dlx shadcn@latest add <komponen>`
langsung bisa dipakai di jaringan yang tidak memblokir host tersebut.

## Dokumen dan email

Setiap klaim yang dikirim mencetak dua PDF A4 lewat Puppeteer, yang merender route
`/print/[doc]/[id]` — halaman React biasa, bukan penyusun PDF terpisah. Satu sumber tata letak
untuk layar dan kertas, sehingga `?preview=1` di peramban memang menggambarkan hasil cetaknya.

| Dokumen | Format | Isi |
|---|---|---|
| Bad News Information | A4 **mendatar** | Form 5 (R3) PR-QA-ISO-07 — Quality Alert, lengkap dengan grid sosialisasi operator |
| Quick Information for Abnormal Part | A4 tegak | Foto besar berdampingan untuk ditempel di line produksi |

Lembar Bad News meniru formulir terkendali NID apa adanya: urutan baris Section A, pembagian
Section B standard–actual, pita peringatan berbahasa Indonesia yang sudah tercetak di sana, sampai
ejaan "PROBLEM HYSTORY" — itu teks pada dokumen terkendali, dan memperbaikinya justru membuat
lembar portal berbeda dari master yang dipegang auditor.

**Section C — Socialization** adalah grid paraf: tiga grup kerja (A, B, C) masing-masing berkolom
GROUP / DEPT / OPERATOR / PARAF, ditambah blok OTHERS untuk *Related Section Process Control*.
Barisnya sengaja dicetak kosong — lembar ini diedarkan ke lantai produksi dan diparaf operator
dengan tangan, persis seperti formulir aslinya.

Kolom PREPARED dan APPROVED diisi portal beserta waktu persetujuan digitalnya. CHECKED,
ACKNOWLEDGED (QC / PPIC / PRODUCTION), dan RESPONSIBLE dibiarkan kosong: portal tidak mengetahui
siapa yang memaraf di lapangan, dan mengisinya dengan tebakan akan membuat lembar itu berbohong.

Dokumen dicetak ulang setelah klaim disetujui supaya blok tanda tangan memuat nama dan waktu
persetujuan QA Dept. Head. Versi lama tidak ditimpa — nomor versinya naik, dan setiap PDF
menyimpan snapshot data klaim saat dicetak.

Halaman cetak dibuka Puppeteer memakai token bertanda tangan berumur dua menit yang terikat satu
dokumen dan satu klaim, karena Puppeteer tidak membawa cookie sesi. Manusia membukanya dengan
sesi biasa lewat `?preview=1`.

Email keluar hanya lewat `lib/mailer.ts`, tercatat di tabel `Notification`, dan dikirim **setelah**
transaksi perpindahan status commit — SMTP yang mati tidak membatalkan perubahan status, dan
transaksi yang gagal tidak menyisakan email yang terlanjur keluar. Log pengirimannya ada di
`/notifications` untuk QA Dept. Head dan Administrator.

## Action button

Alur berpindah tahap lewat tombol yang muncul kondisional menurut status × role, bukan menu tetap.
Tombol yang terlihat selalu merupakan turunan `availableTransitions()` dan matriks izin — bukan
daftar yang ditulis ulang di tiap halaman.

| Tombol | Muncul saat | Untuk |
|---|---|---|
| Submit claim information | `DRAFT`, `REVISION_REQUESTED` | QA pembuat klaim |
| Review claim information | `PENDING_QA_HEAD_REVIEW` | QA Dept. Head |
| **Action Button A** — Claim follow up / Ignore claim | `PUBLISHED` | QA, QA Dept. Head |
| **Action Button B** — CPAR form | `CPAR_ISSUED` dan sesudahnya | semua yang boleh melihat klaim |

Kedua jalur Action Button A saling menutup: begitu CPAR terbit klaim tidak bisa lagi di-ignore, dan
sebaliknya. Yang menjamin itu state machine di server, bukan tombol yang disembunyikan.

Tenggat pengisian CPAR bawaannya tiga hari kerja dan selalu dinormalkan ke pukul 17:00 WIB —
`<input type="date">` hanya mengirim tanggal, sehingga tanpa normalisasi tenggat akan terhitung
lewat sejak pukul 07:00 pagi hari H.

## Akun demo

Semua akun hasil seed memakai kata sandi **`Nifco#2026`**.

| Email | Nama | Role | Dept |
|---|---|---|---|
| `rina.kusuma@nifco.co.id` | Rina Kusuma | QA Dept. Head + QA Staff | QA |
| `dimas.prayoga@nifco.co.id` | Dimas Prayoga | QA Staff | QA |
| `sari.wulandari@nifco.co.id` | Sari Wulandari | QA Staff | QA |
| `bambang.setiawan@nifco.co.id` | Bambang Setiawan | User Dept. Head + User Dept. | PRD |
| `yusuf.ramadhan@nifco.co.id` | Yusuf Ramadhan | User Department | PRD |
| `anita.rahmawati@nifco.co.id` | Anita Rahmawati | User Dept. Head + User Dept. | ENG |
| `hendra.gunawan@nifco.co.id` | Hendra Gunawan | User Department | ENG |
| `lestari.ningsih@nifco.co.id` | Lestari Ningsih | User Dept. Head + User Dept. | PPIC |
| `agus.salim@nifco.co.id` | Agus Salim | User Department | MTC |
| `toshiro.tanaka@nifco.co.id` | Toshiro Tanaka | Factory Manager | — |
| `kenji.yamamoto@nifco.co.id` | Kenji Yamamoto | President Director | — |
| `fajar.nugroho@nifco.co.id` | Fajar Nugroho | Administrator | — |

Beberapa akun sengaja rangkap jabatan (§3), karena di lapangan hal itu lumrah.

Seed juga membuat 3 klaim contoh pada status berbeda — `DRAFT`, `PENDING_QA_HEAD_REVIEW`, dan
`CPAR_IN_PROGRESS` (CPAR bertipe CFT: Production sebagai lead dept, Engineering sebagai anggota).
Masuk sebagai Yusuf (PRD) dan Agus (MTC) menghasilkan daftar klaim yang berbeda — itulah aturan
visibilitas §3 yang bekerja.

### Catatan paket email

`@react-email/components` ditandai npm sebagai *no longer supported* pada seluruh versinya, jadi
yang dipakai hanya `@react-email/render` — perender React Email yang masih didukung. Primitif
email (shell, tabel ringkasan, tombol) ditulis sendiri di `src/emails/primitives.tsx` memakai
tabel dan atribut lawas, karena klien email korporat tidak dapat diandalkan untuk flexbox.

## Kontrol akses

RBAC ditegakkan di tiga lapis, dengan `src/lib/permissions.ts` sebagai sumber kebenaran tunggal:

1. **`src/middleware.ts`** — penjaga route per prefix (mis. `/master` hanya ADMIN). Tidak menyentuh
   database; role dibaca dari JWT, sehingga aman berjalan di edge runtime.
2. **Server action** — `assertCan(actor, action, claim)` melempar `ForbiddenError` (403) sebelum
   perubahan apa pun terjadi. Ini yang benar-benar mengamankan sistem.
3. **UI** — tombol yang tidak relevan disembunyikan. Ini kenyamanan, bukan pengaman.

Matriks `ACTION × ROLE × STATUS` selengkapnya ada di [`PLAN.md` §2](./PLAN.md#2-matriks-permission-action--role--status).

## State machine klaim

`src/lib/claim-state.ts` memuat satu-satunya daftar perpindahan status yang sah. Perpindahan
yang tidak ada di tabel itu ditolak dengan `IllegalTransitionError` (HTTP 409), termasuk ketika
server action dipanggil langsung tanpa lewat UI.

Pemeriksaan role sengaja dilakukan dua kali, oleh dua tabel berbeda:

| Lapis | Pertanyaan yang dijawab | Berkas |
|---|---|---|
| `assertCan` | Boleh melakukan aksi ini, pada klaim ini, pada status ini? | `lib/permissions.ts` |
| `assertTransition` | Perpindahan status ini sah bagi kapasitas tersebut? | `lib/claim-state.ts` |

Keduanya harus lolos, sehingga satu kekeliruan di salah satu tabel tidak cukup untuk melompati
tahap. `tests/unit/claim-state.test.ts` memeriksa seluruh 144 pasangan status: 14 yang sah harus
diterima, 130 sisanya harus ditolak.

## Diagram alur status

Lihat [`PLAN.md` §3](./PLAN.md#3-diagram-state-klaim). Ringkasnya:

```
DRAFT → PENDING_QA_HEAD_REVIEW → PUBLISHED ─┬→ IGNORED (terminal)
              ↑        ↓                     └→ CPAR_ISSUED → CPAR_IN_PROGRESS
       REVISION_REQUESTED                          → CPAR_UNDER_VERIFICATION ⇄ CPAR_REVISION
                                                   → CPAR_APPROVED → CAPA_MONITORING
                                                   → VERIFIED_CLOSED (terminal)
```

## Progres fase

- [x] **Fase 0** — Scaffold, shell UI, login, docker-compose
- [x] **Fase 1** — Prisma schema, migrasi, seed, Auth.js + RBAC
- [x] **Fase 2** — State machine + unit test, Modul 1
- [x] **Fase 3** — PDF Bad News & Quick Info, mailer, template email
- [x] **Fase 4** — Modul 2 (Follow Up / Ignore, CPAR ID)
- [ ] **Fase 5** — Modul 3 (CPAR form, verifikasi, siklus revisi)
- [ ] **Fase 6** — Modul 4 (monitoring, Not Effective, Verified Closed)
- [ ] **Fase 7** — Worker cron, dashboard, claim list, master data
- [ ] **Fase 8** — E2E Playwright, README final
