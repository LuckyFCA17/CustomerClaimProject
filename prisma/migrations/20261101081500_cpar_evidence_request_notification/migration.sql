-- Notifikasi untuk orang yang diminta melengkapi dokumen atau mengerjakan tindakan
-- perbaikan, beserta bukti pelaksanaannya.
--
-- Hanya menambah nilai enum. Pemakaiannya terjadi pada transaksi lain saat runtime,
-- jadi tidak terkena larangan PostgreSQL soal memakai nilai enum baru di transaksi
-- yang menambahkannya.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CPAR_EVIDENCE_REQUEST';
