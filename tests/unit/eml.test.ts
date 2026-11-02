import { describe, expect, it } from "vitest";

import { decodeHeaderValue, parseEml } from "../../scripts/lib/eml.mjs";

/**
 * Pembaca .eml dipakai penangkap SMTP untuk mencetak ringkasan dan menyajikan penampil
 * email. Yang diuji di sini justru hal-hal yang gagal dalam diam: header terpotong dan
 * teks berubah menjadi mojibake masih "berhasil dibaca", hanya isinya salah.
 */

const CRLF = "\r\n";

function eml(lines: readonly string[]): string {
  return lines.join(CRLF);
}

describe("decodeHeaderValue", () => {
  it("membuka Q-encoding beserta garis bawah sebagai spasi", () => {
    expect(decodeHeaderValue("=?UTF-8?Q?Review_request?=")).toBe("Review request");
  });

  it("membuka B-encoding", () => {
    const encoded = Buffer.from("Klaim ditutup", "utf8").toString("base64");

    expect(decodeHeaderValue(`=?UTF-8?B?${encoded}?=`)).toBe("Klaim ditutup");
  });

  it("menyambung encoded-word berdampingan tanpa menyisipkan spasi", () => {
    // Inilah bentuk subject panjang yang dilipat nodemailer. Spasi di antara dua
    // encoded-word hanya penanda lipatan; menyisakannya memecah kata di tengah.
    const value = "=?UTF-8?Q?menunggu_kep?= =?UTF-8?Q?utusan?=";

    expect(decodeHeaderValue(value)).toBe("menunggu keputusan");
  });

  it("menyusun ulang byte UTF-8 yang terpotong antar encoded-word", () => {
    // "—" (em dash) adalah tiga byte; nodemailer kadang memotongnya persis di tengah.
    const value = "=?UTF-8?Q?A_=E2=80?= =?UTF-8?Q?=94_B?=";

    expect(decodeHeaderValue(value)).toBe("A — B");
  });

  it("membiarkan header biasa apa adanya", () => {
    expect(decodeHeaderValue("[NCC] Review request")).toBe("[NCC] Review request");
  });

  it("menghasilkan string kosong untuk nilai yang tidak ada", () => {
    expect(decodeHeaderValue(undefined)).toBe("");
  });
});

describe("parseEml", () => {
  it("menyatukan header yang dilipat ke beberapa baris", () => {
    const raw = eml([
      "From: NCC Portal <ncc@nifco.co.id>",
      "To: satu@nifco.co.id, dua@nifco.co.id,",
      " tiga@nifco.co.id",
      "Subject: =?UTF-8?Q?Pengingat=3A_CPAR_menunggu_kep?=",
      " =?UTF-8?Q?utusan?=",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "isi",
    ]);

    const mail = parseEml(raw);

    expect(mail.subject).toBe("Pengingat: CPAR menunggu keputusan");
    expect(mail.to).toEqual(["satu@nifco.co.id", "dua@nifco.co.id", "tiga@nifco.co.id"]);
  });

  it("tidak memecah daftar alamat pada koma di dalam nama berkutip", () => {
    const raw = eml([
      'To: "Setiawan, Bambang" <bambang@nifco.co.id>, rina@nifco.co.id',
      "Content-Type: text/plain",
      "",
      "isi",
    ]);

    expect(parseEml(raw).to).toEqual([
      '"Setiawan, Bambang" <bambang@nifco.co.id>',
      "rina@nifco.co.id",
    ]);
  });

  it("menyusun ulang UTF-8 dari quoted-printable, bukan per byte", () => {
    // "·" adalah dua byte. Mengubah tiap =XX menjadi karakter sendiri menghasilkan "Â·".
    const raw = eml([
      "Subject: uji",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "NIFCO =C2=B7 PT Nifco",
    ]);

    expect(parseEml(raw).text).toContain("NIFCO · PT Nifco");
  });

  it("menyambung baris yang dilipat lunak oleh quoted-printable", () => {
    const raw = eml([
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "countermeasure be=",
      "lum lengkap",
    ]);

    expect(parseEml(raw).text).toBe("countermeasure belum lengkap");
  });

  it("memilih bagian HTML dan teks dari multipart/alternative", () => {
    const raw = eml([
      "Subject: uji",
      'Content-Type: multipart/alternative; boundary="BATAS"',
      "",
      "--BATAS",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "versi teks",
      "--BATAS",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>versi html</p>",
      "--BATAS--",
    ]);

    const mail = parseEml(raw);

    expect(mail.text.trim()).toBe("versi teks");
    expect(mail.html.trim()).toBe("<p>versi html</p>");
  });

  it("menelusuri multipart bersarang dan memisahkan lampiran", () => {
    const pdf = Buffer.from("%PDF-1.4 contoh", "utf8");
    const raw = eml([
      "Subject: uji",
      'Content-Type: multipart/mixed; boundary="LUAR"',
      "",
      "--LUAR",
      'Content-Type: multipart/alternative; boundary="DALAM"',
      "",
      "--DALAM",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>halo</p>",
      "--DALAM--",
      "--LUAR",
      "Content-Type: application/pdf",
      'Content-Disposition: attachment; filename="bad-news.pdf"',
      "Content-Transfer-Encoding: base64",
      "",
      pdf.toString("base64"),
      "--LUAR--",
    ]);

    const mail = parseEml(raw);

    expect(mail.html.trim()).toBe("<p>halo</p>");
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].filename).toBe("bad-news.pdf");
    expect(mail.attachments[0].content.toString("utf8")).toBe("%PDF-1.4 contoh");
  });

  it("tidak melempar untuk berkas rusak, dan tetap menyerahkan header", () => {
    const raw = eml([
      "Subject: masih terbaca",
      'Content-Type: multipart/mixed; boundary="HILANG"',
      "",
      "badan tanpa boundary sama sekali",
    ]);

    const mail = parseEml(raw);

    expect(mail.subject).toBe("masih terbaca");
    expect(mail.html).toBe("");
  });

  it("memberi tanggal null bila header Date tidak masuk akal", () => {
    const raw = eml(["Subject: uji", "Date: bukan tanggal", "Content-Type: text/plain", "", "isi"]);

    expect(parseEml(raw).date).toBeNull();
  });
});
