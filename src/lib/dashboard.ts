import { toJakartaParts } from "@/lib/dates";

/**
 * Perhitungan angka dashboard (§7 Fase 7).
 *
 * Dipisah dari halamannya supaya dapat diuji tanpa database dan tanpa merender apa pun.
 * Seluruh pengelompokan memakai kalender Jakarta, sama seperti sisa portal (asumsi
 * A-15): klaim yang masuk pukul 23.30 WIB tanggal 31 adalah klaim bulan itu, bukan
 * bulan berikutnya sebagaimana terbaca bila dihitung dalam UTC.
 */

/** Nama bulan ditulis tetap, tidak lewat Intl: portal ini juga berjalan di Node tanpa ICU penuh. */
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

export interface MonthBucket {
  /** `2026-10`; dipakai sebagai key React dan untuk pengujian. */
  readonly key: string;
  readonly label: string;
  readonly year: number;
  /** 0–11; dipakai sumbu X untuk menandai awal kuartal dan awal tahun. */
  readonly month: number;
  readonly count: number;
}

export const DEFAULT_MONTHS = 12;

/**
 * Jumlah klaim per bulan, termasuk bulan yang kosong.
 *
 * Bulan tanpa klaim tetap muncul dengan nilai nol. Menghilangkannya membuat sumbu
 * waktu merapat dan dua bulan yang bersebelahan di layar ternyata terpaut setengah
 * tahun — grafik tren yang berbohong tentang jaraknya sendiri.
 */
export function monthlySeries(
  dates: readonly Date[],
  now: Date = new Date(),
  months: number = DEFAULT_MONTHS,
): readonly MonthBucket[] {
  const end = toJakartaParts(now);
  const buckets = new Map<string, MonthBucket>();

  for (let back = months - 1; back >= 0; back -= 1) {
    // Date.UTC menormalkan bulan negatif menjadi tahun sebelumnya, jadi pergantian
    // tahun tidak perlu ditangani sendiri.
    const point = new Date(Date.UTC(end.year, end.month - back, 1));
    const year = point.getUTCFullYear();
    const month = point.getUTCMonth();

    buckets.set(keyOf(year, month), {
      key: keyOf(year, month),
      label: MONTH_SHORT[month],
      year,
      month,
      count: 0,
    });
  }

  for (const date of dates) {
    const parts = toJakartaParts(date);
    const existing = buckets.get(keyOf(parts.year, parts.month));

    // Klaim di luar rentang diabaikan diam-diam: rentangnyalah yang dipilih, bukan datanya.
    if (existing) {
      buckets.set(existing.key, { ...existing, count: existing.count + 1 });
    }
  }

  return [...buckets.values()];
}

