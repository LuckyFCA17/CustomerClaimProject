import { createServer } from "node:http";
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";

import { SMTPServer } from "smtp-server";

import { parseEml } from "./lib/eml.mjs";

/**
 * Penangkap SMTP untuk pengembangan, berikut penampilnya.
 *
 * Padanan MailHog bagi lingkungan yang tidak punya Docker (lihat README). Email tidak
 * pernah diteruskan ke mana pun: isinya ditulis ke berkas .eml, ringkasannya dicetak ke
 * terminal, dan penampil web menyajikannya agar dapat dibuka dari ponsel di jaringan
 * yang sama.
 *
 *   node scripts/mail-sink.mjs [--port 1025] [--http 1080] [--out .mail] [--host 0.0.0.0]
 *
 * Catatan penting tentang penampilnya: yang ditampilkan adalah HTML email yang dirender
 * oleh peramban ponsel, BUKAN oleh Gmail. Gmail membuang sebagian CSS, memaksa mode
 * gelap, dan memotong email di atas 102KB. Jadi penampil ini memeriksa isi dan tautan
 * dengan cepat — ia tidak menggantikan satu kali kirim sungguhan ke kotak masuk Gmail
 * (lihat `pnpm mail:test`).
 */

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

const smtpPort = Number(arg("port", 1025));
const httpPort = Number(arg("http", 1080));
const host = arg("host", "0.0.0.0");
const outDir = path.resolve(arg("out", ".mail"));
const withViewer = !process.argv.includes("--no-http");

mkdirSync(outDir, { recursive: true });

/**
 * Nomor berkas dilanjutkan dari yang sudah ada, tidak dimulai dari nol.
 *
 * Penangkap ini sering dimatikan dan dinyalakan ulang di tengah pengujian. Penghitung
 * yang selalu mulai dari 1 menimpa 001.eml, jadi email yang baru saja diperiksa hilang
 * justru ketika dibandingkan dengan email berikutnya.
 */
function lastNumber() {
  try {
    return readdirSync(outDir)
      .map((name) => Number.parseInt(name, 10))
      .filter((value) => Number.isFinite(value))
      .reduce((highest, value) => Math.max(highest, value), 0);
  } catch {
    return 0;
  }
}

let counter = lastNumber();

const server = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  onData(stream, session, callback) {
    const chunks = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => {
      counter += 1;

      const raw = Buffer.concat(chunks).toString("utf8");
      const file = path.join(outDir, `${String(counter).padStart(3, "0")}.eml`);

      writeFileSync(file, raw, "utf8");

      const mail = parseEml(raw);

      console.log(
        [
          `#${counter}`,
          `to=${session.envelope.rcptTo.map((r) => r.address).join(",")}`,
          `subject=${mail.subject}`,
          mail.attachments.length
            ? `attachments=${mail.attachments.map((a) => a.filename).join(",")}`
            : "",
          `file=${path.relative(process.cwd(), file)}`,
        ]
          .filter(Boolean)
          .join("  "),
      );

      callback();
    });
  },
});

server.on("error", (error) => console.error("SMTP sink:", error.message));

server.listen(smtpPort, host, () => {
  console.log(`SMTP sink mendengarkan di ${host}:${smtpPort}, email disimpan ke ${outDir}`);
});

/* ---------------------------------------------------------------- penampil web */

