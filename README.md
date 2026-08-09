# NCC Portal — NIFCO Customer Claim

Customer Complaint Handling Portal untuk **PT Nifco Indonesia (NID)**. Menggantikan alur manual
(Excel log + email + PDF manual) dengan satu record klaim hidup yang bergerak lewat *action button*
dari input sampai `Verified Closed`.

> **Status: Fase 0 selesai** — scaffold, shell portal, token desain, halaman login, dan lingkungan
> pengembangan sudah berdiri. Belum ada database, autentikasi, maupun alur klaim.
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
pnpm install
cp .env.example .env          # lalu isi AUTH_SECRET: openssl rand -base64 32
pnpm db:up                    # Postgres :5432 + MailHog :8025
pnpm dev                      # http://localhost:3000
```

| Layanan | Alamat | Kredensial |
|---|---|---|
| Portal | http://localhost:3000 | — (autentikasi aktif pada Fase 1) |
| Postgres | `localhost:5432` | `ncc` / `ncc`, database `ncc_portal` |
| MailHog (SMTP) | `localhost:1025` | — |
| MailHog (web) | http://localhost:8025 | — |

Seluruh email portal mendarat di MailHog selama pengembangan dan tidak pernah keluar ke penerima sungguhan.

<details>
<summary>Tanpa Docker (mis. container CI tanpa daemon)</summary>

Jalankan PostgreSQL 16 langsung di host dengan kredensial yang sama, sehingga `DATABASE_URL`
di `.env.example` tetap berlaku apa adanya:

```bash
service postgresql start
su postgres -c "psql -c \"CREATE ROLE ncc LOGIN PASSWORD 'ncc' CREATEDB;\""
su postgres -c "createdb -O ncc ncc_portal"
```

Untuk SMTP, arahkan `SMTP_HOST`/`SMTP_PORT` ke penangkap email lain, atau biarkan kosong sampai Fase 3.
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

### Catatan komponen UI

`ui.shadcn.com` diblokir oleh network policy lingkungan pengembangan ini, sehingga CLI `shadcn add`
tidak bisa mengambil komponen. Karena shadcn/ui memang berupa komponen *copy-paste* ke dalam repo,
komponennya ditulis langsung di `src/components/ui/` di atas primitif Radix dari npm — bentuknya sama
dengan keluaran CLI. `components.json` tetap disediakan agar `pnpm dlx shadcn@latest add <komponen>`
langsung bisa dipakai di jaringan yang tidak memblokir host tersebut.

## Akun demo

_Akan diisi pada Fase 1 (`prisma/seed.ts`: 7 role, 6 departemen, 12 user contoh)._

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
- [ ] **Fase 1** — Prisma schema, migrasi, seed, Auth.js + RBAC
- [ ] **Fase 2** — State machine + unit test, Modul 1
- [ ] **Fase 3** — PDF Bad News & Quick Info, mailer, template email
- [ ] **Fase 4** — Modul 2 (Follow Up / Ignore, CPAR ID)
- [ ] **Fase 5** — Modul 3 (CPAR form, verifikasi, siklus revisi)
- [ ] **Fase 6** — Modul 4 (monitoring, Not Effective, Verified Closed)
- [ ] **Fase 7** — Worker cron, dashboard, claim list, master data
- [ ] **Fase 8** — E2E Playwright, README final