function keyOf(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Sumbu X grafik bulanan: label mana yang ditulis, dan di mana tahunnya disebut.
 *
 * Satu label per bulan hanya muat selama kolomnya masih selebar tulisannya. Pada
 * periode dua atau tiga tahun kolomnya menyempit sampai di bawah 20px, sementara "Agu"
 * tetap selebar aslinya — deretan label itu lantas lebih lebar daripada grafiknya
 * sendiri, meluber keluar kartu, dan yang lebih buruk: ia tidak lagi sejajar dengan
 * batang yang seharusnya ia namai. Pembaca membaca jumlah bulan November pada kolom
 * bulan Juli.
 *
 * Jadi labelnya dijarangkan, dan jaraknya dikunci ke bulan yang bermakna — awal
 * kuartal, bukan tiap kolom ke-sekian — supaya sumbunya tetap terbaca sebagai kalender:
 *
 *   · sampai 12 kolom: tiap bulan, seperti sebelumnya;
 *   · sampai 16 kolom: tiap dua bulan (Jan, Mar, Mei, …);
 *   · sampai 24 kolom: tiap kuartal (Jan, Apr, Jul, Okt);
 *   · selebihnya: tiap setengah tahun (Jan, Jul).
 *
 * Delapan label adalah yang masih muat di lebar kartu pada layar 393px — dan karena
 * Januari selalu kelipatan berapa pun langkahnya, awal tahun tidak pernah hilang.
 */
export const MAX_AXIS_LABELS = 8;

export function axisStep(columns: number): number {
  if (columns <= 12) return 1;

  return [2, 3, 6].find((step) => Math.ceil(columns / step) <= MAX_AXIS_LABELS) ?? 12;
}

export interface MonthAxisTick {
  /** `Agu`, atau null bila kolom ini sengaja tidak diberi label. */
  readonly month: string | null;
  /**
   * `2026`, hanya pada satu kolom di tengah rentang tahun itu.
   *
   * Tahunnya ditulis di baris tersendiri, bukan disambung ke nama bulannya, karena
   * "Jan 2026" dua kali lebih lebar daripada kolomnya dan akan menabrak label
   * tetangganya. Satu label per tahun, ditaruh di tengah bentangannya, tidak punya
   * tetangga untuk ditabrak: tahun yang pendek sekalipun hanya meluber ke ruang kosong.
   */
  readonly year: string | null;
}

/**
 * Label sumbu X untuk tiap kolom, sepanjang dan seurutan dengan serinya.
 *
 * Dikembalikan per kolom — bukan hanya kolom yang berlabel — supaya komponennya dapat
 * menggambar satu sel per kolom dan menitipkan labelnya di sel yang tepat. Label yang
 * diposisikan sendiri lewat persentase akan meleset dari batangnya karena jarak antar
 * kolom ikut memakan lebar.
 */
export function monthAxis(series: readonly MonthBucket[]): readonly MonthAxisTick[] {
  const step = axisStep(series.length);
  const years = [...new Set(series.map((bucket) => bucket.year))];

  const yearAt = new Map<number, string>();

  // Tahun hanya disebut bila serinya memang melintasi pergantian tahun. Pada rentang
  // satu tahun angka itu tidak menambah apa pun — periodenya sudah tertulis di pemilih
  // tepat di atas grafiknya.
  if (years.length > 1) {
    for (const year of years) {
      const first = series.findIndex((bucket) => bucket.year === year);
      const last = series.findLastIndex((bucket) => bucket.year === year);

      yearAt.set(Math.floor((first + last) / 2), String(year));
    }
  }

  return series.map((bucket, index) => ({
    month: step === 1 || bucket.month % step === 0 ? bucket.label : null,
    year: yearAt.get(index) ?? null,
  }));
}

/** Nama bulan lengkap untuk pemilih periode; MONTH_SHORT terlalu singkat di daftar pilihan. */
export const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

/**
 * Batas panjang periode.
 *
 * Tiga tahun sudah lebih panjang daripada yang pernah ditanyakan siapa pun di rapat
 * bulanan, dan 36 kolom adalah batas sebuah grafik batang masih terbaca di layar ponsel.
 * Tanpa batas ini satu URL yang salah ketik dapat meminta ribuan kolom.
 */
export const MAX_MONTHS = 36;

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface Period {
  /** `2026-01` — nilai yang dipakai pemilih dan URL. */
  readonly from: string;
  readonly to: string;
  /** Jumlah bulan dalam rentang, sudah dibatasi MAX_MONTHS. */
  readonly months: number;
  /** Batas bawah query, inklusif — awal bulan `from` menurut kalender Jakarta. */
  readonly start: Date;
  /** Batas atas query, eksklusif — awal bulan sesudah `to`. */
  readonly end: Date;
  /** Titik akhir yang diberikan ke `monthlySeries`: satu saat di dalam bulan `to`. */
  readonly anchor: Date;
  /** Benar bila periode ini sama dengan bawaan, sehingga URL tidak perlu memuatnya. */
  readonly isDefault: boolean;
  readonly label: string;
}

/** `2026-03` → { year: 2026, month: 2 }; apa pun yang lain → null. */
function parseMonth(value: string | undefined): { year: number; month: number } | null {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;

  if (year < 2000 || year > 2100 || month < 0 || month > 11) return null;

  return { year, month };
}

/** Awal bulan menurut kalender Jakarta, dinyatakan sebagai saat UTC. */
function jakartaMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1) - JAKARTA_OFFSET_MS);
}

/**
 * Periode yang diminta lewat URL, dibersihkan sampai pasti masuk akal.
 *
 * Seluruh pembersihan terjadi di sini, bukan di komponen, karena `?from=` dan `?to=`
 * datang dari URL — bisa diketik tangan, bisa tertinggal dari tautan lama. Yang keluar
 * dari fungsi ini selalu rentang yang dapat digambar:
 *
 *   · nilai yang tidak berbentuk `YYYY-MM` diabaikan, jatuh ke bawaan;
 *   · rentang terbalik ditukar, bukan ditolak — maksud penggunanya jelas;
 *   · rentang yang terlalu panjang dipotong dari ujung awal, sehingga bulan terakhir
 *     yang diminta tetap terlihat; itulah yang biasanya ingin dilihat orang.
 */
