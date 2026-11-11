import { describe, expect, it } from "vitest";

import {
  ACCEPT_EVIDENCE,
  ACCEPT_IMAGES,
  OFFICE_EXTENSIONS,
  SERVER_ACTION_BODY_LIMIT_MB,
  UPLOAD_LIMITS,
  isAllowedType,
  isOfficeDocument,
  maxUploadLabel,
  resolveUploadType,
  validateUploadFile,
} from "@/lib/uploads";

/**
 * Batas unggahan (asumsi A-18).
 *
 * Yang diuji terutama penentuan jenis berkas: ia berjalan di dua tempat — peramban
 * sebelum mengirim, dan server sebelum menyimpan — dan keduanya harus memutuskan sama.
 */

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const file = (name: string, type: string, size = 1024) => ({ name, type, size });

describe("batas ukuran", () => {
  it("batas badan Server Action selalu di atas batas berkas", () => {
    // Keduanya berselisih sekali, dan gejalanya menyesatkan: unggahan ditolak HTTP 413
    // sebelum kode aplikasi berjalan, jadi pesan ramah dari validator tidak pernah
    // sempat tampil.
    expect(SERVER_ACTION_BODY_LIMIT_MB).toBeGreaterThan(UPLOAD_LIMITS.maxBytes / 1024 / 1024);
  });

  it("menolak berkas di atas batas, dan menyebut dua angkanya", () => {
    const problem = validateUploadFile(file("besar.pdf", "application/pdf", 30 * 1024 * 1024));

    expect(problem).toContain("30.0 MB");
    expect(problem).toContain(maxUploadLabel());
  });

  it("menolak berkas kosong", () => {
    expect(validateUploadFile(file("kosong.pdf", "application/pdf", 0))).toBe("Berkas kosong.");
  });
});

describe("resolveUploadType", () => {
  it("memercayai MIME yang memang diizinkan", () => {
    expect(resolveUploadType(file("foto.jpg", "image/jpeg"))).toBe("image/jpeg");
    expect(resolveUploadType(file("laporan.pdf", "application/pdf"))).toBe("application/pdf");
    expect(resolveUploadType(file("notulen.docx", DOCX))).toBe(DOCX);
  });

  it("memakai ekstensi ketika peramban mengaku tidak tahu", () => {
    // Inilah kiriman Windows yang sebenarnya: .docx yang sah dengan MIME octet-stream.
    // Menolaknya berarti menolak berkas yang benar, dan pengunggahnya tidak punya cara
    // memperbaikinya.
    expect(resolveUploadType(file("notulen.docx", "application/octet-stream"))).toBe(DOCX);
    expect(resolveUploadType(file("data.xlsx", ""))).toBe(XLSX);
    expect(resolveUploadType(file("materi.pptx", "application/zip"))).toBe(PPTX);
    expect(resolveUploadType(file("NOTULEN.DOCX", ""))).toBe(DOCX);
  });

  it("tidak memakai ekstensi untuk menimpa MIME yang sudah jelas", () => {
    // MIME yang jelas tetapi tidak diizinkan tetap ditolak, walau ekstensinya Office.
    expect(resolveUploadType(file("jahat.docx", "application/x-msdownload"))).toBeNull();
  });

  it("menolak format biner Office lama dan yang bermakro", () => {
    // .doc/.xls tidak dapat dibedakan dari berkas biner lain tanpa membaca struktur OLE;
    // .docm dan .xlsm isinya bisa memuat makro.
    for (const name of ["lama.doc", "lama.xls", "lama.ppt", "makro.docm", "makro.xlsm"]) {
      expect(resolveUploadType(file(name, "application/octet-stream")), name).toBeNull();
    }
  });

  it("menolak jenis yang tidak didukung sama sekali", () => {
    expect(resolveUploadType(file("klip.mp4", "video/mp4"))).toBeNull();
    expect(resolveUploadType(file("halaman.html", "text/html"))).toBeNull();
    expect(resolveUploadType(file("gambar.svg", "image/svg+xml"))).toBeNull();
    expect(resolveUploadType(file("tanpa-ekstensi", ""))).toBeNull();
  });

  it("menolak berkas tanpa ekstensi yang dikenal walau MIME-nya kosong", () => {
    expect(resolveUploadType(file("arsip.zip", "application/zip"))).toBeNull();
  });
});

describe("daftar accept", () => {
  it("memuat MIME dan ekstensi sekaligus", () => {
    // Pemilih berkas Windows mencocokkan ekstensi, Android mencocokkan MIME. Menulis
    // salah satunya saja membuat berkas Office tampak kelabu di salah satu dari keduanya.
    for (const extension of OFFICE_EXTENSIONS) {
      expect(ACCEPT_EVIDENCE, extension).toContain(extension);
    }

    expect(ACCEPT_EVIDENCE).toContain(DOCX);
    expect(ACCEPT_EVIDENCE).toContain("application/pdf");
    expect(ACCEPT_EVIDENCE).toContain("image/jpeg");
  });

  it("menyebut tiap jenis sekali saja", () => {
    const parts = ACCEPT_EVIDENCE.split(",");

    expect(new Set(parts).size).toBe(parts.length);
  });

  it("daftar foto tidak pernah menerima dokumen", () => {
    // Foto part masuk ke lembar cetak sebagai gambar; .docx di sana akan menjadi kotak
    // kosong pada PDF yang dikirim ke pelanggan.
    expect(ACCEPT_IMAGES).not.toContain("pdf");
    for (const extension of OFFICE_EXTENSIONS) {
      expect(ACCEPT_IMAGES, extension).not.toContain(extension);
    }
  });
});

describe("isOfficeDocument", () => {
  it("mengenali ketiga format Office, bukan PDF atau gambar", () => {
    // Dipakai menentukan berkas disajikan sebagai unduhan atau dibuka di tab.
    expect(isOfficeDocument(DOCX)).toBe(true);
    expect(isOfficeDocument(XLSX)).toBe(true);
    expect(isOfficeDocument(PPTX)).toBe(true);
    expect(isOfficeDocument("application/pdf")).toBe(false);
    expect(isOfficeDocument("image/jpeg")).toBe(false);
  });

  it("seluruh jenis Office ikut terdaftar sebagai jenis yang diizinkan", () => {
    for (const type of [DOCX, XLSX, PPTX]) {
      expect(isAllowedType(type), type).toBe(true);
    }
  });
});
