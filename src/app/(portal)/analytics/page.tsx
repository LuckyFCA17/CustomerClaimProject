import type { Metadata } from "next";

import { BreakdownBars } from "@/components/analytics/breakdown-bars";
import { LeadTimeBars } from "@/components/analytics/lead-time-bars";
import { MonthlyColumns } from "@/components/dashboard/monthly-columns";
import { ParetoBars } from "@/components/dashboard/pareto-bars";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClaimType, OccurrenceCount } from "@/generated/prisma/enums";
import {
  type LeadTimeInput,
  leadTimeSummary,
  occurrenceBreakdown,
  repeatShare,
  typeBreakdown,
} from "@/lib/analytics";
import { monthlySeries, paretoRows, percent, resolvePeriod } from "@/lib/dashboard";
import { toJakartaParts } from "@/lib/dates";
import { db } from "@/lib/db";
import { visibleClaimsWhere } from "@/lib/permissions";
import { getPortalUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Claim Analytics",
};

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);
}

/**
 * Claim Analytics — empat pertanyaan tentang klaim, dibaca dari seluruh basis data.
 *
 * Satu periode berlaku untuk **keempat** grafiknya. Halaman analitik yang tiap grafiknya
 * menjawab rentang waktu berbeda tidak dapat dipakai membandingkan apa pun: "defek yang
 * sering terjadi" sepanjang masa di sebelah "klaim bulanan" tahun ini akan terbaca
 * seolah keduanya tentang periode yang sama.
 *
 * Periodenya hidup di URL, bukan di state komponen — alasannya sama dengan grafik
 * dashboard: angkanya dihitung di basis data, jadi periodenya memang harus sampai ke
 * server, dan tautannya dapat dikirim ke orang lain.
 *
 * Seluruh angka disaring `visibleClaimsWhere`: User Dept. hanya melihat analitik
 * klaimnya sendiri. Halaman analitik bukan celah untuk membaca klaim departemen lain.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getPortalUser();
  const where = visibleClaimsWhere(user);
  const now = new Date();

  const query = await searchParams;
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const period = resolvePeriod(one(query.from), one(query.to), now);
  const inPeriod = { ...where, createdAt: { gte: period.start, lt: period.end } };

  const [
    dates,
    typeGroups,
    ncGroups,
    ncNames,
    deptGroups,
    departments,
    oldestClaim,
    occurrenceGroups,
    stageDates,
    repeatGroups,
  ] = await Promise.all([
      db.claim.findMany({ where: inPeriod, select: { createdAt: true } }),
      db.claim.groupBy({ by: ["type"], where: inPeriod, _count: { _all: true } }),
      db.claim.groupBy({ by: ["ncDetailId"], where: inPeriod, _count: { _all: true } }),
      db.nonConformanceDetail.findMany({ select: { id: true, name: true } }),

      /**
       * Departemen penanggung jawab tidak ada di klaim, melainkan di CPAR-nya.
       *
       * Jadi yang terhitung di sini hanya klaim yang sudah diterbitkan CPAR — dan itu
       * memang pertanyaannya: departemen mana yang paling sering **menimbulkan** klaim,
       * bukan departemen mana yang kebetulan disebut. Klaim yang di-ignore atau belum
       * ditindaklanjuti belum punya penanggung jawab, dan menebaknya akan mengarang
       * angka.
       */
      db.cpar.groupBy({
        by: ["responsibleDeptId"],
        where: { claim: inPeriod },
        _count: { _all: true },
      }),
      db.department.findMany({ select: { id: true, code: true, name: true } }),

      db.claim.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),

      db.claim.groupBy({ by: ["occurrence"], where: inPeriod, _count: { _all: true } }),

      /**
       * Tanggal tiap tahap. Diambil sebagai baris, bukan diagregasi di basis data:
       * median tidak dapat dihitung dengan `groupBy`, dan jumlah klaim satu periode
       * masih jauh di bawah ukuran yang membuat ini mahal.
       */
      db.claim.findMany({
        where: inPeriod,
        select: {
          dateOfReceived: true,
          publishedAt: true,
          closedAt: true,
          cpar: { select: { issuedAt: true, submittedAt: true, approvedAt: true } },
        },
      }),

      /** Klaim berulang saja — "defek apa yang terus kembali meski sudah di-CPAR". */
      db.claim.groupBy({
        by: ["ncDetailId"],
        where: { ...inPeriod, occurrence: { in: ["SECOND_TIME", "THIRD_OR_MORE"] } },
        _count: { _all: true },
      }),
    ]);

  const series = monthlySeries(
    dates.map((claim) => claim.createdAt),
    period.anchor,
    period.months,
  );

  // `Claim.type` nullable, dan groupBy mengembalikan kelompoknya sebagai null. Dibuang
  // begitu saja, total grafik ini tidak akan cocok dengan grafik klaim bulanan di
  // sebelahnya — selisih tanpa penjelasan yang membuat seluruh halaman tidak dipercaya.
  const typed = typeGroups.filter((group) => group.type !== null);
  const untyped = typeGroups
    .filter((group) => group.type === null)
    .reduce((sum, group) => sum + group._count._all, 0);

  const types = typeBreakdown(
    Object.fromEntries(
      typed.map((group) => [group.type, group._count._all]),
    ) as Partial<Record<ClaimType, number>>,
    untyped,
  );

  const ncNameById = new Map(ncNames.map((detail) => [detail.id, detail.name]));
  const defects = paretoRows(
    ncGroups.map((group) => ({
      label: group.ncDetailId ? (ncNameById.get(group.ncDetailId) ?? "Tidak dikenal") : "Tidak diisi",
      count: group._count._all,
    })),
  );

  const deptById = new Map(departments.map((entry) => [entry.id, entry]));
  const byDepartment = paretoRows(
    deptGroups.map((group) => {
      const department = deptById.get(group.responsibleDeptId);

      return {
        label: department ? `${department.code} — ${department.name}` : "Tidak dikenal",
        count: group._count._all,
      };
    }),
  );

  const occurrences = occurrenceBreakdown(
    Object.fromEntries(
      occurrenceGroups
        .filter((group) => group.occurrence !== null)
        .map((group) => [group.occurrence, group._count._all]),
    ) as Partial<Record<OccurrenceCount, number>>,
    occurrenceGroups
      .filter((group) => group.occurrence === null)
      .reduce((sum, group) => sum + group._count._all, 0),
  );

  const leadTime = leadTimeSummary(
    stageDates.map(
      (claim): LeadTimeInput => ({
        receivedAt: claim.dateOfReceived,
        publishedAt: claim.publishedAt,
        cparIssuedAt: claim.cpar?.issuedAt ?? null,
        cparSubmittedAt: claim.cpar?.submittedAt ?? null,
        cparApprovedAt: claim.cpar?.approvedAt ?? null,
        closedAt: claim.closedAt,
      }),
    ),
  );

  const repeatDefects = paretoRows(
    repeatGroups.map((group) => ({
      label: group.ncDetailId ? (ncNameById.get(group.ncDetailId) ?? "Tidak dikenal") : "Tidak diisi",
      count: group._count._all,
    })),
  );

  const thisYear = toJakartaParts(now).year;
  const oldestYear = oldestClaim ? toJakartaParts(oldestClaim.createdAt).year : null;
  const years = [
    ...new Set([
      ...range(oldestYear ?? thisYear, thisYear),
      Number(period.from.slice(0, 4)),
      Number(period.to.slice(0, 4)),
    ]),
  ].sort((a, b) => b - a);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-nid-orange-700">Claim Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Tujuh pertanyaan tentang klaim, seluruhnya pada periode yang sama.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Periode</CardTitle>
          <CardDescription>
            Berlaku untuk seluruh grafik di bawah, sehingga angkanya dapat dibandingkan satu
            sama lain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PeriodFilter
            from={period.from}
            to={period.to}
            years={years}
            isDefault={period.isDefault}
          />
        </CardContent>
      </Card>

      {/*
        Kartunya dipak sebagai kolom, bukan sebagai kisi.

        Tinggi tiap kartu ditentukan datanya: Pareto dengan empat sebab jauh lebih pendek
        daripada lead time dengan tahapan dan catatannya. Pada kisi dua kolom, kedua
        kartu sebaris dipaksa setinggi yang tertinggi — yang pendek lantas berakhir
        dengan ratusan piksel putih kosong di bawah isinya, dan itu terbaca sebagai
        kartu yang gagal memuat sesuatu, bukan sebagai kartu yang memang pendek.

        Perataan `items-start` menghilangkan kosong di dalam kartunya, tetapi lubangnya
        hanya pindah ke latar: barisnya tetap setinggi kartu tertinggi. Kolom tidak punya
        baris sama sekali — tiap kartu menempel pada kartu di atasnya, dan sisa ruangnya
        terkumpul di satu tempat, di ujung kolom terpendek.

        `break-inside-avoid` menjaga satu kartu tidak terbelah di antara dua kolom.
        Urutannya tetap berurut, hanya menurun dulu di kolom kiri sebelum pindah ke
        kanan — bukan urutan yang teracak.
      */}
      <div className="columns-1 gap-4 lg:columns-2">
        <Card className="mb-4 break-inside-avoid">
          <CardHeader>
            <CardTitle>Jenis klaim</CardTitle>
            <CardDescription>
              Official, Non-Official, dan Information Only. Jenis yang tidak punya klaim tetap
              digambar — nol pada suatu periode juga sebuah temuan. Draft yang jenisnya belum
              ditentukan muncul sebagai baris abu, bukan dihilangkan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownBars rows={types} empty="Belum ada klaim pada periode ini." />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid">
          <CardHeader>
            <CardTitle>Klaim per bulan</CardTitle>
            <CardDescription>
              Bulan tanpa klaim tetap muncul sebagai nol, supaya jarak waktunya jujur.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyColumns series={series} />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid">
          <CardHeader>
            <CardTitle>Jenis defek yang sering terjadi</CardTitle>
            <CardDescription>
              Non-conformance detail, diurutkan dari yang terbanyak. Yang berwarna aksen
              bersama-sama mencapai 80% kasus.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ParetoBars rows={defects} />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid">
          <CardHeader>
            <CardTitle>Lead time per tahap</CardTitle>
            <CardDescription>
              Di mana waktunya habis, dalam hari kerja Senin–Jumat. Median, bukan rata-rata:
              satu klaim yang menggantung berbulan-bulan menarik rata-rata sampai angkanya
              tidak menggambarkan klaim mana pun.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LeadTimeBars summary={leadTime} />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid">
          <CardHeader>
            <CardTitle>Pengulangan kejadian</CardTitle>
            <CardDescription>
              {percent(repeatShare(occurrences))} klaim pada periode ini pernah terjadi
              sebelumnya. Countermeasure yang benar-benar bekerja seharusnya menekan angka ini.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownBars
              rows={occurrences}
              empty="Belum ada klaim pada periode ini."
            />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid">
          <CardHeader>
            <CardTitle>Defek yang paling sering kembali</CardTitle>
            <CardDescription>
              Hanya klaim yang pernah terjadi sebelumnya. Inilah defek yang akar masalahnya
              belum tersentuh — bukan sekadar yang paling banyak jumlahnya.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ParetoBars rows={repeatDefects} />
          </CardContent>
        </Card>

        <Card className="mb-4 break-inside-avoid">
          <CardHeader>
            <CardTitle>Departemen penanggung jawab</CardTitle>
            <CardDescription>
              Main Responsible Department pada CPAR. Hanya klaim yang sudah diterbitkan CPAR
              yang terhitung — sebelum itu belum ada penanggung jawabnya.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ParetoBars rows={byDepartment} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
