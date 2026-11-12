import { describe, expect, it } from "vitest";

import { ZIP_MAX_BYTES, safeSegment, uniqueName, zipStream } from "@/lib/zip";

/**
 * Penulis arsip ZIP.
 *
 * Arsip yang rusak baru ketahuan di komputer penerimanya, berhari-hari kemudian, jadi
 * yang diuji di sini bukan "ada isinya" melainkan bentuk byte-nya: tanda tangan tiap
 * bagian, dan jumlah entri pada central directory. Uji akhir yang sebenarnya adalah
 * `unzip -t` atas arsip sungguhan, dan itu dijalankan di luar berkas ini.
 */

const enc = (text: string) => new TextEncoder().encode(text);

async function archive(entries: Parameters<typeof zipStream>[0]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of zipStream(entries)) chunks.push(chunk);

  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }

  return out;
}

/** Empat byte little-endian pada posisi tertentu. */
const signatureAt = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset, true);

describe("zipStream", () => {
  it("menulis tanda tangan local header, central directory, dan penutupnya", async () => {
    const bytes = await archive([{ path: "a.txt", data: enc("satu") }]);

    expect(signatureAt(bytes, 0)).toBe(0x04034b50);
    // Penutupnya 22 byte terakhir pada arsip tanpa komentar.
    expect(signatureAt(bytes, bytes.length - 22)).toBe(0x06054b50);
  });

  it("menghitung entri pada penutupnya, bukan menebaknya", async () => {
    const bytes = await archive([
      { path: "a.txt", data: enc("satu") },
      { path: "b/c.txt", data: enc("dua") },
      { path: "b/d.txt", data: enc("tiga") },
    ]);

    const view = new DataView(bytes.buffer, bytes.byteOffset);

    expect(view.getUint16(bytes.length - 22 + 8, true)).toBe(3);
    expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(3);
  });

  it("menandai nama sebagai UTF-8", async () => {
    // Tanpa bendera ini, nama berkas berisi huruf beraksen atau tanda pisah panjang
    // terbaca rusak di Windows — dan judul yang diketik orang sering memuatnya.
    const bytes = await archive([{ path: "Foto — kaki pengunci.jpg", data: enc("x") }]);
    const flags = new DataView(bytes.buffer, bytes.byteOffset).getUint16(6, true);

    expect(flags & 0x0800).toBe(0x0800);
  });

  it("menerima berkas kosong", async () => {
    const bytes = await archive([{ path: "kosong.txt", data: new Uint8Array(0) }]);

    expect(signatureAt(bytes, 0)).toBe(0x04034b50);
  });

  it("menerima arsip tanpa entri sama sekali", async () => {
    const bytes = await archive([]);

    expect(bytes.length).toBe(22);
    expect(signatureAt(bytes, 0)).toBe(0x06054b50);
  });

  it("menolak arsip yang melewati batas tanpa ZIP64", async () => {
    // Dibiarkan lewat, offset 32 bit berputar dan arsipnya rusak tanpa ada tanda apa pun
    // sampai orang membukanya. Lebih baik gagal di sini, dengan kalimat yang bisa diikuti.
    const huge = { path: "besar.bin", data: new Uint8Array(1024) };
    const entries = {
      async *[Symbol.asyncIterator]() {
        // Dipalsukan lewat panjang, bukan byte sungguhan: mengalokasikan 4 GB di uji
        // akan menjatuhkan prosesnya sebelum sempat membuktikan apa pun.
        yield { ...huge, data: { length: ZIP_MAX_BYTES } as unknown as Uint8Array };
      },
    };

    await expect(archive(entries)).rejects.toThrow(/4 GB/);
  });
});

describe("safeSegment", () => {
  it("menolak jalur ke atas dan pemisah folder", () => {
    // Sebagian pembaca ZIP masih mengikuti ".." saat mengekstrak, dan berkasnya mendarat
    // di luar folder paketnya.
    expect(safeSegment("../etc/passwd")).toBe("-etc-passwd");
    expect(safeSegment("a/b\\c")).toBe("a-b-c");
    expect(safeSegment("...")).toBe("berkas");
  });

  it("membuang karakter yang dilarang Windows", () => {
    // Di sanalah paket ini akan dibuka; nama berisi ":" gagal diekstrak tanpa penjelasan.
    expect(safeSegment('lap:oran*"<>|?.pdf')).toBe("lap-oran------.pdf");
  });

  it("menjaga huruf beraksen dan tanda pisah panjang", () => {
    expect(safeSegment("Foto — kaki pengunci.jpg")).toBe("Foto — kaki pengunci.jpg");
  });

  it("memotong nama yang kepanjangan", () => {
    // Batas jalur di Windows masih 260 karakter, dan nama berkas di sini berasal dari
    // judul yang diketik orang — yang bisa sepanjang satu kalimat.
    expect(safeSegment("A".repeat(400))).toHaveLength(120);
  });

  it("memakai cadangan ketika tidak ada yang tersisa", () => {
    expect(safeSegment("   ", "dokumen.pdf")).toBe("dokumen.pdf");
  });
});

describe("uniqueName", () => {
  it("memberi nomor pada nama yang sudah terpakai, bukan menimpanya", () => {
    // Dua orang mengunggah "IMG_0001.jpg" ke bagian yang sama adalah kejadian biasa.
    const taken = new Set<string>();

    expect(uniqueName(taken, "foto.jpg")).toBe("foto.jpg");
    expect(uniqueName(taken, "foto.jpg")).toBe("foto (2).jpg");
    expect(uniqueName(taken, "foto.jpg")).toBe("foto (3).jpg");
  });

  it("menganggap beda huruf besar-kecil sebagai nama yang sama", () => {
    // Windows dan macOS tidak membedakannya; dua berkas itu akan saling menimpa saat
    // diekstrak di sana.
    const taken = new Set<string>();

    expect(uniqueName(taken, "Foto.jpg")).toBe("Foto.jpg");
    expect(uniqueName(taken, "FOTO.JPG")).toBe("FOTO (2).JPG");
  });

  it("menyisipkan nomor sebelum ekstensi, bukan sesudahnya", () => {
    const taken = new Set(["laporan.pdf"]);

    expect(uniqueName(taken, "laporan.pdf")).toBe("laporan (2).pdf");
  });

  it("menangani nama tanpa ekstensi", () => {
    const taken = new Set(["catatan"]);

    expect(uniqueName(taken, "catatan")).toBe("catatan (2)");
  });
});
