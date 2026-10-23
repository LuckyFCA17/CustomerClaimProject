# ASSUMPTIONS.md

Aturan bisnis yang **tidak eksplisit** di spesifikasi dan saya asumsikan agar pengerjaan bisa jalan (§14.2).
Setiap asumsi punya ID, dampak kalau salah, dan seberapa mahal mengubahnya nanti.

Status: `⏳` menunggu konfirmasi · `✅` dikonfirmasi · `🔁` direvisi.

**Dikonfirmasi 2026-08-09:** A-01 (rantai verifikasi seragam 4 verifier untuk semua tipe klaim),
A-03 (Factory Manager & PresDir tidak mengisi section CPAR — hanya verifikasi),
A-04 (pada CFT hanya head lead dept yang jadi verifier wajib),
A-06 (ADMIN murni administratif: tidak approve klaim, tidak verifikasi CPAR).

| ID | Asumsi | Dampak bila salah | Biaya ubah | Status |
|---|---|---|---|---|
| A-01 | **Rantai verifikasi sama untuk semua `ClaimType`.** Klaim `Non-Official` dan `Information Only` tetap butuh 4 verifier (QA_HEAD, USER_HEAD, FACTORY_MGR, PRESDIR) bila sampai tahap CPAR. | Klaim ringan jadi lambat karena menunggu PresDir. | Murah — `requiredVerifiers()` satu fungsi | ✅ |
| A-02 | **Semua tipe klaim boleh di-`IGNORED`,** bukan hanya `Information Only`. §6 Modul 1 bilang `Information Only` "boleh langsung ke IGNORED tanpa CPAR" — saya baca sebagai keringanan, bukan larangan untuk tipe lain. Untuk `OFFICIAL`/`NON_OFFICIAL` UI meminta konfirmasi ganda dan alasan tetap wajib ≥30 karakter. | Klaim official bisa ditutup tanpa CPAR. | Murah — guard di `claim.ignore` | ⏳ |
| A-03 | **Peta section CPAR → role** seperti tabel PLAN §2.3. Factory Manager & PresDir tidak mengisi section apa pun; kontribusi mereka lewat `cpar.verify` dan `monitoring.setEffectiveness`. | Section yang seharusnya diisi manajemen jadi read-only bagi mereka. | Murah — konstanta `CPAR_SECTION_OWNERS` | ✅ |
| A-04 | **Pada `responsibilityType = CFT`, `responsibleDeptId` berperan sebagai lead dept,** dan hanya head lead dept yang jadi verifier wajib. Dept CFT lain bisa mengisi & melihat, tidak memblokir approval. | CPAR bisa disetujui tanpa persetujuan semua dept CFT. | Sedang — mengubah `@@unique([cparId, role, cycle])` jadi menyertakan dept | ✅ |
| A-05 | **Satu periode `NOT_EFFECTIVE` cukup** untuk mengembalikan klaim ke `CPAR_REVISION` — tidak menunggu periode lain selesai. Periode siklus lama disimpan (`MonitoringPeriod.cycle`), tidak dihapus. | Revisi terpicu terlalu dini. | Murah | ⏳ |
| A-06 | **`ADMIN` murni administratif**: tidak boleh approve klaim maupun verifikasi CPAR, tapi boleh melihat semua dan mengelola master data. | Admin tidak bisa jadi backup saat approver cuti. | Murah — satu sel matriks | ✅ |
| A-07 | **`USER_DEPT`/`USER_HEAD` bisa melihat klaim `PUBLISHED` dan `IGNORED` walau dept-nya belum ditunjuk,** karena kedua status itu memicu broadcast ke seluruh user portal (§8 #3, #5). Klaim `DRAFT`…`PENDING_QA_HEAD_REVIEW` tetap tersembunyi. | Informasi klaim bocor ke dept yang tidak relevan. | Murah — satu klausa di `visibleClaimsWhere()` | ⏳ |
| A-08 | **"Seluruh user portal" = semua user aktif** yang punya minimal satu role, diekspansi lewat `RecipientGroup` `ALL_PORTAL_USERS` agar admin bisa mempersempit tanpa deploy. | Email broadcast terlalu luas. | Murah — data, bukan kode | ⏳ |
| A-09 | **Due date CPAR default H+3 *hari kerja*** (Senin–Jumat), libur nasional **tidak** diperhitungkan di v1 karena tidak ada master hari libur di spec. Bisa diubah QA per klaim. | Tenggat jatuh di hari libur. | Sedang — perlu tabel `Holiday` | ⏳ |
| A-10 | **Monitoring default 4 periode, interval 7 hari,** dihitung dari tanggal `monitoring.start`. QA bisa mengubah jumlah & interval saat memulai. | — | Murah | ⏳ |
| A-11 | **`Product Category` dan `Non-Conformance Detail` jadi tabel master**, bukan enum, karena §6 Modul 5 mendaftarkannya sebagai master data yang dikelola ADMIN — meski §7 menampilkannya sebagai radio dengan pilihan tetap. UI tetap radio, sumbernya tabel (di-seed dengan nilai di §7). | Tidak ada — superset dari enum. | — | ⏳ |
| A-12 | **Satu panel `Standard` dan satu panel `Actual` per klaim** (`@@unique([claimId, side])`), sesuai §7C "dua panel berdampingan". Foto banyak per panel lewat `Attachment` (maks 5, sisi terpanjang dikompres ke 1600px). | Klaim dengan >1 part bermasalah harus dipecah jadi beberapa klaim. | Mahal — mengubah kardinalitas + semua PDF | ⏳ |
| A-13 | **Tanda tangan digital = nama + jabatan + timestamp**, diambil dari `User.jobTitle` saat approval, di-snapshot ke `GeneratedDocument.snapshot` supaya perubahan jabatan tidak mengubah PDF lama. | — | — | ⏳ |
| A-14 | **`Customer` opsional pada klaim** (`customerId` nullable) karena §7 tidak punya field customer, tapi §6 Modul 5 minta master Customer. Field disediakan tapi tidak wajib. | Pareto per customer tidak lengkap. | Murah | ⏳ |
| A-15 | **Bahasa & zona waktu**: UI label Inggris, pesan bantuan/konfirmasi Indonesia (§10). Semua timestamp disimpan UTC, ditampilkan `Asia/Jakarta`. | — | — | ⏳ |
| A-16 | **Klaim tidak bisa dibatalkan setelah `PUBLISHED`** selain lewat jalur `IGNORED`. Tidak ada status `CANCELLED` karena tidak disebut di §5. | Butuh jalur pembatalan darurat. | Sedang — status baru + transisi | ⏳ |
| A-17 | **Auto-save draft tiap 30 detik** (§6 Modul 1) hanya menyimpan ke server bila form berubah (dirty), untuk menghindari update kosong beruntun di `AuditLog`. Auto-save tidak menulis `AuditLog`. | Jejak perubahan draft tidak lengkap. | Murah | ⏳ |
| A-19 | **Dokumen dicetak dua kali**: saat klaim dikirim (blok tanda tangan QA Head masih kosong) dan saat disetujui (lengkap). Versi lama disimpan, tidak ditimpa. | Pelanggan menerima lembar yang blok persetujuannya kosong bila dikirim dari versi pertama. | Murah — satu pemanggilan di claim-notifications.ts | ⏳ |
| A-20 | **Token halaman cetak berlaku dua menit** dan terikat satu dokumen + satu klaim. Cukup untuk Puppeteer, terlalu singkat untuk disebar ulang. | Pencetakan pada server yang sangat lambat bisa gagal. | Murah — satu konstanta di print-token.ts | ⏳ |
| A-18 | **File upload**: maks 10 MB/file, tipe `image/jpeg|png|webp`, `application/pdf`, Office (docx/xlsx). Disimpan `/storage/uploads/{claimNo}/{entityType}/{uuid}.{ext}`; draft pakai `_DRAFT-{claimId}` lalu di-rename saat Claim No terbit. | Format lain ditolak. | Murah | ⏳ |

## Cara mengubah asumsi

Semua asumsi di atas terwujud sebagai **konstanta bernama**, bukan `if` yang tersebar:
`CPAR_SECTION_OWNERS`, `requiredVerifiers()`, `visibleClaimsWhere()`, `PERMISSION_MATRIX`,
`MONITORING_DEFAULTS`, `UPLOAD_LIMITS`. Kalau salah satu asumsi Anda tolak, perubahannya terlokalisasi
di satu file dan unit test yang gagal akan menunjukkan konsekuensinya.
