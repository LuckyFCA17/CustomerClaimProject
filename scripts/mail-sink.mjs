import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { SMTPServer } from "smtp-server";

/**
 * Penangkap SMTP untuk pengembangan.
 *
 * Padanan MailHog bagi lingkungan yang tidak punya Docker (lihat README). Email tidak
 * pernah diteruskan ke mana pun: isinya ditulis ke berkas .eml dan ringkasannya dicetak
 * ke terminal, sehingga lampiran PDF dapat dibuka langsung.
 *
 *   node scripts/mail-sink.mjs [--port 1025] [--out .mail]
 */

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

const port = Number(arg("port", 1025));
const outDir = path.resolve(arg("out", ".mail"));

mkdirSync(outDir, { recursive: true });

let counter = 0;

const server = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  onData(stream, session, callback) {
    const chunks = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => {
      counter += 1;

      const raw = Buffer.concat(chunks).toString("utf8");
      const subject = /^Subject: (.*)$/m.exec(raw)?.[1] ?? "(tanpa subject)";
      const attachments = [...raw.matchAll(/filename="?([^"\r\n;]+)"?/g)].map((match) => match[1]);
      const file = path.join(outDir, `${String(counter).padStart(3, "0")}.eml`);

      writeFileSync(file, raw, "utf8");

      console.log(
        [
          `#${counter}`,
          `to=${session.envelope.rcptTo.map((r) => r.address).join(",")}`,
          `subject=${decodeHeader(subject)}`,
          attachments.length ? `attachments=${[...new Set(attachments)].join(",")}` : "",
          `file=${path.relative(process.cwd(), file)}`,
        ]
          .filter(Boolean)
          .join("  "),
      );

      callback();
    });
  },
});

/** Subject berisi karakter non-ASCII dikodekan RFC 2047; dibuka agar log terbaca. */
function decodeHeader(value) {
  return value.replace(/=\?utf-8\?B\?(.*?)\?=/gi, (_match, b64) =>
    Buffer.from(b64, "base64").toString("utf8"),
  );
}

server.on("error", (error) => console.error("SMTP sink:", error.message));

server.listen(port, "127.0.0.1", () => {
  console.log(`SMTP sink mendengarkan di 127.0.0.1:${port}, email disimpan ke ${outDir}`);
});
