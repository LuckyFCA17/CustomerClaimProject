import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Satu angka ringkas.
 *
 * Nilainya memakai angka proporsional, bukan `tabular`. Angka lebar-sama berguna pada
 * kolom yang harus lurus ke bawah; pada satu angka besar yang berdiri sendiri, "121"
 * justru terbaca renggang karena tiap digit dipaksa selebar "0".
 */
export function StatTile({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: number;
  hint?: ReactNode;
  href?: string;
  /** `attention` dipakai hanya bila angkanya memang menuntut tindakan. */
  tone?: "default" | "attention";
}) {
  const attention = tone === "attention" && value > 0;

  const body = (
    <>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className="mt-1 text-3xl font-semibold leading-none"
        style={attention ? { color: "var(--status-danger)" } : undefined}
      >
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );

  const shell = "block rounded-lg border border-nid-border bg-card px-4 py-3";

  // Kartu yang punya tujuan dibuat sebagai tautan utuh, bukan kartu dengan tautan kecil
  // di dalamnya: di layar sentuh, seluruh kartu adalah sasaran yang masuk akal.
  return href ? (
    <Link href={href} className={`${shell} transition-colors hover:bg-secondary`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
