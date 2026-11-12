import { crc32 } from "node:zlib";

/**
 * Penulis arsip ZIP, dialirkan sepotong demi sepotong.
 *
 * Ditulis sendiri alih-alih memasang pustaka, dengan dua alasan yang keduanya berasal
 * dari tempat portal ini berjalan:
 *
 *   · tiap dependensi baru adalah satu pemasangan lagi di ponsel lewat Termux, dan
 *     paket arsip adalah satu-satunya tempat yang memerlukannya;
 *   · isinya hampir seluruhnya foto JPEG dan PDF — keduanya sudah terkompresi. Metode
 *     STORE menyalinnya apa adanya, dan itu justru yang diinginkan: deflate atas berkas
 *     yang sudah padat hanya menghabiskan CPU ponsel untuk penghematan nyaris nol.
 *
 * Yang disederhanakan disebutkan terang-terangan: hanya STORE, tanpa ZIP64, tanpa enkripsi.
 * Batas ZIP64 dijaga `ZIP_MAX_BYTES` dan dilempar sebagai galat, bukan dibiarkan
 * menghasilkan arsip rusak yang baru ketahuan saat orang membukanya.
 */

export interface ZipEntry {
  /** Jalur di dalam arsip, memakai "/" — folder tidak perlu dibuat terpisah. */
  readonly path: string;
  readonly data: Uint8Array;
  readonly modifiedAt?: Date;
}

/** Batas aman tanpa ZIP64: offset dan ukuran pada central directory hanya 32 bit. */
export const ZIP_MAX_BYTES = 0xff_ff_ff_ff;

const UTF8_FLAG = 0x0800;
const METHOD_STORE = 0;

/** Panjang tetap local file header, sebelum nama berkasnya. */
const LOCAL_HEADER_BYTES = 30;

/**
 * Tanggal MS-DOS, format tahun 1980 yang masih dipakai ZIP sampai hari ini.
 *
 * Detiknya hanya punya 5 bit, jadi kelipatan dua detik — itu memang bentuknya, bukan
 * pembulatan yang hilang. Tanggal sebelum 1980 dijepit ke 1980-01-01 karena tidak ada
 * cara menuliskannya, dan arsip dengan tahun negatif ditolak sebagian pembaca.
 */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());

  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Membersihkan satu ruas nama berkas.
 *
 * Nama berkas datang dari unggahan pengguna dan dari judul yang diketik orang, jadi ia
 * dapat memuat apa saja. Yang dibuang bukan sekadar yang jelek dipandang:
 *
 *   · "/" dan "\\" akan membuat ruas tambahan — berkas mendarat di folder yang tidak
 *     pernah diniatkan, termasuk di luar folder paketnya;
 *   · ".." adalah jalur ke atas, dan sebagian pembaca ZIP masih mengikutinya saat
 *     mengekstrak;
 *   · karakter yang dilarang Windows (: * ? " < > |) membuat berkasnya gagal diekstrak
 *     di sana, padahal di sanalah paket ini akan dibuka.
 */
export function safeSegment(segment: string, fallback = "berkas"): string {
  const cleaned = segment
    .replace(/[/\\]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .replace(/\.+$/, "")
    .trim();

  return cleaned.length > 0 ? cleaned.slice(0, 120) : fallback;
}

/** Nama yang belum terpakai di folder yang sama; tabrakan diberi nomor, bukan ditimpa. */
export function uniqueName(taken: Set<string>, name: string): string {
  if (!taken.has(name.toLowerCase())) {
    taken.add(name.toLowerCase());
    return name;
  }

  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";

  for (let counter = 2; counter < 1000; counter += 1) {
    const candidate = `${stem} (${counter})${extension}`;

    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }

  const last = `${stem} (${Date.now()})${extension}`;
  taken.add(last.toLowerCase());

  return last;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

interface CentralRecord {
  readonly name: Uint8Array;
  readonly crc: number;
  readonly size: number;
  readonly offset: number;
  readonly time: number;
  readonly date: number;
}

/**
 * Menghasilkan arsipnya sebagai aliran potongan.
 *
 * Generator, bukan satu Buffer: paket satu klaim dapat berisi puluhan foto, dan
 * menyusunnya utuh di memori lebih dulu adalah persis lonjakan yang membuat Android
 * menghentikan Termux. Tiap berkas melintas sekali, lalu dilepas.
 */
export async function* zipStream(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
): AsyncGenerator<Uint8Array> {
  const central: CentralRecord[] = [];
  let offset = 0;

  for await (const entry of entries) {
    const name = new TextEncoder().encode(entry.path);
    const { time, date } = dosDateTime(entry.modifiedAt ?? new Date());
    const size = entry.data.length;

    // Batasnya diperiksa sebelum CRC dihitung, bukan sesudah: menghitung CRC atas
    // berkas sebesar itu lebih dulu berarti menghabiskan menit-menit CPU ponsel untuk
    // arsip yang memang akan ditolak.
    //
    // Yang dihitung termasuk local header-nya (30 byte tetap + panjang nama), karena
    // yang harus muat di 32 bit adalah offset entri berikutnya — bukan ukuran isinya.
    if (offset + LOCAL_HEADER_BYTES + name.length + size > ZIP_MAX_BYTES) {
      throw new Error(
        "Paket melebihi 4 GB. Pilih lebih sedikit evidence, lalu unduh sisanya terpisah.",
      );
    }

    const crc = crc32(entry.data) >>> 0;

    const header = concat([
      u32(0x04034b50),
      u16(20), // versi minimum pembaca
      u16(UTF8_FLAG),
      u16(METHOD_STORE),
      u16(time),
      u16(date),
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      name,
    ]);

    central.push({ name, crc, size, offset, time, date });
    offset += header.length + size;

    yield header;
    yield entry.data;
  }

  const directory = central.map((record) =>
    concat([
      u32(0x02014b50),
      u16(20), // versi pembuat
      u16(20), // versi minimum pembaca
      u16(UTF8_FLAG),
      u16(METHOD_STORE),
      u16(record.time),
      u16(record.date),
      u32(record.crc),
      u32(record.size),
      u32(record.size),
      u16(record.name.length),
      u16(0), // extra
      u16(0), // komentar
      u16(0), // nomor disk
      u16(0), // atribut internal
      u32(0), // atribut eksternal
      u32(record.offset),
      record.name,
    ]),
  );

  const directoryBytes = concat(directory);

  yield directoryBytes;
  yield concat([
    u32(0x06054b50),
    u16(0), // nomor disk
    u16(0), // disk tempat central directory dimulai
    u16(central.length),
    u16(central.length),
    u32(directoryBytes.length),
    u32(offset),
    u16(0), // panjang komentar
  ]);
}
