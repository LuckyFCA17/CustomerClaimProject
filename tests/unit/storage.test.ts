import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pemindahan folder lampiran saat draft memperoleh nomor klaim.
 *
 * Diuji dengan folder sementara sungguhan, bukan dengan tiruan `fs`. Yang ingin
 * dipastikan di sini justru perilaku sistem berkas — `rename` menolak folder tujuan yang
 * sudah berisi — dan tiruan hanya akan mengulang asumsi yang sedang diperiksa.
 */

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ncc-storage-"));
  process.env.STORAGE_ROOT = root;

  // Modul menyimpan akar penyimpanan saat dipanggil, bukan saat diimpor, tetapi
  // cache modul tetap dibersihkan supaya tiap kasus berdiri sendiri.
  vi.resetModules();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  delete process.env.STORAGE_ROOT;
});

async function storage() {
  return (await import("@/lib/storage")).storage;
}

async function seedFolder(name: string, files: readonly string[]) {
  await mkdir(path.join(root, name), { recursive: true });

  for (const file of files) {
    await writeFile(path.join(root, name, file), file, "utf8");
  }
}

describe("storage.moveFolder", () => {
  it("memindahkan folder draft ke nama bernomor klaim", async () => {
    await seedFolder("_DRAFT-abc", ["satu.jpg", "dua.pdf"]);

    await (await storage()).moveFolder("_DRAFT-abc", "NID-CC-26-11-0001");

    expect((await readdir(path.join(root, "NID-CC-26-11-0001"))).sort()).toEqual([
      "dua.pdf",
      "satu.jpg",
    ]);
    await expect(readdir(path.join(root, "_DRAFT-abc"))).rejects.toThrow();
  });

  it("diam saja bila draft tidak punya lampiran", async () => {
    await expect(
      (await storage()).moveFolder("_DRAFT-kosong", "NID-CC-26-11-0002"),
    ).resolves.toBeUndefined();
  });

  /**
   * Inilah kasus yang membuat pengiriman klaim gagal di lapangan: `rename` menolak dengan
   * ENOTEMPTY, galatnya naik, dan perpindahan status ikut dibatalkan — pengguna melihat
   * klaimnya menolak terkirim tanpa sebab yang dapat ia perbaiki.
   */
  it("menggabungkan isi bila folder tujuan sudah ada dan berisi", async () => {
    await seedFolder("_DRAFT-xyz", ["baru.jpg"]);
    await seedFolder("NID-CC-26-11-0003", ["lama.jpg"]);

    await (await storage()).moveFolder("_DRAFT-xyz", "NID-CC-26-11-0003");

    expect((await readdir(path.join(root, "NID-CC-26-11-0003"))).sort()).toEqual([
      "baru.jpg",
      "lama.jpg",
    ]);
    await expect(readdir(path.join(root, "_DRAFT-xyz"))).rejects.toThrow();
  });

  it("menolak jalur yang keluar dari akar penyimpanan", async () => {
    await expect((await storage()).moveFolder("../keluar", "NID-CC-26-11-0004")).rejects.toThrow();
  });
});
