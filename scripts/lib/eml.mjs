/**
 * Pembaca berkas .eml secukupnya.
 *
 * Dipakai penangkap SMTP (scripts/mail-sink.mjs) untuk dua hal: mencetak ringkasan yang
 * terbaca di terminal, dan menyajikan email tertangkap di penampil web supaya dapat
 * dibuka dari ponsel.
 *
 * Bukan parser MIME umum, dan tidak berpura-pura begitu. Yang dibaca di sini hanya email
 * yang portal ini sendiri kirimkan lewat nodemailer: multipart/alternative berisi
 * text/plain dan text/html, dibungkus multipart/mixed bila ada lampiran. Memasang
 * mailparser hanya untuk itu berarti menambah dependensi produksi demi alat bantu
 * pengembangan.
 *
 * Dua jebakan yang ditangani dengan sengaja, karena keduanya pernah membuat ringkasan
 * di terminal tidak terbaca:
 *
 *  1. Header panjang dilipat ke beberapa baris (RFC 5322 §2.2.3). Membaca satu baris
 *     saja memotong subject di tengah kata.
 *  2. Subject berisi karakter non-ASCII dikodekan RFC 2047, dan nodemailer memilih
 *     Q-encoding maupun B-encoding tergantung isinya. Menangani B saja menyisakan
 *     deretan "=?UTF-8?Q?..." mentah di layar.
 */

/** Memisahkan blok header dari badan, apa pun gaya akhir barisnya. */
function split(raw) {
  const match = /\r?\n\r?\n/.exec(raw);
  if (!match) return { head: raw, body: "" };

  return { head: raw.slice(0, match.index), body: raw.slice(match.index + match[0].length) };
}

/**
 * Menyatukan header yang dilipat, lalu memetakannya.
 *
 * Nama header disimpan huruf kecil: pengirim bebas menulis "Message-ID" atau
 * "Message-Id", dan pemanggil tidak perlu menebak mana yang dipakai.
 */
function headersOf(head) {
  const unfolded = head.replace(/\r?\n[ \t]+/g, " ");
  const map = new Map();

  for (const line of unfolded.split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at < 1) continue;

    const name = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();

    // Header yang muncul berulang (Received) digabung, bukan saling menimpa.
    map.set(name, map.has(name) ? `${map.get(name)}, ${value}` : value);
  }

  return map;
}

function decodeQ(text) {
  const bytes = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "_") {
      bytes.push(0x20);
    } else if (char === "=" && /^[0-9a-f]{2}$/i.test(text.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(text.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(...Buffer.from(char, "latin1"));
    }
  }

  return Buffer.from(bytes);
}

const ENCODED_WORD = /=\?([^?]+)\?([bq])\?([^?]*)\?=/gi;

function toText(buffer, charset) {
  try {
    return buffer.toString(charset.toLowerCase() === "utf-8" ? "utf8" : charset);
  } catch {
    return buffer.toString("utf8");
  }
}

/**
 * Membuka header berkodekan RFC 2047.
 *
 * Dua hal yang ditangani di sini, keduanya muncul pada subject panjang yang dilipat:
 *
 *  1. Spasi di antara dua encoded-word berdampingan dibuang. Spasi itu penanda lipatan,
 *     bukan bagian teks; menyisakannya memecah kata menjadi "…kep utusan…".
 *  2. Encoded-word berdampingan digabung sebagai BYTE lebih dulu, baru di-decode sekali.
 *     Satu karakter UTF-8 bisa tiga byte, dan sebagian pengirim memotongnya persis di
 *     batas encoded-word. Men-decode tiap potongan sendiri-sendiri mengubah separuh
 *     karakter menjadi U+FFFD, dan kerusakan itu tidak dapat diperbaiki belakangan.
 */
export function decodeHeaderValue(value) {
  if (!value) return "";

  const text = value.replace(/(\?=)\s+(?==\?)/g, "$1");

  let out = "";
  let pending = null;
  let last = 0;

  const flush = () => {
    if (!pending) return;

    out += toText(Buffer.concat(pending.chunks), pending.charset);
    pending = null;
  };

  ENCODED_WORD.lastIndex = 0;

  for (let match = ENCODED_WORD.exec(text); match; match = ENCODED_WORD.exec(text)) {
    const [whole, charset, encoding, payload] = match;

    // Teks biasa di antara encoded-word memutus rangkaian byte.
    if (match.index > last) {
      flush();
      out += text.slice(last, match.index);
    }

    const chunk = encoding.toLowerCase() === "b" ? Buffer.from(payload, "base64") : decodeQ(payload);

    if (pending && pending.charset.toLowerCase() === charset.toLowerCase()) {
      pending.chunks.push(chunk);
    } else {
      flush();
      pending = { charset, chunks: [chunk] };
    }

    last = match.index + whole.length;
  }

  flush();

  return out + text.slice(last);
}

/**
 * Quoted-printable menjadi byte, bukan langsung menjadi teks.
 *
 * `=C2=B7` adalah satu karakter "·" dalam dua byte UTF-8. Mengubah tiap `=XX` menjadi
 * karakter sendiri-sendiri menghasilkan mojibake, jadi seluruh badan dikumpulkan sebagai
 * byte lebih dulu dan baru di-decode sekali di akhir.
 */
