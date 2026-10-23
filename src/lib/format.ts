/** Helper presentasi yang aman dipakai komponen klien — tanpa akses database. */

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const JAKARTA = "Asia/Jakarta";

/** Semua timestamp disimpan UTC dan ditampilkan waktu Jakarta (asumsi A-15). */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: JAKARTA,
  });
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";

  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: JAKARTA,
  });
}

/** Nilai untuk <input type="date">, yang selalu mengharap YYYY-MM-DD. */
export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}
