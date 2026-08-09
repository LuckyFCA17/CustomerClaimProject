# NCC Portal — NIFCO Customer Claim

Customer Complaint Handling Portal untuk **PT Nifco Indonesia (NID)**. Menggantikan alur manual
(Excel log + email + PDF manual) dengan satu record klaim hidup yang bergerak lewat *action button*
dari input sampai `Verified Closed`.

> **Status: perencanaan.** Belum ada kode aplikasi. Baca [`PLAN.md`](./PLAN.md) (skema Prisma final,
> matriks permission, diagram state) dan [`ASSUMPTIONS.md`](./ASSUMPTIONS.md) (aturan bisnis yang
> diasumsikan) — keduanya menunggu persetujuan sebelum Fase 0 dimulai.

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

_Akan diisi pada Fase 0 (scaffold + `docker-compose.yml` untuk Postgres & MailHog)._

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

- [ ] **Fase 0** — Scaffold, shell UI, login, docker-compose
- [ ] **Fase 1** — Prisma schema, migrasi, seed, Auth.js + RBAC
- [ ] **Fase 2** — State machine + unit test, Modul 1
- [ ] **Fase 3** — PDF Bad News & Quick Info, mailer, template email
- [ ] **Fase 4** — Modul 2 (Follow Up / Ignore, CPAR ID)
- [ ] **Fase 5** — Modul 3 (CPAR form, verifikasi, siklus revisi)
- [ ] **Fase 6** — Modul 4 (monitoring, Not Effective, Verified Closed)
- [ ] **Fase 7** — Worker cron, dashboard, claim list, master data
- [ ] **Fase 8** — E2E Playwright, README final
