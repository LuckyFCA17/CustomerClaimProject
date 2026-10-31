import {
  CATEGORY_LABEL,
  JUDGEMENT_SHORT,
  type FishboneCategory,
  type Judgement,
  type RootCauseFactor,
  type RootCauseInput,
  groupByCategory,
} from "@/schemas/root-cause";

/**
 * Diagram tulang ikan 4M1E.
 *
 * Digambar sebagai SVG, bukan susunan kotak CSS: yang membuat diagram ini terbaca
 * sebagai tulang ikan adalah duri miring yang benar-benar menyentuh tulang punggung,
 * dan garis miring sepanjang itu tidak dapat diandalkan dari border CSS. Teksnya tetap
 * HTML di dalam foreignObject supaya nama faktor yang panjang tetap membungkus — teks
 * SVG biasa tidak melakukannya.
 *
 * Tata letaknya dihitung, bukan ditetapkan: tinggi kotak mengikuti jumlah faktor
 * terbanyak pada sisinya, sehingga lima kategori dengan isi yang timpang tetap rapi.
 *
 * Judgement tidak pernah disampaikan lewat warna saja. Tiap duri membawa singkatannya
 * (OK, NG, OK-NI), supaya tetap terbaca pada fotokopi hitam putih dan bagi pembaca yang
 * sulit membedakan warna.
 */

/**
 * Geometri diagram, dalam satuan viewBox.
 *
 * Ukuran huruf di dalam foreignObject juga dinyatakan dalam satuan yang sama, sehingga
 * perbandingan lebar viewBox terhadap lebar cetak menentukan besar huruf di atas kertas.
 * Varian `compact` memakai ruang koordinat yang lebih sempit: pada lebar kertas yang
 * sama, hurufnya jadi lebih besar — sekitar 8pt alih-alih 4,6pt yang tak terbaca.
 */
interface Geometry {
  readonly viewWidth: number;
  readonly boxWidth: number;
  readonly headWidth: number;
  /** Panjang tegak duri miring dari kotak kategori ke tulang punggung. */
  readonly boneRise: number;
  readonly rowHeight: number;
  readonly boxPadding: number;
  /** Titik tempat tiap duri menyentuh tulang punggung. */
  readonly topAnchors: readonly number[];
  readonly bottomAnchors: readonly number[];
  readonly minWidthClass: string;
}

const SCREEN: Geometry = {
  viewWidth: 1040,
  boxWidth: 220,
  headWidth: 200,
  boneRise: 54,
  rowHeight: 15,
  boxPadding: 30,
  topAnchors: [300, 520, 740],
  bottomAnchors: [380, 640],
  minWidthClass: "min-w-[42rem]",
};

const PRINT: Geometry = {
  viewWidth: 640,
  boxWidth: 136,
  headWidth: 124,
  boneRise: 34,
  rowHeight: 14,
  boxPadding: 26,
  topAnchors: [186, 322, 458],
  bottomAnchors: [236, 396],
  minWidthClass: "",
};

const JUDGEMENT_COLOR: Record<Judgement, string> = {
  OK: "var(--status-closed)",
  NG: "var(--status-danger)",
  OK_NEED_IMPROVEMENT: "var(--status-pending)",
};

interface BoneGroup {
  readonly category: FishboneCategory;
  readonly factors: readonly RootCauseFactor[];
}

function boxHeight(groups: readonly BoneGroup[], g: Geometry): number {
  const most = Math.max(0, ...groups.map((group) => group.factors.length));

  return g.boxPadding + Math.max(1, most) * g.rowHeight;
}