function decodeQuotedPrintable(body) {
  const bytes = [];
  // Baris yang berakhir "=" adalah lipatan lunak: barisnya disambung, "=" dibuang.
  const text = body.replace(/=\r?\n/g, "");

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "=" && /^[0-9a-f]{2}$/i.test(text.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(text.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(...Buffer.from(char, "latin1"));
    }
  }

  return Buffer.from(bytes);
}

function decodeBody(body, encoding) {
  const kind = (encoding ?? "7bit").toLowerCase();

  if (kind === "base64") return Buffer.from(body, "base64");
  if (kind === "quoted-printable") return decodeQuotedPrintable(body);

  return Buffer.from(body, "utf8");
}

/** Mengambil satu parameter dari header berparameter, misal `charset` atau `boundary`. */
function param(value, name) {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]+)"|${name}\\s*=\\s*([^;\\s]+)`, "i").exec(
    value ?? "",
  );

  return match ? (match[1] ?? match[2]) : undefined;
}

/**
 * Memecah badan multipart pada boundary-nya.
 *
 * Pemisahnya adalah "--<boundary>" di awal baris; penutupnya "--<boundary>--". Bagian
 * sebelum pemisah pertama (preamble) dan sesudah penutup (epilogue) dibuang — keduanya
 * hanya untuk klien email yang tidak mengerti MIME.
 */
function splitParts(body, boundary) {
  const marker = `--${boundary}`;
  const chunks = body.split(new RegExp(`^${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m"));

  return chunks
    .slice(1)
    .filter((chunk) => !/^--/.test(chunk.trimStart().slice(0, 2)))
    .map((chunk) => chunk.replace(/^\r?\n/, ""));
}

/**
 * Menelusuri satu bagian MIME, menambahkan hasilnya ke `collected`.
 *
 * Rekursif karena email berlampiran berbentuk multipart/mixed yang bagian pertamanya
 * sendiri sebuah multipart/alternative.
 */
function walk(raw, collected) {
  const { head, body } = split(raw);
  const headers = headersOf(head);
  const contentType = headers.get("content-type") ?? "text/plain";
  const mime = contentType.split(";")[0].trim().toLowerCase();

  if (mime.startsWith("multipart/")) {
    const boundary = param(contentType, "boundary");
    if (!boundary) return;

    for (const part of splitParts(body, boundary)) walk(part, collected);
    return;
  }

  const encoding = headers.get("content-transfer-encoding");
  const content = decodeBody(body, encoding);
  const filename =
    decodeHeaderValue(param(headers.get("content-disposition"), "filename")) ||
    decodeHeaderValue(param(contentType, "name"));
  const disposition = (headers.get("content-disposition") ?? "").toLowerCase();
  const isAttachment = disposition.includes("attachment") || Boolean(filename);

  if (isAttachment) {
    collected.attachments.push({ filename: filename || "(tanpa nama)", mime, content });
    return;
  }

  const charset = param(contentType, "charset") ?? "utf-8";
  let text;

  try {
    text = content.toString(charset.toLowerCase() === "utf-8" ? "utf8" : charset);
  } catch {
    text = content.toString("utf8");
  }

  // Bagian terakhir menang: multipart/alternative menaruh versi terkaya di belakang.
  if (mime === "text/html") collected.html = text;
  else if (mime === "text/plain") collected.text = text;
}

/** Memisah daftar alamat pada koma yang berada di luar tanda kutip dan di luar `<>`. */
function addresses(value) {
  if (!value) return [];

  const out = [];
  let buffer = "";
  let quoted = false;
  let angled = false;

  for (const char of value) {
    if (char === '"') quoted = !quoted;
    else if (char === "<") angled = true;
    else if (char === ">") angled = false;

    if (char === "," && !quoted && !angled) {
      out.push(buffer.trim());
      buffer = "";
      continue;
    }

    buffer += char;
  }

  if (buffer.trim()) out.push(buffer.trim());

  return out.map((entry) => decodeHeaderValue(entry)).filter(Boolean);
}

/**
 * Membaca satu berkas .eml menjadi bentuk yang siap ditampilkan.
 *
 * Tidak pernah melempar: berkas yang gagal dibaca tetap menghasilkan objek, dengan
 * `html` dan `text` kosong. Penampil email yang mati total karena satu berkas aneh lebih
 * merepotkan daripada penampil yang menunjukkan satu baris kosong.
 */
export function parseEml(raw) {
  const { head } = split(raw);
  const headers = headersOf(head);
  const collected = { html: "", text: "", attachments: [] };

  try {
    walk(raw, collected);
  } catch {
    // Isinya dibiarkan kosong; header di bawah masih berguna untuk mengenali emailnya.
  }

  const date = headers.get("date");
  const parsedDate = date ? new Date(date) : null;

  return {
    from: decodeHeaderValue(headers.get("from") ?? ""),
    to: addresses(headers.get("to")),
    cc: addresses(headers.get("cc")),
    subject: decodeHeaderValue(headers.get("subject") ?? "(tanpa subject)"),
    messageId: headers.get("message-id") ?? "",
    date: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
    html: collected.html,
    text: collected.text,
    attachments: collected.attachments,
  };
}