export function resolvePeriod(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  now: Date = new Date(),
  defaultMonths: number = DEFAULT_MONTHS,
): Period {
  const today = toJakartaParts(now);
  const parsedFrom = parseMonth(fromRaw);
  const parsedTo = parseMonth(toRaw);

  const fallbackEnd = { year: today.year, month: today.month };
  const fallbackStartPoint = new Date(Date.UTC(today.year, today.month - (defaultMonths - 1), 1));
  const fallbackStart = {
    year: fallbackStartPoint.getUTCFullYear(),
    month: fallbackStartPoint.getUTCMonth(),
  };

  let start = parsedFrom ?? fallbackStart;
  let end = parsedTo ?? fallbackEnd;

  const asIndex = (point: { year: number; month: number }) => point.year * 12 + point.month;

  if (asIndex(start) > asIndex(end)) [start, end] = [end, start];

  let months = asIndex(end) - asIndex(start) + 1;

  if (months > MAX_MONTHS) {
    const trimmed = new Date(Date.UTC(end.year, end.month - (MAX_MONTHS - 1), 1));
    start = { year: trimmed.getUTCFullYear(), month: trimmed.getUTCMonth() };
    months = MAX_MONTHS;
  }

  const from = keyOf(start.year, start.month);
  const to = keyOf(end.year, end.month);
  const isDefault =
    from === keyOf(fallbackStart.year, fallbackStart.month) &&
    to === keyOf(fallbackEnd.year, fallbackEnd.month);

  const label =
    from === to
      ? `${MONTH_NAMES[start.month]} ${start.year}`
      : `${MONTH_NAMES[start.month]} ${start.year} – ${MONTH_NAMES[end.month]} ${end.year}`;

  return {
    from,
    to,
    months,
    start: jakartaMonthStart(start.year, start.month),
    end: jakartaMonthStart(end.year, end.month + 1),
    // Pertengahan bulan terakhir: `monthlySeries` hanya membaca tahun dan bulannya,
    // dan titik tengah tidak mungkin tergelincir ke bulan sebelah oleh zona waktu.
    anchor: new Date(Date.UTC(end.year, end.month, 15, 12)),
    isDefault,
    label,
  };
}

export interface ParetoRow {
  readonly label: string;
  readonly count: number;
  /** Porsi baris ini terhadap total, 0–1. */
  readonly share: number;
  /** Porsi kumulatif sampai baris ini, 0–1. */
  readonly cumulative: number;
  /**
   * Termasuk "vital few" — baris yang bersama-sama mencapai ambang kumulatif.
   *
   * Inilah yang menggantikan garis kumulatif pada diagram Pareto klasik. Garis itu
   * menuntut sumbu Y kedua dengan skala berbeda, dan perbandingan dua skala yang
   * disejajarkan sembarang membuat pembaca melihat hubungan yang tidak ada di datanya.
   * Penandaan baris menyampaikan keputusan yang sama — mana yang harus ditangani lebih
   * dulu — tanpa sumbu kedua.
   */
  readonly vital: boolean;
}

export const PARETO_CUTOFF = 0.8;

/**
 * Mengurutkan sebab dari yang terbanyak dan menandai yang mencapai ambang kumulatif.
 *
 * Seri dengan jumlah sama diurutkan menurut label agar hasilnya tidak berubah-ubah
 * antar pemanggilan — tabel yang barisnya berpindah tanpa sebab sulit dipercaya.
 */
export function paretoRows(
  entries: readonly { readonly label: string; readonly count: number }[],
  cutoff: number = PARETO_CUTOFF,
): readonly ParetoRow[] {
  const positive = entries.filter((entry) => entry.count > 0);
  const total = positive.reduce((sum, entry) => sum + entry.count, 0);

  if (total === 0) return [];

  const sorted = [...positive].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );

  let running = 0;

  return sorted.map((entry) => {
    // Ambang diperiksa sebelum baris ini ditambahkan: baris yang membuat kumulatif
    // melewati 80% masih ikut terhitung vital, karena tanpa ia ambangnya tidak tercapai.
    const wasBelow = running / total < cutoff;

    running += entry.count;

    return {
      label: entry.label,
      count: entry.count,
      share: entry.count / total,
      cumulative: running / total,
      vital: wasBelow,
    };
  });
}

/**
 * Nilai tick sumbu Y yang bulat, dari 0 sampai sedikit di atas nilai tertinggi.
 *
 * Sumbu yang berhenti tepat di nilai tertinggi membuat batang tertinggi menyentuh tepi
 * dan terbaca seolah terpotong, jadi langkahnya dibulatkan ke atas lebih dulu.
 */
export function axisTicks(max: number, steps = 4): readonly number[] {
  if (max <= 0) return [0, 1];

  const rough = max / steps;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  // 1 · 2 · 5 · 10 — satu-satunya langkah yang terbaca bulat pada sumbu hitungan.
  const step = [1, 2, 5, 10].map((unit) => unit * magnitude).find((value) => value >= rough) ?? magnitude * 10;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];

  for (let value = 0; value <= top; value += step) ticks.push(value);

  return ticks;
}

/** `0.62` → `62%`. Tanpa desimal: ketelitian di bawah satu persen tidak mengubah keputusan. */
export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