export function Fishbone({
  value,
  compact = false,
}: {
  value: RootCauseInput;
  /** Dipakai lembar cetak; lihat catatan pada Geometry. */
  compact?: boolean;
}) {
  if (value.factors.length === 0) return null;

  const g = compact ? PRINT : SCREEN;

  const groups = groupByCategory(value);
  const top = groups.slice(0, 3);
  const bottom = groups.slice(3);

  const topBox = boxHeight(top, g);
  const bottomBox = boxHeight(bottom, g);

  const spineY = topBox + g.boneRise;
  const height = spineY + g.boneRise + bottomBox;
  const spineEnd = g.viewWidth - g.headWidth - 16;

  return (
    <figure className="m-0 overflow-x-auto">
      <svg
        viewBox={`0 0 ${g.viewWidth} ${height}`}
        className={`h-auto w-full ${g.minWidthClass}`}
        role="img"
        aria-label={describe(value)}
      >
        {/* Tulang punggung, berakhir di kepala ikan. */}
        <line
          x1={40}
          y1={spineY}
          x2={spineEnd}
          y2={spineY}
          stroke="currentColor"
          strokeWidth={3}
          className="text-nid-ink/70"
        />
        <polygon
          points={`${spineEnd},${spineY - 7} ${spineEnd + 12},${spineY} ${spineEnd},${spineY + 7}`}
          className="fill-nid-ink/70"
        />

        <foreignObject
          x={g.viewWidth - g.headWidth}
          y={spineY - 34}
          width={g.headWidth}
          height={68}
        >
          <div
            className="flex h-full items-center rounded-lg border-2 border-nid-ink bg-secondary px-2 py-1"
          >
            <span className="line-clamp-3 text-[11px] font-semibold leading-tight">
              {value.problem?.trim() || "Akibat"}
            </span>
          </div>
        </foreignObject>

        {top.map((group, index) => (
          <Bone
            key={group.category}
            group={group}
            anchorX={g.topAnchors[index]}
            spineY={spineY}
            boxHeight={topBox}
            side="top"
            geometry={g}
          />
        ))}

        {bottom.map((group, index) => (
          <Bone
            key={group.category}
            group={group}
            anchorX={g.bottomAnchors[index]}
            spineY={spineY}
            boxHeight={bottomBox}
            side="bottom"
            geometry={g}
          />
        ))}
      </svg>
    </figure>
  );
}

function Bone({
  group,
  anchorX,
  spineY,
  boxHeight: height,
  side,
  geometry,
}: {
  group: BoneGroup;
  anchorX: number;
  spineY: number;
  boxHeight: number;
  side: "top" | "bottom";
  geometry: Geometry;
}) {
  const direction = side === "top" ? -1 : 1;
  const boneEndY = spineY + direction * geometry.boneRise;
  // Duri berangkat dari tulang punggung dan berakhir di tengah sisi kotak yang
  // menghadapnya, sehingga garisnya benar-benar bersambung — bukan sekadar berdekatan.
  const boxX = anchorX - geometry.boxWidth;
  const boxY = side === "top" ? boneEndY - height : boneEndY;

  return (
    <g>
      <line
        x1={anchorX}
        y1={spineY}
        x2={boxX + geometry.boxWidth / 2}
        y2={boneEndY}
        stroke="currentColor"
        strokeWidth={2}
        className="text-nid-ink/50"
      />

      <foreignObject x={boxX} y={boxY} width={geometry.boxWidth} height={height}>
        <div
          className="h-full rounded-lg border border-nid-border bg-card px-2 py-1.5"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-nid-orange-700">
            {CATEGORY_LABEL[group.category]}
          </div>

          {group.factors.length === 0 ? (
            <div className="text-[10px] text-muted-foreground">—</div>
          ) : (
            <ul className="m-0 list-none p-0">
              {group.factors.map((factor, index) => (
                <li
                  key={`${factor.item}-${index}`}
                  className="flex items-start gap-1 text-[10px] leading-[14px]"
                >
                  <span
                    aria-hidden
                    className="mt-[5px] size-1 shrink-0 rounded-full"
                    style={{ backgroundColor: JUDGEMENT_COLOR[factor.judgement] }}
                  />
                  <span className={`min-w-0 truncate ${factor.judgement === "NG" ? "font-semibold" : ""}`}>
                    {factor.item}
                  </span>
                  <span className="shrink-0 text-[9px] text-muted-foreground">
                    {JUDGEMENT_SHORT[factor.judgement]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

/** Diagram adalah gambar bagi pembaca layar, jadi isinya diringkas menjadi satu kalimat. */
function describe(value: RootCauseInput): string {
  const parts = groupByCategory(value)
    .filter((group) => group.factors.length > 0)
    .map(
      (group) =>
        `${CATEGORY_LABEL[group.category]}: ` +
        group.factors
          .map((factor) => `${factor.item} (${JUDGEMENT_SHORT[factor.judgement]})`)
          .join(", "),
    );

  return `Diagram tulang ikan untuk ${value.problem?.trim() || "akibat yang dianalisis"}. ${parts.join(". ")}`;
}
