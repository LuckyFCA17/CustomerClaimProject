import { statusMeta } from "@/config/claim-status";
import {
  Cell,
  FormMasthead,
  RevisionMark,
  SectionBar,
  SignatureStrip,
  SocializationGrid,
} from "@/components/print/quality-alert";
import { formatDate } from "@/lib/format";
import { periodLabel, splitQty } from "@/lib/quality-alert";
import { draftLabel } from "@/lib/numbering";
import {
  FAILURE_PLACE_LABEL,
  SHIFT_LABEL,
  authorizePrint,
  loadClaimForPrint,
  photosForParts,
} from "@/server/print-data";

export const dynamic = "force-dynamic";

/**
 * Bad News Information — Form 5 (R3) PR-QA-ISO-07.
 *
 * Mengikuti formulir terkendali NID: A4 mendatar, Section A riwayat masalah, Section B
 * perbandingan standard dan actual, pita peringatan, lalu Section C sosialisasi yang
 * diparaf operator per grup kerja.
 */
export default async function BadNewsPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : null;

  await authorizePrint("BAD_NEWS", id, token);

  const claim = await loadClaimForPrint(id);
  const photos = await photosForParts(claim.parts.map((part) => part.id));

  const standard = claim.parts.find((part) => part.side === "STANDARD");
  const actual = claim.parts.find((part) => part.side === "ACTUAL");

  const isDraft = query.draft === "1" || claim.status === "DRAFT";
  const issueDate = claim.publishedAt ?? claim.submittedAt;
  const periodSource = claim.dateOfOccurrence ?? issueDate ?? new Date();

  const { pcs: qtyPcs, box: qtyBox } = splitQty(
    actual ? Number(actual.qty) : null,
    actual?.qtyUnit,
  );

  const describe = (part: typeof standard) =>
    part?.appearanceItem?.trim() || part?.dimensionItem?.trim() || null;

  return (
    <>
      {/* Lembar ini mendatar; aturan @page di globals.css dibuat untuk dokumen tegak. */}
      <style>{`@page { size: A4 landscape; margin: 0; }`}</style>

      <section className="sheet sheet-landscape" data-draft={isDraft ? "true" : undefined}>
        <FormMasthead documentNo={claim.claimNo ?? draftLabel(claim.id)} issueDate={issueDate} />

        <SignatureStrip
          prepared={{ name: claim.createdBy.name, at: claim.submittedAt }}
          approved={{ name: claim.reviewedBy?.name ?? null, at: claim.publishedAt }}
          period={periodLabel(periodSource)}
          // RESPONSIBLE, QC, PPIC, dan PRODUCTION diparaf di lantai produksi; portal
          // tidak mengetahuinya, jadi dibiarkan kosong alih-alih ditebak.
          responsible={null}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <SectionBar letter="A" title="PROBLEM HYSTORY" />
          <SectionBar letter="B" title="PROBLEM DESCRIPTION" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "stretch" }}>
          {/* ── Section A ───────────────────────────────────────────── */}
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            {/*
              Lebar kolom mengikuti proporsi formulir aslinya: 30/20/10/10/9/10/11.
              Area kosong di kanan bukan ruang sisa — pada Form 5 memang dibiarkan
              terbuka, dan baris Kanban No. satu-satunya yang menembusnya.
            */}
            <colgroup>
              <col style={{ width: "30%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
            </colgroup>
            <tbody>
              <tr>
                <Cell align="right" bold fontSize="9pt">
                  Problem
                </Cell>
                <Cell align="center" color="#d00">
                  {claim.ncDetail?.name ?? null}
                </Cell>
                <Cell align="center" bold>
                  QTY
                </Cell>
                <Cell align="right">{qtyPcs}</Cell>
                <Cell>pcs</Cell>
                <Cell align="right">{qtyBox}</Cell>
                <Cell>box</Cell>
              </tr>

              <tr>
                <Cell align="right" bold fontSize="9pt">
                  Date of Occurance
                </Cell>
                <Cell align="center">
                  {claim.dateOfOccurrence ? formatDate(claim.dateOfOccurrence) : null}
                </Cell>
                <Cell colSpan={2} align="center">
                  {claim.shiftOfOccurrence
                    ? `${SHIFT_LABEL[claim.shiftOfOccurrence].toUpperCase()} SHIFT`
                    : null}
                </Cell>
                <Cell colSpan={3} rowSpan={5} />
              </tr>

              <tr>
                <Cell align="right" bold fontSize="9pt">
                  Failure Place
                </Cell>
                <Cell align="center">{claim.failurePlace || null}</Cell>
                <Cell colSpan={2} align="center">
                  {claim.failurePlaceType ? FAILURE_PLACE_LABEL[claim.failurePlaceType].toUpperCase() : null}
                </Cell>
              </tr>

              <tr>
                <Cell align="right" bold fontSize="9pt">
                  Customer Part No.
                </Cell>
                <Cell colSpan={3} align="center">
                  {claim.customerPartNo || null}
                </Cell>
              </tr>

              <tr>
                <Cell align="right" bold fontSize="9pt">
                  NID Part No.
                </Cell>
                <Cell colSpan={3} align="center">
                  {claim.internalPartNo || null}
                </Cell>
              </tr>

              <tr>
                <Cell align="right" bold fontSize="9pt">
                  Part Name
                </Cell>
                <Cell colSpan={3} align="center">
                  {claim.partName || null}
                </Cell>
              </tr>

              <tr>
                <Cell align="right" bold fontSize="9pt">
                  Lot No.
                </Cell>
                <Cell align="center">{claim.lotNo || null}</Cell>
                <Cell colSpan={3} align="right" bold fontSize="9pt">
                  Kanban No.
                </Cell>
                <Cell colSpan={2} align="center">
                  {claim.kanbanNo || null}
                </Cell>
              </tr>

              <tr>
                <Cell rowSpan={2} align="right" bold fontSize="9pt">
                  Production Date
                </Cell>
                <Cell align="center" bold fontSize="8pt">
                  Injection
                </Cell>
                <Cell colSpan={2} align="center" bold fontSize="8pt">
                  Assembly
                </Cell>
                <Cell colSpan={3} rowSpan={4} />
              </tr>
              <tr>
                <Cell align="center">
                  {claim.injectionDate ? formatDate(claim.injectionDate) : null}
                </Cell>
                <Cell colSpan={2} align="center">
                  {claim.assemblyDate ? formatDate(claim.assemblyDate) : null}
                </Cell>
              </tr>

              <tr>
                <Cell align="right" bold fontSize="9pt">
                  Delivery Date
                </Cell>
                <Cell colSpan={3} align="center">
                  {claim.deliveryDate ? formatDate(claim.deliveryDate) : null}
                </Cell>
              </tr>

              <tr>
                <Cell align="right" bold fontSize="9pt">
                  Line Process
                </Cell>
                <Cell colSpan={3} align="center">
                  {claim.suspectedProcessLine || null}
                </Cell>
              </tr>
            </tbody>
          </table>

          {/* ── Section B ───────────────────────────────────────────── */}
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <tbody>
              <tr>
                <Cell width="50%" align="center" bold color="#15803d">
                  STANDARD
                </Cell>
                <Cell width="50%" align="center" bold color="#d00">
                  ACTUAL
                </Cell>
              </tr>
              <tr>
                <Cell align="center">{describe(standard)}</Cell>
                <Cell align="center">{describe(actual)}</Cell>
              </tr>
              <tr>
                <Cell colSpan={2} align="center" bold>
                  PICTURE
                </Cell>
              </tr>
              <tr style={{ height: "52mm" }}>
                <PhotoCell photos={photos.get(standard?.id ?? "") ?? []} />
                <PhotoCell photos={photos.get(actual?.id ?? "") ?? []} />
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Pita peringatan (teks tercetak pada formulir aslinya) ── */}
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <tbody>
            <tr>
              <Cell align="center" bold color="#d00" fontSize="10pt">
                PROBLEM TELAH LOLOS KE CUSTOMER
              </Cell>
            </tr>
            <tr>
              <Cell align="center" color="#1d4ed8" bold>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "2mm" }}>
                  <RevisionMark />
                  JANGAN SAMPAI PROBLEM YANG SAMA TERKIRIM KEMBALI (TERULANG) KE CUSTOMER
                </span>
                <div>1. PENGECEKAN OPERATOR PROSES DI PERKETAT (BIQ)</div>
                <div>2. INSPEKTOR INSPEKSI DI PERKETAT (SAMPLING)</div>
              </Cell>
            </tr>
          </tbody>
        </table>

        {/* ── Section C — Socialization ──────────────────────────── */}
        <SectionBar letter="C" title="SOCIALIZATION" />
        <SocializationGrid />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "4mm",
            marginTop: "1mm",
            fontSize: "5.5pt",
            color: "#6b7280",
          }}
        >
          <span>FORM 5 (R3) PR-QA-ISO-07</span>
          <span style={{ fontStyle: "italic" }}>
            Status {statusMeta(claim.status).label} · disiapkan dan disetujui secara elektronik
            melalui NCC Portal
          </span>
        </div>
      </section>
    </>
  );
}

function PhotoCell({
  photos,
}: {
  photos: readonly { id: string; src: string; caption: string | null }[];
}) {
  return (
    <Cell align="center">
      {photos.length === 0 ? (
        " "
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: photos.length > 1 ? "1fr 1fr" : "1fr",
            gap: "1.5mm",
          }}
        >
          {photos.slice(0, 2).map((photo) => (
            <figure key={photo.id} style={{ margin: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- halaman cetak
                  statis; pengoptimal gambar Next tidak berjalan di Puppeteer. */}
              <img
                src={photo.src}
                alt={photo.caption ?? ""}
                style={{
                  width: "100%",
                  height: photos.length > 1 ? "44mm" : "48mm",
                  objectFit: "contain",
                }}
              />
              {photo.caption ? (
                <figcaption style={{ fontSize: "5.5pt", color: "#6b7280" }}>
                  {photo.caption}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      )}
    </Cell>
  );
}