/** Daftar email tertangkap, terbaru di atas. */
function inbox() {
  let names;

  try {
    names = readdirSync(outDir).filter((name) => name.endsWith(".eml"));
  } catch {
    return [];
  }

  return names
    .map((name) => {
      const file = path.join(outDir, name);

      try {
        const raw = readFileSync(file, "utf8");
        const mail = parseEml(raw);

        return { id: name.replace(/\.eml$/, ""), name, raw, mail, mtime: statSync(file).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.mtime - left.mtime);
}

function find(id) {
  // Hanya nama berkas datar yang diterima; "../" tidak boleh menembus ke luar .mail.
  if (!/^[\w-]+$/.test(id)) return null;

  const file = path.join(outDir, `${id}.eml`);

  try {
    const raw = readFileSync(file, "utf8");
    return { id, file, raw, mail: parseEml(raw) };
  } catch {
    return null;
  }
}

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );

const CSS = `
*{box-sizing:border-box}
body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  color:#1f2933;background:#f4f5f7}
header{position:sticky;top:0;background:#b45a15;color:#fff;padding:12px 16px;z-index:5}
header a{color:#fff;text-decoration:none}
h1{margin:0;font-size:15px;font-weight:700;letter-spacing:.04em}
.sub{font-size:11px;opacity:.85}
main{padding:12px 16px 32px;max-width:900px;margin:0 auto}
.warn{background:#fff4e5;border:1px solid #f0c48a;border-radius:8px;padding:10px 12px;
  font-size:12px;margin:0 0 12px}
ul{list-style:none;margin:0;padding:0}
li{background:#fff;border:1px solid #e4e7eb;border-radius:10px;margin:0 0 8px}
li a.row{display:block;padding:12px 14px;text-decoration:none;color:inherit}
.subject{font-weight:600;font-size:14px}
.meta{font-size:12px;color:#6b7280;margin-top:3px;word-break:break-word}
.pill{display:inline-block;background:#f4f5f7;border:1px solid #e4e7eb;border-radius:999px;
  padding:1px 8px;font-size:11px;color:#6b7280;margin-right:4px}
.empty{background:#fff;border:1px dashed #cbd2d9;border-radius:10px;padding:28px 16px;
  text-align:center;color:#6b7280;font-size:14px}
.bar{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.btn{display:inline-block;background:#fff;border:1px solid #cbd2d9;border-radius:8px;
  padding:8px 14px;font-size:13px;color:#1f2933;text-decoration:none;cursor:pointer;
  min-height:40px;line-height:22px}
.btn.on{background:#b45a15;border-color:#b45a15;color:#fff}
.btn.danger{color:#b4151a;border-color:#eccbcb}
table.h{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e4e7eb;
  border-radius:10px;overflow:hidden;margin:0 0 12px;font-size:13px}
table.h td{padding:7px 12px;border-bottom:1px solid #f0f2f4;vertical-align:top}
table.h td:first-child{color:#6b7280;width:92px;white-space:nowrap}
table.h tr:last-child td{border-bottom:0}
.frame{background:#fff;border:1px solid #e4e7eb;border-radius:10px;overflow:hidden;
  margin:0 auto;transition:max-width .15s}
iframe{display:block;width:100%;height:78vh;border:0;background:#fff}
.hint{font-size:12px;color:#6b7280;margin:0 0 10px}
pre{background:#fff;border:1px solid #e4e7eb;border-radius:10px;padding:12px;
  font-size:12px;white-space:pre-wrap;word-break:break-word;overflow-x:auto}
`;

function page(title, body) {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title><style>${CSS}</style></head>
<body><header><a href="/"><h1>NCC MAIL SINK</h1>
<div class="sub">email tertangkap · hanya untuk pengembangan</div></a></header>
<main>${body}</main></body></html>`;
}

function listPage() {
  const messages = inbox();

  const rows = messages
    .map((entry) => {
      const when = entry.mail.date ?? new Date(entry.mtime);
      const recipients = [...entry.mail.to, ...entry.mail.cc];

      return `<li><a class="row" href="/m/${escape(entry.id)}">
<div class="subject">${escape(entry.mail.subject)}</div>
<div class="meta">${escape(recipients.join(", ")) || "(tanpa penerima)"}</div>
<div class="meta"><span class="pill">#${escape(entry.id)}</span>
<span class="pill">${escape(when.toLocaleString("id-ID"))}</span>
${entry.mail.attachments.length ? `<span class="pill">${entry.mail.attachments.length} lampiran</span>` : ""}
${entry.mail.html ? "" : '<span class="pill">tanpa HTML</span>'}</div></a></li>`;
    })
    .join("");

  const body =
    `<p class="warn"><strong>Ini rendering peramban, bukan rendering Gmail.</strong>
Gmail membuang sebagian CSS dan memaksa mode gelap. Untuk memastikan tampilan di
aplikasi Gmail Android, kirim sungguhan dengan <code>pnpm mail:test</code>.</p>` +
    `<div class="bar"><a class="btn" href="/">Muat ulang</a>` +
    (messages.length
      ? `<a class="btn danger" href="/clear" onclick="return confirm('Hapus seluruh ${messages.length} email tertangkap?')">Hapus semua</a>`
      : "") +
    `</div>` +
    (messages.length
      ? `<ul>${rows}</ul>`
      : `<p class="empty">Belum ada email tertangkap.<br>Jalankan portal lalu picu satu perpindahan status.</p>`);

  return page("Mail sink", body);
}

function detailPage(entry) {
  const mail = entry.mail;
  const when = mail.date ? mail.date.toLocaleString("id-ID") : "(tanpa tanggal)";
  const bytes = Buffer.byteLength(mail.html, "utf8");

  const rows = [
    ["Subject", mail.subject],
    ["Dari", mail.from],
    ["Kepada", mail.to.join(", ") || "—"],
    mail.cc.length ? ["CC", mail.cc.join(", ")] : null,
    ["Waktu", when],
    [
      "Ukuran HTML",
      // Gmail memotong email di atas 102KB dan menyembunyikan sisanya di balik
      // "Message clipped", termasuk tombol yang biasanya berada di bagian bawah.
      `${(bytes / 1024).toFixed(1)} KB${bytes > 102_000 ? " — di atas 102KB, Gmail akan memotongnya" : ""}`,
    ],
    mail.attachments.length
      ? [
          "Lampiran",
          mail.attachments
            .map(
              (file, index) =>
                `<a href="/m/${escape(entry.id)}/att/${index}">${escape(file.filename)}</a>`,
            )
            .join(", "),
        ]
      : null,
  ].filter(Boolean);

  const table = `<table class="h"><tbody>${rows
    .map(
      ([label, value]) =>
        `<tr><td>${escape(label)}</td><td>${label === "Lampiran" ? value : escape(value)}</td></tr>`,
    )
    .join("")}</tbody></table>`;

  const body = `<div class="bar">
<a class="btn" href="/">&larr; Kotak masuk</a>
<a class="btn" href="/m/${escape(entry.id)}/html" target="_blank" rel="noopener">Buka HTML</a>
<a class="btn" href="/m/${escape(entry.id)}/text" target="_blank" rel="noopener">Versi teks</a>
<a class="btn" href="/m/${escape(entry.id)}/raw" target="_blank" rel="noopener">Sumber .eml</a>
</div>
${table}
<div class="bar">
<button class="btn on" data-w="0">Lebar penuh</button>
<button class="btn" data-w="414">414px</button>
<button class="btn" data-w="360">360px</button>
</div>
<p class="hint">Email yang lebih lebar dari bingkai tergunting di sini, karena iframe tidak
mengecilkan isinya. Di ponsel, peramban dan Gmail justru memperkecil seluruh email agar
muat — jadi guntingan di bawah berarti "teksnya akan mengecil", bukan "teksnya hilang".</p>
<div class="frame" id="frame">
${
  mail.html
    ? `<iframe src="/m/${escape(entry.id)}/html" sandbox="allow-popups allow-popups-to-escape-sandbox" title="Isi email"></iframe>`
    : `<pre>${escape(mail.text || "(email ini tidak punya bagian HTML maupun teks)")}</pre>`
}
</div>
<script>
// Pengubah lebar meniru layar ponsel. Berguna karena badan email memakai tabel
// width=600 dengan maxWidth 100% — di bawah 600px itulah tata letaknya diuji.
document.querySelectorAll("button[data-w]").forEach(function (button) {
  button.addEventListener("click", function () {
    var width = Number(button.dataset.w);
    document.getElementById("frame").style.maxWidth = width ? width + "px" : "none";
    document.querySelectorAll("button[data-w]").forEach(function (other) {
      other.classList.toggle("on", other === button);
    });
  });
});
</script>`;

  return page(mail.subject, body);
}

function send(response, status, type, payload) {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    // Penampil pengembangan; tidak ada alasan membiarkannya dimuat di dalam situs lain.
    "x-frame-options": "SAMEORIGIN",
  });
  response.end(payload);
}

const viewer = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const route = url.pathname;

  if (route === "/") return send(response, 200, "text/html; charset=utf-8", listPage());

  if (route === "/clear") {
    for (const entry of inbox()) {
      try {
        unlinkSync(path.join(outDir, entry.name));
      } catch {
        // Berkas yang sudah hilang bukan masalah.
      }
    }

    counter = 0;
    response.writeHead(302, { location: "/" });
    return response.end();
  }

  const match = /^\/m\/([\w-]+)(?:\/(html|text|raw|att)(?:\/(\d+))?)?$/.exec(route);

  if (!match) return send(response, 404, "text/plain; charset=utf-8", "Tidak ditemukan.");

  const entry = find(match[1]);

  if (!entry) return send(response, 404, "text/plain; charset=utf-8", "Email tidak ditemukan.");

  switch (match[2]) {
    case undefined:
      return send(response, 200, "text/html; charset=utf-8", detailPage(entry));

    case "html": {
      // `<base target="_blank">` disuntikkan supaya tombol di dalam email membuka tab
      // baru, bukan memuat portal di dalam iframe penampil ini. Satu-satunya perubahan
      // terhadap HTML aslinya, dan hanya di jalur penampil.
      const html = entry.mail.html.replace(
        /<head([^>]*)>/i,
        '<head$1><base target="_blank" rel="noopener">',
      );

      return send(
        response,
        200,
        "text/html; charset=utf-8",
        html || "<p>Email ini tidak punya bagian HTML.</p>",
      );
    }

    case "text":
      return send(
        response,
        200,
        "text/plain; charset=utf-8",
        entry.mail.text || "(tidak ada bagian teks)",
      );

    case "raw":
      return send(response, 200, "text/plain; charset=utf-8", entry.raw);

    case "att": {
      const file = entry.mail.attachments[Number(match[3])];

      if (!file) return send(response, 404, "text/plain; charset=utf-8", "Lampiran tidak ada.");

      response.writeHead(200, {
        "content-type": file.mime || "application/octet-stream",
        "content-disposition": `inline; filename="${file.filename.replace(/["\r\n]/g, "")}"`,
      });

      return response.end(file.content);
    }

    default:
      return send(response, 404, "text/plain; charset=utf-8", "Tidak ditemukan.");
  }
});

if (withViewer) {
  viewer.on("error", (error) => console.error("Penampil:", error.message));

  viewer.listen(httpPort, host, () => {
    console.log(`Penampil email di http://${host === "0.0.0.0" ? "localhost" : host}:${httpPort}`);

    for (const address of lanAddresses()) {
      console.log(`  dari ponsel: http://${address}:${httpPort}`);
    }

    if (host === "0.0.0.0") {
      console.log(
        "  catatan: email tertangkap terbuka bagi siapa pun di jaringan ini — batasi dengan --host 127.0.0.1",
      );
    }
  });
}

/** Alamat IPv4 non-loopback, supaya URL untuk ponsel tidak perlu dicari manual. */
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
}
